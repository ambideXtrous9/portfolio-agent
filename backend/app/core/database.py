"""PostgreSQL Database Management, Async Connection Pooling, and LangGraph Checkpointing."""

import logging
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage

logger = logging.getLogger(__name__)

# Try importing PostgreSQL & Checkpoint libraries with graceful fallback
try:
    from psycopg_pool import AsyncConnectionPool
    from psycopg import sql
    from langchain_postgres import PostgresChatMessageHistory
    from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
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


class DatabaseManager:
    """Manages PostgreSQL connection pool, chat message history, and LangGraph checkpointer."""

    def __init__(self):
        self.pool: Optional[Any] = None
        self.checkpointer: Any = MemorySaver()
        self._is_in_memory: bool = True
        self._in_memory_chat_history: Dict[str, List[BaseMessage]] = {}

    async def initialize(self) -> None:
        """Initializes the AsyncConnectionPool, creates chat history tables, and sets up AsyncPostgresSaver."""
        db_uri = settings.effective_db_uri

        if not db_uri or not POSTGRES_AVAILABLE:
            logger.info("No PostgreSQL DATABASE_URL / POSTGRES_URL configured or psycopg unavailable. Using in-memory checkpointer & chat history.")
            self._is_in_memory = True
            self.checkpointer = MemorySaver()
            return

        logger.info(f"Connecting to PostgreSQL database at: {db_uri.split('@')[-1] if '@' in db_uri else 'local'}")
        connection_kwargs = {"autocommit": True, "prepare_threshold": None}

        try:
            self.pool = AsyncConnectionPool(
                conninfo=db_uri,
                min_size=settings.DB_POOL_MIN_SIZE,
                max_size=settings.DB_POOL_MAX_SIZE,
                kwargs=connection_kwargs,
                open=False,
            )
            await self.pool.open(wait=True, timeout=settings.DB_POOL_TIMEOUT)

            # 1. Initialize PostgresChatMessageHistory table
            async with self.pool.connection() as conn:
                logger.info(f"Ensuring chat history table '{settings.TABLE_NAME}' exists...")
                await PostgresChatMessageHistory.acreate_tables(conn, settings.TABLE_NAME)

            # 2. Initialize AsyncPostgresSaver checkpointer for LangGraph
            logger.info("Setting up LangGraph AsyncPostgresSaver checkpointer...")
            self.checkpointer = AsyncPostgresSaver(self.pool)
            await self.checkpointer.setup()

            self._is_in_memory = False
            logger.info("PostgreSQL database connection, chat history table, and LangGraph checkpointer initialized successfully.")

        except Exception as e:
            logger.warning(
                f"Failed to connect to PostgreSQL ({e}). "
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
            connection = conn or await self.pool.getconn()
            return PostgresChatMessageHistory(
                settings.TABLE_NAME,
                norm_id,
                async_connection=connection,
            )
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

    @property
    def is_in_memory(self) -> bool:
        """Returns True if running in in-memory fallback mode."""
        return self._is_in_memory


db_manager = DatabaseManager()
