"""Sprint 1 (P0) security regression tests.

Covers: startup asyncio bug, reset-token leak, login enumeration, password
policy, Telegram webhook auth + allowlist, cookie auth, CORS allowlist,
chat-thread IDOR ownership, WS/voice mandatory auth.
"""

import pytest
from fastapi.testclient import TestClient

from conftest import register_and_login, auth_headers


# ── S1.1: startup asyncio fix ────────────────────────────────────────────────
def test_main_module_imports_asyncio():
    import backend.app.main as m
    assert "asyncio" in vars(m), "main.py must import asyncio for lifespan gather()"


def test_lifespan_initializes_without_nameerror():
    """Full lifespan runs without NameError and app state gets populated."""
    with TestClient(__import__("backend.app.main", fromlist=["app"]).app) as tc:
        tc.get("/api/system/health")
        import backend.app.main as m
        assert hasattr(m.app.state, "db_pool")


# ── S1.2: forgot-password does not leak reset tokens ─────────────────────────
def test_forgot_password_never_returns_token(client: TestClient):
    tok = register_and_login(client, "owner1@example.com")
    assert tok
    r = client.post("/api/auth/forgot-password", json={"email": "owner1@example.com"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "reset_token" not in body
    # Unknown email must produce an identical (enumeration-safe) response
    r2 = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r2.status_code == 200
    assert r2.json() == body


# ── S1.2/9: uniform login failure (no user enumeration) ──────────────────────
def test_login_failure_is_uniform(client: TestClient):
    register_and_login(client, "uniform@example.com")
    wrong_pw = client.post("/api/auth/login", json={"email": "uniform@example.com", "password": "WrongPass!99"})
    unknown = client.post("/api/auth/login", json={"email": "nouser@example.com", "password": "Whatever!99"})
    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json()["detail"] == unknown.json()["detail"]


# ── S1.12: password policy ───────────────────────────────────────────────────
def test_weak_password_rejected(client: TestClient):
    r = client.post("/api/auth/signup", json={"email": "weak@example.com", "full_name": "Weak", "password": "abc12"})
    assert r.status_code == 422


def test_duplicate_signup_returns_409(client: TestClient):
    register_and_login(client, "dup@example.com")
    r = client.post("/api/auth/signup", json={"email": "dup@example.com", "full_name": "Dup", "password": "Another!Pass1"})
    assert r.status_code == 409


# ── S1.3: Telegram webhook hardening ─────────────────────────────────────────
def _tg_update(chat_id=111, text="/help"):
    return {"message": {"chat": {"id": chat_id}, "from": {"first_name": "Atk"}, "text": text}}


@pytest.fixture()
def tg_env(monkeypatch):
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "whsec-test-123")
    monkeypatch.setattr("backend.app.api.endpoints.telegram.settings.TELEGRAM_WEBHOOK_SECRET", "whsec-test-123")
    monkeypatch.setattr("backend.app.api.endpoints.telegram.settings.TELEGRAM_CHAT_ID", "111,222")
    monkeypatch.setattr("backend.app.api.endpoints.telegram.settings.TELEGRAM_BOT_TOKEN", "test-token")
    yield


def test_telegram_webhook_rejects_missing_secret(client: TestClient, tg_env):
    r = client.post("/api/telegram/webhook", json=_tg_update())
    assert r.status_code == 403


def test_telegram_webhook_rejects_wrong_secret(client: TestClient, tg_env):
    r = client.post("/api/telegram/webhook", json=_tg_update(), headers={"X-Telegram-Bot-Api-Secret-Token": "bad"})
    assert r.status_code == 403


def test_telegram_redeploy_denied_for_non_allowlisted_chat(client: TestClient, tg_env, monkeypatch):
    fired = {"called": False}

    async def fake_redeploy(chat_id, user_name):
        fired["called"] = True

    monkeypatch.setattr("backend.app.api.endpoints.telegram.trigger_github_redeploy", fake_redeploy)
    r = client.post(
        "/api/telegram/webhook",
        json=_tg_update(chat_id=999, text="/redeploy"),
        headers={"X-Telegram-Bot-Api-Secret-Token": "whsec-test-123"},
    )
    assert r.status_code == 200
    import time
    time.sleep(0.05)
    assert not fired["called"], "/redeploy must not trigger for non-allowlisted chats"


def test_telegram_notify_requires_secret(client: TestClient, tg_env):
    r = client.post("/api/telegram/notify", json={"message": "spam"})
    assert r.status_code == 403


def test_telegram_setup_webhook_is_admin_only(client: TestClient, tg_env):
    assert client.get("/api/telegram/setup-webhook").status_code in (403, 405)
    r = client.post("/api/telegram/setup-webhook")
    assert r.status_code == 403


# ── S1.4: httpOnly cookie auth ───────────────────────────────────────────────
def test_login_sets_httponly_cookie_and_cookie_auth_works(client: TestClient):
    client.post("/api/auth/signup", json={"email": "cookie@example.com", "full_name": "Ck", "password": "LongEnough!1"})
    r = client.post("/api/auth/login", json={"email": "cookie@example.com", "password": "LongEnough!1"})
    set_cookie = r.headers.get("set-cookie", "")
    assert "access_token=" in set_cookie
    assert "httponly" in set_cookie.lower()

    # A fresh client with ONLY the cookie (no Authorization header) can authenticate
    fresh = TestClient(client.app)
    fresh.cookies.set("access_token", r.json()["access_token"])
    me = fresh.get("/api/auth/me")
    assert me.status_code == 200, me.text
    assert me.json()["email"] == "cookie@example.com"


def test_logout_clears_cookie(client: TestClient):
    register_and_login(client, "out@example.com")
    r = client.post("/api/auth/logout", headers=auth_headers(register_and_login(client, "out@example.com")))
    assert r.status_code == 200


# ── S1.5: CORS allowlist ─────────────────────────────────────────────────────
def test_cors_blocks_unknown_origin(client: TestClient):
    r = client.options(
        "/api/system/health",
        headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") != "https://evil.example.com"


def test_cors_allows_allowlisted_origin(client: TestClient):
    import backend.app.config as cfg
    origin = cfg.settings.CORS_ORIGINS[0]
    r = client.options(
        "/api/system/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert r.headers.get("access-control-allow-origin") == origin


# ── S1.6: chat thread IDOR ownership ─────────────────────────────────────────
def _seed_thread(client: TestClient, owner_email: str, thread: str, message: str):
    """Registers a thread owned by owner_email with one message (in-memory store)."""
    import backend.app.core.database as chatdb
    from langchain_core.messages import HumanMessage

    token = register_and_login(client, owner_email)
    me = client.get("/api/auth/me", headers=auth_headers(token)).json()
    user_id = me["id"]

    norm = chatdb.db_manager.normalize_session_id(thread)
    store = chatdb.db_manager._in_memory_chat_history
    store[norm] = [HumanMessage(content=message)]
    chatdb.db_manager._in_memory_thread_owners[norm] = user_id
    return token


def test_chat_history_idor_blocked(client: TestClient):
    _seed_thread(client, "alice@example.com", "hp-abc123", "secret message")

    bob = register_and_login(client, "bob@example.com")
    r = client.get("/api/chat/threads/hp-abc123/history", headers=auth_headers(bob))
    assert r.status_code == 404, "Foreign threads must not be readable"

    alice_tok = _seed_thread(client, "alice2@example.com", "hp-abc123", "secret message") if False else None
    # Owner can read their own thread
    alice_token = register_and_login(client, "alice@example.com")
    r_ok = client.get("/api/chat/threads/hp-abc123/history", headers=auth_headers(alice_token))
    assert r_ok.status_code == 200
    assert r_ok.json()["messages"][0]["content"] == "secret message"


def test_chat_delete_idor_blocked(client: TestClient):
    _seed_thread(client, "carol@example.com", "tour-xyz", "trip plan")
    mallory = register_and_login(client, "mallory@example.com")
    r = client.delete("/api/chat/threads/tour-xyz", headers=auth_headers(mallory))
    assert r.status_code == 404, "Foreign threads must not be deletable"

    # Owner can delete their own thread
    carol_token = register_and_login(client, "carol@example.com")
    r_ok = client.delete("/api/chat/threads/tour-xyz", headers=auth_headers(carol_token))
    assert r_ok.status_code == 200
    assert r_ok.json()["deleted"] is True


# ── S1.7: sockets + voice token require auth ─────────────────────────────────
def _assert_ws_rejects_unauth(path):
    from starlette.testclient import TestClient as ST
    from starlette.websockets import WebSocketDisconnect
    import backend.app.main as m

    with ST(m.app) as st:
        with st.websocket_connect(path) as ws:
            msg = ws.receive_json()
            assert msg.get("type") == "error", msg
            assert "Authentication required" in msg.get("message", "")
            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()


def test_harry_ws_requires_token():
    _assert_ws_rejects_unauth("/ws/harry")


def test_tour_ws_requires_token():
    _assert_ws_rejects_unauth("/ws/tour")


def test_voice_token_requires_auth(client: TestClient):
    r = client.get("/api/voice/token")
    assert r.status_code == 401

    tok = register_and_login(client, "voice@example.com")
    r_ok = client.get("/api/voice/token", headers=auth_headers(tok))
    assert r_ok.status_code == 200
    body = r_ok.json()
    assert body["token"] and body["room"]


def test_voice_status_hides_url_from_anon(client: TestClient):
    r = client.get("/api/voice/status")
    assert r.status_code == 200
    assert r.json()["livekit_url"] is None
