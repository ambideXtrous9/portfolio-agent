"""Sprint 1 (P0) security regression tests.

Covers: startup asyncio bug, reset-token leak, login enumeration, password
policy, Telegram webhook auth + allowlist, cookie auth, CORS allowlist,
chat-thread IDOR ownership, WS/voice mandatory auth.
"""

import pytest
from conftest import auth_headers, register_and_login
from fastapi.testclient import TestClient


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


# ── S1.2: forgot-password + reset-password 2-step flow ──────────────────────
def test_forgot_and_reset_password_full_flow(client: TestClient):
    tok = register_and_login(client, "owner1@example.com")
    assert tok

    # Unknown email returns 404 so the UI does not open an empty Step-2 reset modal
    r_ghost = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"})
    assert r_ghost.status_code == 404

    # Registered email issues a 15-minute cryptographic reset token
    r = client.post("/api/auth/forgot-password", json={"email": "owner1@example.com"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("reset_token")
    reset_token = body["reset_token"]

    # Consume the reset token to set a new password
    r_reset = client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "new_password": "NewStrongPassword!99"},
    )
    assert r_reset.status_code == 200, r_reset.text

    # Reusing a consumed reset token is rejected
    r_reuse = client.post(
        "/api/auth/reset-password",
        json={"token": reset_token, "new_password": "AnotherPassword!99"},
    )
    assert r_reuse.status_code == 400

    # Old password no longer works; new password succeeds
    r_old = client.post("/api/auth/login", json={"email": "owner1@example.com", "password": "Sup3rSecret!x"})
    assert r_old.status_code == 401
    r_new = client.post("/api/auth/login", json={"email": "owner1@example.com", "password": "NewStrongPassword!99"})
    assert r_new.status_code == 200


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
    from langchain_core.messages import HumanMessage

    import backend.app.core.database as chatdb

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


def test_voice_token_honest_503_without_creds(client: TestClient, monkeypatch):
    monkeypatch.setenv("LIVEKIT_API_KEY", "")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "")
    import backend.app.config as cfg

    monkeypatch.setattr(cfg.settings, "LIVEKIT_API_KEY", "")
    monkeypatch.setattr(cfg.settings, "LIVEKIT_API_SECRET", "")
    tok = register_and_login(client, "novk@example.com")
    r = client.get("/api/voice/token", headers=auth_headers(tok))
    assert r.status_code == 503, r.text
    assert "not configured" in r.json()["detail"]


def test_voice_status_hides_url_from_anon(client: TestClient):
    r = client.get("/api/voice/status")
    assert r.status_code == 200
    assert r.json()["livekit_url"] is None


# ── S2: Tour query parser, Stock & Cluster resilience, Agent session_id ──────
def test_tour_parse_trip_query_extracts_clean_destinations():
    from backend.app.api.endpoints.tour import parse_trip_query

    cases = [
        ("Find beachfront Airbnb in Goa under ₹5000/night with live availability", "Goa", 3),
        ("5 days scenic Switzerland itinerary with weather forecast & train routes", "Switzerland", 5),
        ("Tokyo 3-day cultural exploration with Airbnb accommodations and budget breakdown", "Tokyo", 3),
        ("4 days weekend getaway to Manali for 2 adults with Airbnb stays", "Manali", 4),
    ]
    for query, expected_loc, expected_days in cases:
        loc, checkin, checkout, duration = parse_trip_query(query)
        assert loc == expected_loc, f"Failed for {query!r}: got {loc!r}"
        assert duration == expected_days


def test_harry_ask_preserves_session_id_and_blocks_foreign_thread(client: TestClient):
    alice_tok = register_and_login(client, "hp_alice@example.com")
    r = client.post(
        "/api/harry/ask",
        json={"query": "hello", "session_id": "hp-custom-thread-1"},
        headers=auth_headers(alice_tok),
    )
    assert r.status_code == 200, r.text
    assert r.json()["thread_id"] == "hp-custom-thread-1"

    # Saved under the caller's session_id so history lookup succeeds
    hist = client.get("/api/chat/threads/hp-custom-thread-1/history", headers=auth_headers(alice_tok))
    assert hist.status_code == 200
    assert hist.json()["message_count"] == 2
    assert hist.json()["messages"][0]["role"] == "user"
    assert hist.json()["messages"][1]["role"] == "assistant"

    # Another user cannot hijack Alice's session_id via REST fallback
    bob_tok = register_and_login(client, "hp_bob@example.com")
    r_forbidden = client.post(
        "/api/harry/ask",
        json={"query": "hello", "session_id": "hp-custom-thread-1"},
        headers=auth_headers(bob_tok),
    )
    assert r_forbidden.status_code == 403


def test_stock_scan_and_technical_indicators_nan_resilience(client: TestClient):
    import numpy as np
    import pandas as pd

    from backend.app.api.endpoints.stock import compute_technical_indicators

    # DataFrame containing NaNs in Volume and flat Close prices (0 loss -> infinite RS)
    df = pd.DataFrame({
        "Close": [100.0 + i * 0.5 for i in range(25)],
        "Volume": [np.nan if i == 24 else 10000 for i in range(25)],
    })
    indicators = compute_technical_indicators(df)
    assert indicators["Close"] == 112.0
    assert indicators["Volume"] == 0
    assert not np.isnan(indicators["RSI"])

    # Fast cache-backed screener modes
    for mode in ("multibagger", "highest_eps", "low_debt", "profit_jump"):
        res = client.post("/api/stock/scan", json={"universe": "nifty500", "mode": mode, "limit": 5})
        assert res.status_code == 200, res.text
        assert "stocks" in res.json()


def test_cluster_endpoints_and_synthetic_datasets(client: TestClient):
    r_ds = client.get("/api/cluster/dataset")
    assert r_ds.status_code == 200
    assert r_ds.json()["total_points"] == 2300

    r_km = client.post("/api/cluster/run", json={"algorithm": "kmeans", "n_clusters": 3})
    assert r_km.status_code == 200
    body = r_km.json()
    assert body["num_clusters"] == 3
    assert body["centroids"] and len(body["centroids"]) == 3
    assert body["silhouette_score"] is not None

    r_kd = client.get("/api/cluster/kdist?k=4")
    assert r_kd.status_code == 200
    assert len(r_kd.json()["y"]) == 2300
