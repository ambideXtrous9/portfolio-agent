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

    async def initialize(self) -> None:
        """Initializes PostgreSQL connection pool and creates auth tables."""
        auth_uri = settings.effective_auth_db_uri

        # 1. Always seed the default demo accounts in in-memory fallback
        self._seed_default_demo_accounts()

        if not auth_uri or not PSYCOPG_AVAILABLE:
            logger.info("No PostgreSQL AUTH_DATABASE_URL configured or psycopg unavailable. Using resilient in-memory authentication.")
            self._is_in_memory = True
            return

        logger.info(f"Connecting to Auth PostgreSQL Database at: {auth_uri.split('@')[-1] if '@' in auth_uri else 'local'}")
        connection_kwargs = {
            "autocommit": True,
            "row_factory": dict_row,
            "prepare_threshold": None,
        }

        try:
            self.pool = AsyncConnectionPool(
                conninfo=auth_uri,
                min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE,
                kwargs=connection_kwargs,
                open=False,
            )
            await self.pool.open(wait=True, timeout=settings.DB_POOL_TIMEOUT)

            # Create Schema Tables
            await self._create_tables()

            # Seed demo accounts into PostgreSQL if not present
            await self._seed_postgres_demo_accounts()

            # Sync any cached fallback accounts to PostgreSQL
            await self._sync_fallback_to_postgres()

            self._is_in_memory = False
            logger.info("Auth Database (users, token_blacklist, password_reset_tokens) initialized successfully in PostgreSQL.")

        except Exception as e:
            logger.warning(
                f"Failed to connect to PostgreSQL auth database: {e}. "
                "Enabling In-Memory Auth Fallback mode with seeded accounts."
            )
            if self.pool:
                try:
                    await self.pool.close()
                except Exception:
                    pass
                self.pool = None
            self._is_in_memory = True

    def _seed_default_demo_accounts(self) -> None:
        """Seeds default user accounts into in-memory store."""
        from backend.app.core.security import hash_password

        now = datetime.now(timezone.utc)
        demo_pwd_hash = hash_password("123")

        # Demo user 'abc' (abc@example.com)
        if "abc@example.com" not in self._in_memory_users:
            self._in_memory_users["abc@example.com"] = {
                "id": "11111111-1111-1111-1111-111111111111",
                "email": "abc@example.com",
                "username": "abc",
                "full_name": "Demo Explorer",
                "hashed_password": demo_pwd_hash,
                "is_active": True,
                "is_superuser": True,
                "role": "admin",
                "created_at": now,
                "updated_at": now,
            }
        # Also alias 'abc' as a direct lookup key
        if "abc" not in self._in_memory_users:
            self._in_memory_users["abc"] = self._in_memory_users["abc@example.com"]

    async def _seed_postgres_demo_accounts(self) -> None:
        """Seeds default demo accounts into PostgreSQL table if not present."""
        if not self.pool:
            return
        from backend.app.core.security import hash_password

        demo_pwd_hash = hash_password("123")
        try:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO users (id, email, full_name, hashed_password, is_active, is_superuser, role)
                        VALUES (%s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (email) DO NOTHING
                        """,
                        (
                            "11111111-1111-1111-1111-111111111111",
                            "abc@example.com",
                            "Demo Explorer",
                            demo_pwd_hash,
                            True,
                            True,
                            "admin",
                        ),
                    )
        except Exception as e:
            logger.debug(f"Demo account seeding note: {e}")

    async def _sync_fallback_to_postgres(self) -> None:
        """Syncs cached in-memory users to PostgreSQL if any exist."""
        if not self.pool or not self._in_memory_users:
            return
        try:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    for email, u in self._in_memory_users.items():
                        if "@" not in email:
                            continue
                        await cur.execute(
                            """
                            INSERT INTO users (id, email, full_name, hashed_password, is_active, is_superuser, role)
                            VALUES (%s, %s, %s, %s, %s, %s, %s)
                            ON CONFLICT (email) DO NOTHING
                            """,
                            (
                                u.get("id", str(uuid.uuid4())),
                                email,
                                u.get("full_name", ""),
                                u.get("hashed_password", ""),
                                u.get("is_active", True),
                                u.get("is_superuser", False),
                                u.get("role", "user"),
                            ),
                        )
            logger.info("Synced in-memory accounts into PostgreSQL users table.")
        except Exception as e:
            logger.warning(f"Could not sync fallback users into PostgreSQL: {e}")

    async def _create_tables(self) -> None:
        """Creates auth tables: users, token_blacklist, password_reset_tokens."""
        if not self.pool:
            return

        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
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

    # --------------------------------------------------------------------------
    # User Operations
    # --------------------------------------------------------------------------
    async def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        """Finds user by email or username."""
        normalized = email.strip().lower()

        if self._is_in_memory or not self.pool:
            # Check direct match or username match
            if normalized in self._in_memory_users:
                return self._in_memory_users[normalized]
            for u in self._in_memory_users.values():
                if u.get("email") == normalized or u.get("username") == normalized:
                    return u
            return None

        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT id, email, full_name, hashed_password, is_active, is_superuser, role, created_at, updated_at "
                    "FROM users WHERE LOWER(email) = %s",
                    (normalized,),
                )
                row = await cur.fetchone()
                if row:
                    row["id"] = str(row["id"])
                    return row

                # Also allow login with 'abc' directly if email was abc@example.com
                if "@" not in normalized:
                    await cur.execute(
                        "SELECT id, email, full_name, hashed_password, is_active, is_superuser, role, created_at, updated_at "
                        "FROM users WHERE LOWER(email) LIKE %s",
                        (f"{normalized}@%",),
                    )
                    row = await cur.fetchone()
                    if row:
                        row["id"] = str(row["id"])
                        return row

                return None

    async def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Finds user by UUID identifier."""
        if self._is_in_memory or not self.pool:
            for u in self._in_memory_users.values():
                if str(u.get("id")) == str(user_id):
                    return u
            return None

        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "SELECT id, email, full_name, hashed_password, is_active, is_superuser, role, created_at, updated_at "
                    "FROM users WHERE id::text = %s",
                    (str(user_id),),
                )
                row = await cur.fetchone()
                if row:
                    row["id"] = str(row["id"])
                return row

    async def create_user(
        self,
        email: str,
        full_name: str,
        hashed_password: str,
        role: str = "user",
        is_superuser: bool = False,
    ) -> Dict[str, Any]:
        """Creates a new user record in auth database."""
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

        # Save to memory cache
        self._in_memory_users[email_normalized] = user_record

        if not self._is_in_memory and self.pool:
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
                        row["id"] = str(row["id"])
                        return row

        return user_record

    async def update_user_password(self, user_id: str, new_hashed_password: str) -> bool:
        """Updates user password and timestamp."""
        now = datetime.now(timezone.utc)

        # Update in-memory
        for u in self._in_memory_users.values():
            if str(u.get("id")) == str(user_id):
                u["hashed_password"] = new_hashed_password
                u["updated_at"] = now

        if not self._is_in_memory and self.pool:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "UPDATE users SET hashed_password = %s, updated_at = %s WHERE id::text = %s",
                        (new_hashed_password, now, str(user_id)),
                    )
                    return cur.rowcount > 0

        return True

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

        if not self._is_in_memory and self.pool:
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

    async def is_token_blacklisted(self, token_jti: str) -> bool:
        """Checks if token jti is revoked."""
        if token_jti in self._in_memory_blacklist:
            return True

        if not self._is_in_memory and self.pool:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        "SELECT 1 FROM token_blacklist WHERE token_jti = %s",
                        (token_jti,),
                    )
                    return (await cur.fetchone()) is not None

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

        if not self._is_in_memory and self.pool:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        """
                        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, is_used)
                        VALUES (%s, %s, %s, FALSE)
                        """,
                        (user_id, token_hash, expires_at),
                    )

    async def verify_and_consume_reset_token(self, token_str: str) -> Optional[str]:
        """Validates and marks password reset token as used, returning user_id."""
        token_hash = hashlib.sha256(token_str.encode()).hexdigest()
        now = datetime.now(timezone.utc)

        if self._is_in_memory or not self.pool:
            rec = self._in_memory_reset_tokens.get(token_hash)
            if rec and not rec["is_used"] and rec["expires_at"] > now:
                rec["is_used"] = True
                return rec["user_id"]
            return None

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


auth_db_manager = AuthDatabaseManager()
