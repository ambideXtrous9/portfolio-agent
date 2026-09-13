"""FastAPI Application Entry Point."""

import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.config import settings
from backend.app.api.router import api_router
from backend.app.core.database import db_manager
from backend.app.core.auth_database import auth_db_manager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 ambideXtrous AI Portfolio FastAPI backend starting up...")
    print(f"🔧 Model: {settings.DEFAULT_MODEL}")
    print(f"🌲 Pinecone Index: {settings.PINECONE_INDEX_NAME}")

    # 1. Initialize PostgreSQL Connection Pool, Chat History & LangGraph Checkpointer
    try:
        await db_manager.initialize()
        app.state.db_pool = db_manager.pool
        app.state.checkpointer = db_manager.checkpointer
    except Exception as e:
        print(f"⚠️ Database initialization note: {e}")

    # 2. Initialize PostgreSQL Authentication Database & Tables
    try:
        await auth_db_manager.initialize()
        app.state.auth_db_pool = auth_db_manager.pool
    except Exception as e:
        print(f"⚠️ Auth database initialization note: {e}")

    # 3. Preload models & services before server starts accepting traffic
    try:
        from backend.app.api.endpoints.vision import preload_vision_models
        preload_vision_models()
    except Exception as e:
        print(f"⚠️ Vision models preloading note: {e}")

    try:
        from backend.app.core.mcp import get_mcp_client
        get_mcp_client()
        print("🌲 MultiServerMCPClient pre-initialized for Airbnb and Pinecone")
    except Exception as e:
        print(f"⚠️ MCP client pre-initialization note: {e}")

    print("✨ All databases, models, and background services initialized. Backend is ready!")
    yield
    print("🛑 ambideXtrous AI Portfolio FastAPI backend shutting down...")
    try:
        await auth_db_manager.close()
        await db_manager.close()
    except Exception as e:
        print(f"⚠️ Shutdown resource cleanup note: {e}")


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API endpoints (both with and without /api prefix for seamless Vercel Serverless routing)
app.include_router(api_router, prefix=settings.API_V1_STR)
if settings.API_V1_STR != "":
    app.include_router(api_router, prefix="")

# Direct WebSocket route aliases
from backend.app.api.endpoints.tour import websocket_tour
from backend.app.api.endpoints.harry import websocket_harry
app.websocket("/ws/tour")(websocket_tour)
app.websocket("/ws/harry")(websocket_harry)

# Serve Frontend static assets if available
if os.path.exists(FRONTEND_DIR):
    # Serve assets directory if present
    assets_path = os.path.join(FRONTEND_DIR, "assets")
    if os.path.exists(assets_path):
        app.mount("/assets", StaticFiles(directory=assets_path), name="assets")
        
    css_path = os.path.join(FRONTEND_DIR, "css")
    if os.path.exists(css_path):
        app.mount("/css", StaticFiles(directory=css_path), name="css")

    js_path = os.path.join(FRONTEND_DIR, "js")
    if os.path.exists(js_path):
        app.mount("/js", StaticFiles(directory=js_path), name="js")

    @app.get("/", include_in_schema=False)
    async def serve_index():
        index_file = os.path.join(FRONTEND_DIR, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Welcome to ambideXtrous AI Portfolio API. Visit /docs for OpenAPI specifications."}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
