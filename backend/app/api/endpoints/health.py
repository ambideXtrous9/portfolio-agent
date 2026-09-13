"""System Health and MCP Diagnostic API endpoints."""

import shutil
from fastapi import APIRouter
from backend.app.config import settings

router = APIRouter(prefix="/system", tags=["System"])


@router.get("/health")
async def health_check():
    """Returns application status, active LLM model, MCP readiness, and database checkpointer info."""
    from backend.app.core.database import db_manager
    from backend.app.core.auth_database import auth_db_manager

    npx_available = shutil.which("npx") is not None
    pinecone_configured = bool(settings.PINECONE_API_KEY)
    groq_configured = bool(settings.GROQ_API_KEY)

    return {
        "status": "healthy",
        "project": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "llm_model": settings.DEFAULT_MODEL,
        "groq_configured": groq_configured,
        "pinecone_configured": pinecone_configured,
        "pinecone_index": settings.PINECONE_INDEX_NAME,
        "npx_runtime_available": npx_available,
        "database": {
            "mode": "postgresql" if not db_manager.is_in_memory else "in-memory",
            "postgres_connected": not db_manager.is_in_memory,
            "checkpointer": "AsyncPostgresSaver" if not db_manager.is_in_memory else "MemorySaver",
            "table": settings.TABLE_NAME,
        },
        "auth": {
            "mode": "postgresql" if not auth_db_manager.is_in_memory else "in-memory",
            "postgres_connected": not auth_db_manager.is_in_memory,
            "jwt_algorithm": settings.JWT_ALGORITHM,
            "token_expire_minutes": settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        },
        "mcp_servers": {
            "airbnb": "available" if npx_available else "missing_npx",
            "pinecone": "ready" if (npx_available and pinecone_configured) else "missing_keys"
        }
    }
