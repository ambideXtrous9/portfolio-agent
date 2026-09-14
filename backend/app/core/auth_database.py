"""Authentication Database Management Module (PostgreSQL auth_db with In-Memory Fallback)."""

import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Try importing PostgreSQL async connection pool
try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg_pool import AsyncConnectionPool
    PSYCOPG_AVAILABLE = True
except ImportError as err:
    logger.warning(f"psycopg not available for auth database: {err}")
    PSYCOPG_AVAILABLE = False
    psycopg = None
    dict_row = None
    AsyncConnectionPool = None

from backend.app.config import settings


class AuthDatabaseManager:
    """Manages PostgreSQL connection pool and user/auth tables with in-memory fallback."""

    def __init__(self):
        self.pool: Optional[Any] = None
        self._in_memory_users: Dict[str, Dict[str, Any]] = {}
        self._in_memory_blacklist: set = set()
        self._in_memory_reset_tokens: Dict[str, Dict[str, Any]] = {}
        self._is_in_memory: bool = True
        self._initialized: bool = False
        self.last_error: Optional[str] = None
        self.psycopg_available: bool = PSYCOPG_AVAILABLE

    async def initialize(self, force_retry: bool = False) -> None:
        """Initializes PostgreSQL connection pool and creates auth tables."""
        if self._initialized and not force_retry and not self._is_in_memory:
            return

        auth_uri = settings.effective_auth_db_uri

        if not auth_uri:
            self.last_error = "No PostgreSQL environment variable configured in environment."
            logger.info("No PostgreSQL AUTH_DATABASE_URL configured. Using resilient in-memory authentication.")
            self._is_in_memory = True
            self._initialized = True
            return

        if not PSYCOPG_AVAILABLE:
            self.last_error = "psycopg driver is not available or failed to import."
            logger.warning("psycopg not available for auth database. Using resilient in-memory authentication.")
            self._is_in_memory = True
            self._initialized = True
            return

        logger.info(f"Connecting to Auth PostgreSQL Database at: {auth_uri.split('@')[-1] if '@' in auth_uri else 'local'}")
        connection_kwargs = {
            "autocommit": True,
            "row_factory": dict_row,
            "prepare_threshold": None,
        }

        try:
            if self.pool:
                try:
                    await self.pool.close()
                except Exception:
                    pass
                self.pool = None

            self.pool = AsyncConnectionPool(
                conninfo=auth_uri,
                min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE,
                timeout=settings.DB_POOL_TIMEOUT,
                max_lifetime=300.0,
                max_idle=60.0,
                kwargs=connection_kwargs,
                open=False,
            )
            await self.pool.open(wait=True, timeout=settings.DB_POOL_TIMEOUT)

            # Create Schema Tables
            await self._create_tables()

            self._is_in_memory = False
            self.last_error = None
            self._initialized = True
            logger.info("Auth Database (users, token_blacklist, password_reset_tokens) initialized successfully in PostgreSQL.")

        except Exception as e:
            self.last_error = f"{type(e).__name__}: {str(e)}"
            logger.warning(
                f"Failed to connect to PostgreSQL auth database: {self.last_error}. "
                "Enabling In-Memory Auth Fallback mode."
            )
            if self.pool:
                try:
                    await self.pool.close()
                except Exception:
                    pass
                self.pool = None
            self._is_in_memory = True
            # Keep _initialized False when DB is configured so future requests can retry connecting
            self._initialized = False

    async def _create_tables(self) -> None:
        """Creates auth tables: users, token_blacklist, password_reset_tokens."""
        if not self.pool:
            return

        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                # Ensure pgcrypto extension exists for gen_random_uuid on older PG versions
                try:
                    await cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
                except Exception:
                    pass

                # 1. Users Table
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS users (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email VARCHAR(255) UNIQUE NOT NULL,
                        full_name VARCHAR(150),
                        hashed_password VARCHAR(255) NOT NULL,
                        is_active BOOLEAN DEFAULT TRUE,
                        is_superuser BOOLEAN DEFAULT FALSE,
                        role VARCHAR(50) DEFAULT 'user',
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                """)

                # 2. Token Blacklist Table
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS token_blacklist (
                        id SERIAL PRIMARY KEY,
                        token_jti VARCHAR(255) UNIQUE NOT NULL,
                        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        revoked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_token_blacklist_jti ON token_blacklist(token_jti);
                """)

                # 3. Password Reset Tokens Table
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS password_reset_tokens (
                        id SERIAL PRIMARY KEY,
                        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                        token_hash VARCHAR(255) UNIQUE NOT NULL,
                        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        is_used BOOLEAN DEFAULT FALSE,
                        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE INDEX IF NOT EXISTS idx_reset_token_hash ON password_reset_tokens(token_hash);
                """)

    async def close(self) -> None:
        """Closes the connection pool on application shutdown."""
        if self.pool:
            logger.info("Closing Auth Database connection pool...")
            await self.pool.close()
            self.pool = None

    async def _ensure_connected(self) -> None:
        """Attempts connection if a PostgreSQL URI is configured and pool is inactive."""
        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            try:
                await self.initialize(force_retry=True)
            except Exception as e:
                logger.warning(f"On-demand auth database reconnection failed: {e}")

    # --------------------------------------------------------------------------
    # User Operations
    # --------------------------------------------------------------------------
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Finds user by email address."""
        normalized = email.strip().lower()

        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            await self._ensure_connected()

        if not self._is_in_memory and self.pool:
            try:
                async with self.pool.connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "SELECT id, email, full_name, hashed_password, is_active, is_superuser, role, created_at, updated_at "
                            "FROM users WHERE LOWER(email) = %s",
                            (normalized,),
                        )
                        row = await cur.fetchone()
                        if row:
                            row_dict = dict(row)
                            row_dict["id"] = str(row_dict["id"])
                            return row_dict
                        return None
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Error querying user by email in PostgreSQL: {e}.")
                if not settings.effective_auth_db_uri:
                    return self._in_memory_users.get(normalized)
                return None

        return self._in_memory_users.get(normalized)

    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Finds user by UUID identifier."""
        str_id = str(user_id)

        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            await self._ensure_connected()

        if not self._is_in_memory and self.pool:
            try:
                async with self.pool.connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "SELECT id, email, full_name, hashed_password, is_active, is_superuser, role, created_at, updated_at "
                            "FROM users WHERE id::text = %s",
                            (str_id,),
                        )
                        row = await cur.fetchone()
                        if row:
                            row_dict = dict(row)
                            row_dict["id"] = str(row_dict["id"])
                            return row_dict
                        return None
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Error querying user by id in PostgreSQL: {e}.")
                if not settings.effective_auth_db_uri:
                    for u in self._in_memory_users.values():
                        if str(u.get("id")) == str_id:
                            return u
                return None

        for u in self._in_memory_users.values():
            if str(u.get("id")) == str_id:
                return u
        return None

    async def create_user(
        self,
        email: str,
        full_name: str,
        hashed_password: str,
        role: str = "user",
        is_superuser: bool = False,
    ) -> Dict[str, Any]:
        """Creates a new user record in auth database. Persists directly to PostgreSQL when configured."""
        email_normalized = email.strip().lower()
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)

        user_record = {
            "id": user_id,
            "email": email_normalized,
            "full_name": full_name,
            "hashed_password": hashed_password,
            "is_active": True,
            "is_superuser": is_superuser,
            "role": role,
            "created_at": now,
            "updated_at": now,
        }

        # When a database URI is configured, we MUST persist to PostgreSQL (never silently fake in-memory)
        if settings.effective_auth_db_uri:
            if self._is_in_memory or not self.pool:
                await self._ensure_connected()

            if not self._is_in_memory and self.pool:
                try:
                    async with self.pool.connection() as conn:
                        async with conn.cursor() as cur:
                            await cur.execute(
                                """
                                INSERT INTO users (id, email, full_name, hashed_password, is_active, is_superuser, role, created_at, updated_at)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                                RETURNING id, email, full_name, is_active, is_superuser, role, created_at, updated_at
                                """,
                                (user_id, email_normalized, full_name, hashed_password, True, is_superuser, role, now, now),
                            )
                            row = await cur.fetchone()
                            if row:
                                row_dict = dict(row)
                                row_dict["id"] = str(row_dict["id"])
                                return row_dict
                except Exception as e:
                    self.last_error = f"{type(e).__name__}: {str(e)}"
                    logger.error(f"Failed to persist user in PostgreSQL: {self.last_error}")
                    raise RuntimeError(f"Database error: Failed to save user credentials to PostgreSQL ({self.last_error})")
            else:
                err_detail = self.last_error or "Unable to establish connection to PostgreSQL"
                logger.error(f"PostgreSQL configured but connection pool unavailable: {err_detail}")
                raise RuntimeError(f"Database error: PostgreSQL database is configured but unavailable: {err_detail}")

        # In-memory storage for local offline development only
        self._in_memory_users[email_normalized] = user_record
        return user_record

    async def update_user_password(self, user_id: str, new_hashed_password: str) -> bool:
        """Updates user password and timestamp."""
        now = datetime.now(timezone.utc)

        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            await self._ensure_connected()

        if not self._is_in_memory and self.pool:
            try:
                async with self.pool.connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "UPDATE users SET hashed_password = %s, updated_at = %s WHERE id::text = %s",
                            (new_hashed_password, now, str(user_id)),
                        )
                        return cur.rowcount > 0
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Error updating password in PostgreSQL: {e}")
                return False

        # Update in-memory
        for u in self._in_memory_users.values():
            if str(u.get("id")) == str(user_id):
                u["hashed_password"] = new_hashed_password
                u["updated_at"] = now
                return True
        return False

    # --------------------------------------------------------------------------
    # Token Blacklist Operations (Logout / Revocation)
    # --------------------------------------------------------------------------
    async def blacklist_token(
        self,
        token_jti: str,
        user_id: Optional[str],
        expires_at: datetime,
    ) -> None:
        """Adds token jti to blacklist."""
        self._in_memory_blacklist.add(token_jti)

        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            await self._ensure_connected()

        if not self._is_in_memory and self.pool:
            try:
                async with self.pool.connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            """
                            INSERT INTO token_blacklist (token_jti, user_id, expires_at)
                            VALUES (%s, %s, %s)
                            ON CONFLICT (token_jti) DO NOTHING
                            """,
                            (token_jti, user_id, expires_at),
                        )
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Error blacklisting token in PostgreSQL: {e}")

    async def is_token_blacklisted(self, token_jti: str) -> bool:
        """Checks if token jti is revoked."""
        if token_jti in self._in_memory_blacklist:
            return True

        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            await self._ensure_connected()

        if not self._is_in_memory and self.pool:
            try:
                async with self.pool.connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            "SELECT 1 FROM token_blacklist WHERE token_jti = %s",
                            (token_jti,),
                        )
                        return (await cur.fetchone()) is not None
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Error checking token blacklist in PostgreSQL: {e}")

        return False

    # --------------------------------------------------------------------------
    # Password Reset Operations
    # --------------------------------------------------------------------------
    async def store_reset_token(
        self,
        user_id: str,
        token_str: str,
        expires_at: datetime,
    ) -> None:
        """Stores a password reset token hash."""
        token_hash = hashlib.sha256(token_str.encode()).hexdigest()
        self._in_memory_reset_tokens[token_hash] = {
            "user_id": user_id,
            "expires_at": expires_at,
            "is_used": False,
        }

        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            await self._ensure_connected()

        if not self._is_in_memory and self.pool:
            try:
                async with self.pool.connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            """
                            INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, is_used)
                            VALUES (%s, %s, %s, FALSE)
                            """,
                            (user_id, token_hash, expires_at),
                        )
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Error storing reset token in PostgreSQL: {e}")

    async def verify_and_consume_reset_token(self, token_str: str) -> Optional[str]:
        """Validates and marks password reset token as used, returning user_id."""
        token_hash = hashlib.sha256(token_str.encode()).hexdigest()
        now = datetime.now(timezone.utc)

        if settings.effective_auth_db_uri and (self._is_in_memory or not self.pool):
            await self._ensure_connected()

        if not self._is_in_memory and self.pool:
            try:
                async with self.pool.connection() as conn:
                    async with conn.cursor() as cur:
                        await cur.execute(
                            """
                            SELECT user_id, expires_at, is_used
                            FROM password_reset_tokens
                            WHERE token_hash = %s
                            """,
                            (token_hash,),
                        )
                        row = await cur.fetchone()
                        if not row:
                            return None

                        if row["is_used"] or row["expires_at"] <= now:
                            return None

                        # Mark as used
                        await cur.execute(
                            "UPDATE password_reset_tokens SET is_used = TRUE WHERE token_hash = %s",
                            (token_hash,),
                        )
                        return str(row["user_id"])
            except Exception as e:
                self.last_error = f"{type(e).__name__}: {str(e)}"
                logger.warning(f"Error consuming reset token in PostgreSQL: {e}")

        rec = self._in_memory_reset_tokens.get(token_hash)
        if rec and not rec["is_used"] and rec["expires_at"] > now:
            rec["is_used"] = True
            return rec["user_id"]
        return None

    @property
    def is_in_memory(self) -> bool:
        """Returns True if running in in-memory fallback mode."""
        return self._is_in_memory

    @property
    def configured(self) -> bool:
        """Returns True if PostgreSQL is configured via environment variables."""
        return bool(settings.effective_auth_db_uri)

    @property
    def host_masked(self) -> str:
        """Returns masked host/connection info safe for display."""
        return settings.mask_uri(settings.effective_auth_db_uri)


auth_db_manager = AuthDatabaseManager()

