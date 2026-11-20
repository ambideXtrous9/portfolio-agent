"""Session stability regressions: JWT signing key, token rotation, auth fallback.

These tests guard the two production failure modes reported from the deployed
site: 401 "Signature verification failed" mid-conversation (per-instance random
signing keys) and surprise sign-outs during normal use.
"""

import os
import subprocess
import sys
from pathlib import Path

from conftest import auth_headers, register_and_login
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]

# Every environment variable that feeds the deterministic JWT key derivation.
_SEED_KEYS = (
    "GROQ_API_KEY",
    "OPENROUTER_API_KEY",
    "PINECONE_API_KEY",
    "LIVEKIT_API_SECRET",
    "TELEGRAM_BOT_TOKEN",
    "HF_TOKEN",
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
)


def _import_secret(env_overrides: dict) -> str:
    """Imports settings in a fresh interpreter and returns the resolved JWT key."""
    env = os.environ.copy()
    for key in _SEED_KEYS:
        env[key] = ""
    env["JWT_SECRET_KEY"] = ""
    env.update(env_overrides)
    proc = subprocess.run(
        [
            sys.executable,
            "-c",
            "from backend.app.config import settings; print(settings.JWT_SECRET_KEY)",
        ],
        cwd=str(REPO_ROOT),
        env=env,
        capture_output=True,
        text=True,
        timeout=90,
    )
    assert proc.returncode == 0, proc.stderr
    lines = [line.strip() for line in proc.stdout.splitlines() if line.strip()]
    assert lines, proc.stdout
    return lines[-1]


# ── Deterministic signing key across serverless instances/restarts ───────────
def test_derived_jwt_secret_is_stable_across_processes():
    first = _import_secret({"GROQ_API_KEY": "deterministic-test-seed-123"})
    second = _import_secret({"GROQ_API_KEY": "deterministic-test-seed-123"})
    assert first == second
    assert len(first) == 64  # sha256 hex digest


def test_derived_jwt_secret_changes_with_seed():
    first = _import_secret({"GROQ_API_KEY": "seed-one"})
    second = _import_secret({"GROQ_API_KEY": "seed-two"})
    assert first != second


def test_local_key_file_is_stable_without_any_seed(tmp_path):
    env = {"TMPDIR": str(tmp_path)}
    first = _import_secret(env)
    second = _import_secret(env)
    assert first == second

    key_file = tmp_path / ".portfolio_jwt_secret"
    assert key_file.exists()
    assert key_file.read_text().strip() == first
    assert (key_file.stat().st_mode & 0o777) == 0o600


# ── Sliding session rotation ─────────────────────────────────────────────────
def test_refresh_issues_a_new_working_token(client: TestClient):
    old_token = register_and_login(client, "rotate@example.com")

    r = client.post("/api/auth/refresh", headers=auth_headers(old_token))
    assert r.status_code == 200, r.text
    body = r.json()
    new_token = body["access_token"]
    assert new_token and new_token != old_token
    assert body["user"]["email"] == "rotate@example.com"

    me = client.get("/api/auth/me", headers=auth_headers(new_token))
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "rotate@example.com"

    # The old token stays valid until natural expiry so in-flight requests and
    # open SSE streams are not broken by a rotation.
    assert client.get("/api/auth/me", headers=auth_headers(old_token)).status_code == 200


def test_refresh_requires_authentication(client: TestClient):
    assert client.post("/api/auth/refresh").status_code == 401


# ── Token source fallback (stale header + valid cookie must not log out) ─────
def test_invalid_header_falls_back_to_valid_cookie(client: TestClient):
    register_and_login(client, "fallback@example.com")
    login = client.post(
        "/api/auth/login",
        json={"email": "fallback@example.com", "password": "Sup3rSecret!x"},
    )
    assert login.status_code == 200, login.text
    valid_token = login.json()["access_token"]

    fresh = TestClient(client.app)
    fresh.cookies.set("access_token", valid_token)
    r = fresh.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-token"})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "fallback@example.com"


def test_valid_header_wins_over_foreign_cookie(client: TestClient):
    register_and_login(client, "header@example.com")
    register_and_login(client, "cookie@example.com")
    header_login = client.post(
        "/api/auth/login",
        json={"email": "header@example.com", "password": "Sup3rSecret!x"},
    )
    cookie_login = client.post(
        "/api/auth/login",
        json={"email": "cookie@example.com", "password": "Sup3rSecret!x"},
    )
    assert header_login.status_code == cookie_login.status_code == 200

    fresh = TestClient(client.app)
    fresh.cookies.set("access_token", cookie_login.json()["access_token"])
    r = fresh.get(
        "/api/auth/me",
        headers=auth_headers(header_login.json()["access_token"]),
    )
    assert r.status_code == 200, r.text
    assert r.json()["email"] == "header@example.com"


# ── Clean dismissal of locally-known but empty threads ───────────────────────
def test_delete_unowned_empty_thread_succeeds(client: TestClient):
    token = register_and_login(client, "cleanup@example.com")
    r = client.delete("/api/chat/threads/tour-never-used", headers=auth_headers(token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["deleted"] is False
    assert body["thread_id"] == "tour-never-used"


def test_delete_unowned_thread_with_messages_is_blocked(client: TestClient):
    from langchain_core.messages import HumanMessage

    import backend.app.core.database as chatdb

    token = register_and_login(client, "cleanup2@example.com")
    norm = chatdb.db_manager.normalize_session_id("hp-legacy-thread")
    chatdb.db_manager._in_memory_chat_history[norm] = [HumanMessage(content="legacy")]

    r = client.delete("/api/chat/threads/hp-legacy-thread", headers=auth_headers(token))
    assert r.status_code == 404, r.text
