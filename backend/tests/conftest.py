"""Shared pytest configuration and fixtures.

Runs the FastAPI app in fully in-memory mode (no PostgreSQL, no model downloads,
no external MCP processes) so tests are hermetic and fast.
"""

import os

# ── Isolate environment BEFORE any app module gets imported ──────────────────
os.environ.setdefault("DOWNLOAD_MODELS_ON_STARTUP", "false")
os.environ.setdefault("VERCEL", "1")  # skips HF checkpoint sync + model preload + MCP warmup
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

# Force in-memory DB mode: blank all Postgres discovery sources.
# load_dotenv(override=False) inside config.py respects already-present vars.
for _key in (
    "DATABASE_URL",
    "POSTGRES_URL",
    "AUTH_DATABASE_URL",
    "POSTGRES_URL_NON_POOLING",
    "POSTGRES_PRISMA_URL",
    "POSTGRESQL_URL",
    "NEON_DATABASE_URL",
    "SUPABASE_DATABASE_URL",
    "SUPABASE_DB_URL",
    "POSTGRES_HOST",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "POSTGRES_DATABASE",
    "POSTGRES_DB",
):
    os.environ[_key] = ""

# Deterministic secret for the test run only
os.environ.setdefault("JWT_SECRET_KEY", "test-only-jwt-secret-please-rotate-0987654321")

# LiveKit creds so the authed /voice/token path (JWT issuance) is exercised;
# without these the endpoint honestly reports 503 (not configured).
os.environ.setdefault("LIVEKIT_API_KEY", "test-livekit-key")
os.environ.setdefault("LIVEKIT_API_SECRET", "test-livekit-secret-0123456789abcdef")
os.environ.setdefault("LIVEKIT_URL", "wss://test-livekit.example")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import backend.app.core.auth_database as authdb  # noqa: E402
import backend.app.core.database as chatdb  # noqa: E402
import backend.app.main as app_main  # noqa: E402


def _reset_memory_state() -> None:
    """Cleans in-memory fallback stores between tests."""
    chatdb.db_manager._in_memory_chat_history.clear()
    chatdb.db_manager._in_memory_thread_owners.clear()
    authdb.auth_db_manager._in_memory_users.clear()
    authdb.auth_db_manager._in_memory_blacklist.clear()
    authdb.auth_db_manager._in_memory_reset_tokens.clear()
    chatdb.db_manager._is_in_memory = True
    authdb.auth_db_manager._initialized = True
    authdb.auth_db_manager._in_memory = True


@pytest.fixture(autouse=True)
def clean_state():
    _reset_memory_state()
    yield
    _reset_memory_state()


@pytest.fixture()
def client():
    """Fresh in-process ASGI test client."""
    with TestClient(app_main.app) as c:
        yield c


def register_and_login(
    client: TestClient,
    email: str,
    password: str = "Sup3rSecret!x",
    name: str = "Test User",
) -> str:
    """Signs up (or logs in) and returns the bearer token."""
    r = client.post("/api/auth/signup", json={"email": email, "full_name": name, "password": password})
    if r.status_code == 409:  # already registered earlier in this run
        r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}
