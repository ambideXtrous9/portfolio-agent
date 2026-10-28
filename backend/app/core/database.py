"""PostgreSQL Database Management, Async Connection Pooling, and LangGraph Checkpointing."""

import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

from langchain_core.messages import BaseMessage

logger = logging.getLogger(__name__)

# Try importing PostgreSQL & Checkpoint libraries with graceful fallback
try:
    from langchain_postgres import PostgresChatMessageHistory
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
    from psycopg import sql
    from psycopg_pool import AsyncConnectionPool
    POSTGRES_AVAILABLE = True
except ImportError as err:
    logger.warning(f"PostgreSQL packages not fully installed or available: {err}")
    POSTGRES_AVAILABLE = False
    AsyncConnectionPool = None
    sql = None
    PostgresChatMessageHistory = None
    AsyncPostgresSaver = None

from langgraph.checkpoint.memory import MemorySaver

from backend.app.config import settings


class InMemoryChatHistory:
    """Lightweight in-memory chat message history adapter matching PostgresChatMessageHistory API."""

    def __init__(self, session_id: str, store: Dict[str, List[BaseMessage]]):
        self.session_id = session_id
        self._store = store

    async def aget_messages(self) -> List[BaseMessage]:
        return list(self._store.get(self.session_id, []))

    async def aadd_messages(self, messages: List[BaseMessage]) -> None:
        if self.session_id not in self._store:
            self._store[self.session_id] = []
        self._store[self.session_id].extend(messages)

    async def aclear(self) -> None:
        if self.session_id in self._store:
            del self._store[self.session_id]


class PooledPostgresChatMessageHistory:
    """Leak-free, connection-pooled adapter for PostgresChatMessageHistory."""

    def __init__(self, table_name: str, session_id: str, pool: Any):
        self.table_name = table_name
        self.session_id = session_id
        self.pool = pool

    async def aget_messages(self) -> List[BaseMessage]:
        async with self.pool.connection() as conn:
            history = PostgresChatMessageHistory(
                self.table_name,
                self.session_id,
                async_connection=conn,
            )
            return await history.aget_messages()

    async def aadd_messages(self, messages: List[BaseMessage]) -> None:
        async with self.pool.connection() as conn:
            history = PostgresChatMessageHistory(
                self.table_name,
                self.session_id,
                async_connection=conn,
            )
            await history.aadd_messages(messages)

    async def aclear(self) -> None:
        async with self.pool.connection() as conn:
            history = PostgresChatMessageHistory(
                self.table_name,
                self.session_id,
                async_connection=conn,
            )
            await history.aclear()


class DatabaseManager:
    """Manages PostgreSQL connection pool, chat message history, and LangGraph checkpointer."""

    OWNERS_TABLE = "chat_thread_owners"

    def __init__(self):
        self.pool: Optional[Any] = None
        self.checkpointer: Any = MemorySaver()
        self._is_in_memory: bool = True
        self._in_memory_chat_history: Dict[str, List[BaseMessage]] = {}
        # thread ownership: normalized session_id -> user_id (fallback store)
        self._in_memory_thread_owners: Dict[str, str] = {}
        # unbounded-growth guards for the in-memory fallback stores
        self._MAX_IN_MEMORY_SESSIONS = 500
        self._initialized: bool = False
        self._tables_created: bool = False
        self._last_connect_attempt: float = 0.0
        self._connect_cooldown: float = 30.0
        self.last_error: Optional[str] = None
        self.psycopg_available: bool = POSTGRES_AVAILABLE

    async def initialize(self, force_retry: bool = False) -> None:
        """Initializes the AsyncConnectionPool, creates chat history tables, and sets up AsyncPostgresSaver."""
        if self._initialized and not force_retry and not self._is_in_memory:
            return

        import time
        now = time.time()
        if not force_retry and (now - self._last_connect_attempt < self._connect_cooldown):
            # Enforce cooldown on retries if connection recently failed
            return
        self._last_connect_attempt = now

        db_uri = settings.effective_db_uri

        if not db_uri:
            self.last_error = "No PostgreSQL DATABASE_URL / POSTGRES_URL configured in environment."
            logger.info("No PostgreSQL DATABASE_URL / POSTGRES_URL configured. Using in-memory checkpointer & chat history.")
            self._is_in_memory = True
            self.checkpointer = MemorySaver()
            self._initialized = True
            return

        if not POSTGRES_AVAILABLE:
            self.last_error = "PostgreSQL drivers (psycopg, psycopg_pool) not available."
            logger.warning("PostgreSQL packages not available. Using in-memory checkpointer & chat history.")
            self._is_in_memory = True
            self.checkpointer = MemorySaver()
            self._initialized = True
            return

        logger.info(f"Connecting to PostgreSQL database at: {db_uri.split('@')[-1] if '@' in db_uri else 'local'}")
        connection_kwargs = {"autocommit": True, "prepare_threshold": None}

        try:
            if self.pool:
                try:
                    await self.pool.close()
                except Exception:
                    pass
                self.pool = None

            self.pool = AsyncConnectionPool(
                conninfo=db_uri,
                min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE,
                timeout=settings.DB_POOL_TIMEOUT,
                max_lifetime=300.0,
                max_idle=60.0,
                kwargs=connection_kwargs,
                open=False,
            )
            await self.pool.open(wait=True, timeout=settings.DB_POOL_TIMEOUT)

            # 1. Initialize PostgresChatMessageHistory table (only once)
            if not self._tables_created:
                async with self.pool.connection() as conn:
                    logger.info(f"Ensuring chat history table '{settings.TABLE_NAME}' exists...")
                    await PostgresChatMessageHistory.acreate_tables(conn, settings.TABLE_NAME)
                    # Performance index: session_id lookups/deletes were doing seq scans
                    await conn.execute(
                        sql.SQL(
                            "CREATE INDEX IF NOT EXISTS {} ON {} (session_id)"
                        ).format(
                            sql.Identifier(f"idx_{settings.TABLE_NAME}_session_id"),
                            sql.Identifier(settings.TABLE_NAME),
                        )
                    )
                    # Thread ownership registry (IDOR protection)
                    await conn.execute(
                        sql.SQL(
                            "CREATE TABLE IF NOT EXISTS {} ("
                            "session_id TEXT PRIMARY KEY, "
                            "user_id TEXT NOT NULL, "
                            "created_at TIMESTAMPTZ NOT NULL DEFAULT now())"
                        ).format(sql.Identifier(self.OWNERS_TABLE))
                    )

            # 2. Initialize AsyncPostgresSaver checkpointer for LangGraph
            logger.info("Setting up LangGraph AsyncPostgresSaver checkpointer...")
            self.checkpointer = AsyncPostgresSaver(self.pool)
            if not self._tables_created:
                await self.checkpointer.setup()
                self._tables_created = True

            self._is_in_memory = False
            self.last_error = None
            self._initialized = True
            logger.info("PostgreSQL database connection, chat history table, and LangGraph checkpointer initialized successfully.")

        except Exception as e:
            self.last_error = f"{type(e).__name__}: {str(e)}"
            logger.warning(
                f"Failed to connect to PostgreSQL: {self.last_error}. "
                "Gracefully falling back to in-memory checkpointer and chat history for development/preview."
            )
            if self.pool:
                try:
                    await self.pool.close()
                except Exception:
                    pass
            self.pool = None
            self._is_in_memory = True
            self.checkpointer = MemorySaver()
            self._initialized = False

    async def close(self) -> None:
        """Closes the AsyncConnectionPool on application shutdown."""
        if self.pool and not self._is_in_memory:
            try:
                await self.pool.close()
                logger.info("PostgreSQL database connection pool closed successfully.")
            except Exception as e:
                logger.warning(f"Error while closing database connection pool: {e}")

    @asynccontextmanager
    async def get_connection(self):
        """Context manager yielding a pooled connection."""
        if not self.pool or self._is_in_memory:
            raise RuntimeError("Database pool is not connected. Check DATABASE_URL configuration.")
        async with self.pool.connection() as conn:
            yield conn

    @staticmethod
    def normalize_session_id(session_id: str) -> str:
        """Ensures session_id is a valid UUID string required by PostgresChatMessageHistory."""
        import uuid
        try:
            uuid.UUID(str(session_id))
            return str(session_id)
        except (ValueError, TypeError):
            return str(uuid.uuid5(uuid.NAMESPACE_DNS, str(session_id)))

    async def get_chat_history(self, session_id: str, conn=None):
        """Returns a chat message history instance (Postgres or In-Memory fallback)."""
        norm_id = self.normalize_session_id(session_id)
        if not self._is_in_memory and self.pool and PostgresChatMessageHistory:
            if conn is not None:
                return PostgresChatMessageHistory(
                    settings.TABLE_NAME,
                    norm_id,
                    async_connection=conn,
                )
            return PooledPostgresChatMessageHistory(
                settings.TABLE_NAME,
                norm_id,
                self.pool,
            )
        # Guard against unbounded growth in the in-memory fallback
        if len(self._in_memory_chat_history) >= self._MAX_IN_MEMORY_SESSIONS:
            try:
                oldest = next(iter(self._in_memory_chat_history))
                self._in_memory_chat_history.pop(oldest, None)
                self._in_memory_thread_owners.pop(oldest, None)
            except StopIteration:
                pass
        return InMemoryChatHistory(norm_id, self._in_memory_chat_history)

    async def delete_chat_session(self, session_id: str) -> bool:
        """Deletes all messages for a specific session_id from the chat history table."""
        norm_id = self.normalize_session_id(session_id)
        if self._is_in_memory or not self.pool:
            if norm_id in self._in_memory_chat_history:
                del self._in_memory_chat_history[norm_id]
                return True
            return False

        query = sql.SQL("DELETE FROM {} WHERE session_id = %s").format(
            sql.Identifier(settings.TABLE_NAME)
        )
        async with self.pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(query, (norm_id,))
                deleted_rows = cur.rowcount
                return deleted_rows > 0

    async def claim_chat_thread(self, session_id: str, user_id: str) -> bool:
        """
        Registers thread ownership for the given user (first claim wins).

        Returns True when this call created the ownership record. Never raises
        for storage issues: falls back to the in-process registry.
        """
        norm_id = self.normalize_session_id(session_id)
        if self._is_in_memory or not self.pool or not POSTGRES_AVAILABLE:
            if norm_id in self._in_memory_thread_owners:
                return False
            self._in_memory_thread_owners[norm_id] = str(user_id)
            return True
        try:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        sql.SQL("INSERT INTO {} (session_id, user_id) VALUES (%s, %s) ON CONFLICT (session_id) DO NOTHING").format(
                            sql.Identifier(self.OWNERS_TABLE)
                        ),
                        (norm_id, str(user_id)),
                    )
                    return cur.rowcount > 0
        except Exception as e:
            logger.warning("Thread ownership claim fell back to memory: %s", e)
            if norm_id in self._in_memory_thread_owners:
                return False
            self._in_memory_thread_owners[norm_id] = str(user_id)
            return True

    async def get_thread_owner(self, session_id: str) -> Optional[str]:
        """Returns the owning user_id of a thread, or None when unclaimed."""
        norm_id = self.normalize_session_id(session_id)
        if self._is_in_memory or not self.pool or not POSTGRES_AVAILABLE:
            return self._in_memory_thread_owners.get(norm_id)
        try:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        sql.SQL("SELECT user_id FROM {} WHERE session_id = %s").format(sql.Identifier(self.OWNERS_TABLE)),
                        (norm_id,),
                    )
                    row = await cur.fetchone()
                    return row[0] if row else None
        except Exception as e:
            logger.warning("Thread ownership lookup fell back to memory: %s", e)
            return self._in_memory_thread_owners.get(norm_id)

    async def ensure_thread_access(self, session_id: str, user_id: str) -> None:
        """
        Guarantees the user owns the thread:
        - already owned by the user → no-op
        - unclaimed → claimed by this user
        - owned by someone else → raises PermissionError
        """
        owner = await self.get_thread_owner(session_id)
        if owner is not None and owner != str(user_id):
            raise PermissionError("Thread belongs to another user.")
        await self.claim_chat_thread(session_id, user_id)

    async def delete_thread_ownership(self, session_id: str) -> None:
        """Removes the ownership record alongside thread deletion."""
        norm_id = self.normalize_session_id(session_id)
        self._in_memory_thread_owners.pop(norm_id, None)
        if self._is_in_memory or not self.pool or not POSTGRES_AVAILABLE:
            return
        try:
            async with self.pool.connection() as conn:
                async with conn.cursor() as cur:
                    await cur.execute(
                        sql.SQL("DELETE FROM {} WHERE session_id = %s").format(sql.Identifier(self.OWNERS_TABLE)),
                        (norm_id,),
                    )
        except Exception as e:
            logger.warning("Thread ownership delete note: %s", e)

    @property
    def is_in_memory(self) -> bool:
        """Returns True if running in in-memory fallback mode."""
        return self._is_in_memory

    @property
    def configured(self) -> bool:
        """Returns True if PostgreSQL is configured via environment variables."""
        return bool(settings.effective_db_uri)

    @property
    def host_masked(self) -> str:
        """Returns masked host/connection info safe for display."""
        return settings.mask_uri(settings.effective_db_uri)


db_manager = DatabaseManager()

