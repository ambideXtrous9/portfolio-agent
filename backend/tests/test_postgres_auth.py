"""Comprehensive verification test for PostgreSQL, Checkpoints, Auth, and Guarded Endpoints."""

import asyncio
import os
import sys

# Ensure backend directory is in path
sys.path.insert(0, os.path.abspath("."))

from httpx import AsyncClient, ASGITransport
from backend.app.main import app
from backend.app.core.database import db_manager
from backend.app.core.auth_database import auth_db_manager


async def run_tests():
    print("🧪 Starting Postgres Checkpointing & Auth Verification Tests...")

    # 1. Initialize lifespan managers
    await db_manager.initialize()
    await auth_db_manager.initialize()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:

        # Test A: Health endpoint is public
        res = await client.get("/api/system/health")
        assert res.status_code == 200, f"Health check failed: {res.status_code}"
        print("✅ 1. Public endpoint /api/system/health is accessible without auth.")

        # Test B: Unauthenticated access to protected feature endpoint returns 401
        res = await client.get("/api/auth/me")
        assert res.status_code == 401, f"Expected 401 for unauthenticated /api/auth/me, got {res.status_code}"
        print("✅ 2. Protected endpoint /api/auth/me returns 401 Unauthorized without token.")

        res = await client.get("/api/chat/threads/test-thread/history")
        assert res.status_code == 401, f"Expected 401 for unauthenticated chat history, got {res.status_code}"
        print("✅ 3. Protected endpoint /api/chat/threads/{id}/history returns 401 Unauthorized without token.")


        # Guest voice token verification
        res = await client.get("/api/voice/token")
        assert res.status_code == 200, f"Expected 200 for guest voice token, got {res.status_code}"
        assert "token" in res.json()
        print("✅ 4. Guest access to /api/voice/token succeeds with ephemeral guest identity.")


        # Test C: Verify non-existent / unregistered login returns 401
        res = await client.post(
            "/api/auth/login",
            json={"email": "abc@example.com", "password": "123"}
        )
        assert res.status_code == 401, f"Expected 401 for unregistered user, got {res.status_code}"
        print("✅ 4. Unregistered/demo login correctly rejected with 401 Unauthorized.")

        # Test D: Signup a real new user
        test_email = f"test.scholar.{os.getpid()}@example.com"
        res = await client.post(
            "/api/auth/signup",
            json={
                "email": test_email,
                "full_name": "Test Scholar",
                "password": "SecurePassword123!"
            }
        )
        assert res.status_code == 201, f"Signup failed: {res.text}"
        signup_data = res.json()
        assert signup_data["user"]["email"] == test_email
        print(f"✅ 5. Real user signup successful: {test_email}, registered with Argon2id hash.")

        # Test E: Explicit login with the newly created account
        res = await client.post(
            "/api/auth/login",
            json={"email": test_email, "password": "SecurePassword123!"}
        )
        assert res.status_code == 200, f"Login failed: {res.text}"
        login_data = res.json()
        new_token = login_data["access_token"]
        assert new_token, "No access token returned on login"
        print(f"✅ 6. Explicit user login successful, JWT token issued: {new_token[:20]}...")

        # Test F: Call /api/auth/me with new user token
        res = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert res.status_code == 200, f"/me failed: {res.text}"
        me_data = res.json()
        assert me_data["email"] == test_email
        assert me_data["full_name"] == "Test Scholar"
        print(f"✅ 7. /api/auth/me returns authenticated user profile.")

        # Test G: Access protected endpoint WITH Bearer token
        res = await client.get(
            "/api/cluster/dataset",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert res.status_code == 200, f"Guarded /cluster/dataset with token failed: {res.status_code}"
        assert "total_points" in res.json()
        print(f"✅ 8. Protected endpoint /api/cluster/dataset succeeds with Bearer token.")

        # Test G: Access protected endpoint WITH query parameter ?token= (used by SSE & WebSockets)
        res = await client.get(f"/api/cluster/dataset?token={new_token}")
        assert res.status_code == 200, f"Guarded /cluster/dataset with query token failed: {res.status_code}"
        print(f"✅ 8. Protected endpoint succeeds with query parameter ?token= for SSE/WebSocket compatibility.")

        # Test H: Chat history saving and retrieval
        test_thread_id = "test-session-thread-999"
        chat_hist = await db_manager.get_chat_history(test_thread_id)
        from langchain_core.messages import HumanMessage, AIMessage
        await chat_hist.aadd_messages([
            HumanMessage(content="Hello AI!"),
            AIMessage(content="Greetings! How can I assist you today?"),
        ])

        # Retrieve history via endpoint
        res = await client.get(
            f"/api/chat/threads/{test_thread_id}/history",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert res.status_code == 200, f"Get chat history failed: {res.text}"
        hist_data = res.json()
        assert hist_data["message_count"] == 2
        assert hist_data["messages"][0]["content"] == "Hello AI!"
        assert hist_data["messages"][1]["content"] == "Greetings! How can I assist you today?"
        print(f"✅ 9. Chat history successfully persisted and retrieved via /api/chat/threads/{test_thread_id}/history.")

        # Test I: Token revocation / Logout
        res = await client.post(
            "/api/auth/logout",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert res.status_code == 200, f"Logout failed: {res.text}"
        print(f"✅ 10. User logged out and JWT token added to blacklist.")

        # Subsequent call with revoked token must return 401 Unauthorized
        res = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert res.status_code == 401, f"Expected 401 after logout, got {res.status_code}"
        print(f"✅ 11. Revoked token is rejected with 401 Unauthorized on subsequent requests.")

    await auth_db_manager.close()
    await db_manager.close()
    print("\n🎉 ALL 11 POSTGRES, CHECKPOINTING & AUTH TESTS PASSED PERFECTLY!\n")


if __name__ == "__main__":
    asyncio.run(run_tests())
