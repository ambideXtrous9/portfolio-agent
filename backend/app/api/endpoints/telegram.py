"""Telegram CI/CD Bot Webhook and Notification Endpoint.

Security model:
- Every mutating endpoint requires the ``X-Telegram-Bot-Api-Secret-Token``
  header (the secret is registered with Telegram during /setup-webhook and
  echoed by Telegram on every webhook delivery).
- Commands with production impact (``/redeploy``) are restricted to the
  chat ids listed in ``TELEGRAM_CHAT_ID`` (comma-separated allowlist).
"""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.core.notify import send_telegram_msg

logger = logging.getLogger("telegram_bot")
router = APIRouter(prefix="/telegram", tags=["Telegram CI/CD Bot"])

TELEGRAM_API_BASE = "https://api.telegram.org/bot"
SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token"


class NotificationRequest(BaseModel):
    message: str
    chat_id: Optional[str] = None
    parse_mode: Optional[str] = "HTML"


def _allowed_chat_ids() -> List[str]:
    """Parses the comma-separated chat-id allowlist from settings."""
    return [c.strip() for c in (settings.TELEGRAM_CHAT_ID or "").split(",") if c.strip()]


def require_webhook_secret(request: Request) -> None:
    """Rejects requests that do not carry the correct Telegram secret token."""
    expected = settings.TELEGRAM_WEBHOOK_SECRET
    if not expected:
        raise HTTPException(
            status_code=503,
            detail="TELEGRAM_WEBHOOK_SECRET is not configured. Set it in the environment and re-run /setup-webhook.",
        )
    provided = request.headers.get(SECRET_HEADER, "")
    import hmac

    if not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=403, detail="Invalid webhook secret token.")


async def trigger_github_redeploy(chat_id: str | int, user_name: str):
    """Triggers GitHub Actions workflow_dispatch for CI/CD."""
    token = settings.GITHUB_DISPATCH_TOKEN
    repo = settings.GITHUB_REPO or "ambideXtrous9/portfolio-agent"
    workflow_id = "ci-cd.yaml"

    if not token:
        await send_telegram_msg(
            chat_id,
            "⚠️ <b>Error:</b> <code>GITHUB_DISPATCH_TOKEN</code> is not configured on the server. "
            "Please configure the GitHub token with <code>workflow</code> permissions.",
        )
        return

    url = f"https://api.github.com/repos/{repo}/actions/workflows/{workflow_id}/dispatches"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Telegram-CICD-Bot",
    }
    payload = {
        "ref": "main",
        "inputs": {
            "environment": "production",
            "chat_id": str(chat_id),
            "trigger_source": f"Telegram (@{user_name})",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code in (204, 200, 201):
                await send_telegram_msg(
                    chat_id,
                    f"✅ <b>GitHub Actions Workflow Dispatched!</b>\n\n"
                    f"📦 <b>Workflow:</b> <code>CI/CD Pipeline &amp; Vercel Deployment</code>\n"
                    f"🌿 <b>Branch:</b> <code>main</code>\n"
                    f"🔗 <b>Track Runs:</b> <a href=\"https://github.com/{repo}/actions\">GitHub Actions Dashboard</a>\n\n"
                    f"<i>I will notify you here at each step: lint check, build, and production deployment!</i>",
                )
            else:
                await send_telegram_msg(
                    chat_id,
                    f"⚠️ <b>GitHub API Error ({resp.status_code}):</b>\n<code>{resp.text[:300]}</code>",
                )
    except Exception as exc:
        await send_telegram_msg(
            chat_id,
            f"❌ <b>Exception triggering redeployment:</b> <code>{str(exc)[:200]}</code>",
        )


@router.post("/webhook")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks) -> Dict[str, Any]:
    """Receives and routes Telegram updates from @GCICD_bot.

    Requests without a valid secret header are rejected. Commands from
    non-allowlisted chats never trigger actions (the /start handshake still
    replies with the chat id so the operator can allowlist it).
    """
    require_webhook_secret(request)

    try:
        data = await request.json()
    except Exception:
        return {"ok": False, "error": "Invalid JSON"}

    message = data.get("message") or data.get("edited_message")
    if not message:
        return {"ok": True, "note": "No message in update"}

    chat = message.get("chat", {})
    chat_id = chat.get("id")
    user_info = message.get("from", {})
    user_name = user_info.get("first_name", "Developer")
    text = (message.get("text") or "").strip()

    if not chat_id:
        return {"ok": True}

    cmd = text.split()[0].lower() if text else ""
    allowlist = _allowed_chat_ids()

    # Unknown chats: only the onboarding handshake is answered; commands are dropped.
    if allowlist and str(chat_id) not in allowlist:
        logger.warning("Rejected Telegram command %r from non-allowlisted chat_id %s", cmd, chat_id)
        if cmd in ("/start", "/help"):
            background_tasks.add_task(
                send_telegram_msg,
                chat_id,
                f"👋 Hi {user_name}! This bot only serves its registered owner.\n"
                f"🆔 Your chat id (for the allowlist): <code>{chat_id}</code>",
            )
        return {"ok": True}

    if cmd in ("/start", "/help"):
        welcome_text = (
            f"👋 <b>Hello, {user_name}!</b>\n\n"
            f"I am your <b>CI/CD Deployment &amp; Monitoring Bot</b> for "
            f"<a href=\"https://github.com/{settings.GITHUB_REPO}\">portfolio-agent</a>.\n\n"
            f"🆔 <b>Your Chat ID:</b> <code>{chat_id}</code>\n\n"
            f"<b>Available Commands:</b>\n"
            f"🚀 <code>/redeploy</code> — Trigger full production build &amp; deploy\n"
            f"📊 <code>/status</code> — Check system health &amp; live deployment\n"
            f"🩺 <code>/health</code> — Probe backend microservices\n"
            f"ℹ️ <code>/info</code> — Repository &amp; CI/CD architecture\n"
            f"❓ <code>/help</code> — Show this manual\n\n"
            f"<i>💡 When deployments run from git push or /redeploy, you will receive step-by-step progress reports right here!</i>"
        )
        background_tasks.add_task(send_telegram_msg, chat_id, welcome_text)

    elif cmd in ("/redeploy", "/deploy"):
        ack_text = (
            f"🚀 <b>Initiating Production Redeployment...</b>\n\n"
            f"📦 <b>Repository:</b> <code>{settings.GITHUB_REPO}</code>\n"
            f"🌿 <b>Branch:</b> <code>main</code>\n"
            f"👤 <b>Requested by:</b> {user_name} (ID: <code>{chat_id}</code>)\n\n"
            f"⏳ <i>Contacting GitHub Actions API...</i>"
        )
        background_tasks.add_task(send_telegram_msg, chat_id, ack_text)
        background_tasks.add_task(trigger_github_redeploy, chat_id, user_name)

    elif cmd == "/status":
        status_text = (
            f"📊 <b>Portfolio System Status</b>\n\n"
            f"🟢 <b>Status:</b> Healthy &amp; Operational\n"
            f"⚡ <b>LLM Brain:</b> {settings.DEFAULT_MODEL}\n"
            f"🎙️ <b>Voice AI:</b> LiveKit WebRTC\n"
            f"☁️ <b>Platform:</b> Vercel Serverless Python"
        )
        background_tasks.add_task(send_telegram_msg, chat_id, status_text)

    elif cmd == "/health":
        health_text = (
            f"🩺 <b>Backend Microservice Health</b>\n\n"
            f"• FastAPI Router: <b>OK</b>\n"
            f"• Groq API: <b>{'Configured' if settings.GROQ_API_KEY else 'Not configured'}</b>\n"
            f"• Pinecone MCP: <b>{'Configured' if settings.PINECONE_API_KEY else 'Not configured'}</b>\n"
            f"• LiveKit Cloud: <b>{'Active' if settings.LIVEKIT_API_KEY else 'Not configured'}</b>\n"
            f"• Telegram Webhook: <b>Connected</b>"
        )
        background_tasks.add_task(send_telegram_msg, chat_id, health_text)

    elif cmd == "/info":
        info_text = (
            f"ℹ️ <b>Portfolio Agent Overview</b>\n\n"
            f"• <b>GitHub Repo:</b> <a href=\"https://github.com/{settings.GITHUB_REPO}\">{settings.GITHUB_REPO}</a>\n"
            f"• <b>CI/CD:</b> GitHub Actions + Vercel CLI Prebuilt\n"
            f"• <b>Author:</b> Sushovan Saha"
        )
        background_tasks.add_task(send_telegram_msg, chat_id, info_text)

    else:
        fallback_text = (
            f"🤔 Unrecognized command <code>{text[:30]}</code>.\n\n"
            f"Use /redeploy to trigger a fresh deployment, or /help to view commands."
        )
        background_tasks.add_task(send_telegram_msg, chat_id, fallback_text)

    return {"ok": True}


@router.post("/notify")
async def send_notification(request: Request, payload: NotificationRequest) -> Dict[str, Any]:
    """Sends a notification to Telegram (used by GitHub Actions or backend services).

    Requires the webhook secret header; arbitrary chat ids are ignored in favor
    of the server-configured allowlist to prevent abuse as an open relay.
    """
    require_webhook_secret(request)
    target_chat = payload.chat_id or (settings.TELEGRAM_CHAT_ID.split(",")[0].strip() if settings.TELEGRAM_CHAT_ID else "")
    if not target_chat:
        return {"ok": False, "error": "No chat_id provided and TELEGRAM_CHAT_ID is unset"}

    success = await send_telegram_msg(target_chat, payload.message, payload.parse_mode or "HTML")
    return {"ok": success}


@router.post("/setup-webhook")
async def setup_webhook(request: Request) -> Dict[str, Any]:
    """Registers this endpoint as the official Telegram webhook for @GCICD_bot.

    Admin operation: requires the webhook secret header and registers it with
    Telegram so subsequent deliveries are authenticated.
    """
    require_webhook_secret(request)

    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not configured"}

    base_url = os.getenv("PORTFOLIO_PUBLIC_BASE_URL", "").rstrip("/")
    if not base_url:
        return {
            "ok": False,
            "error": "PORTFOLIO_PUBLIC_BASE_URL is not configured. Set it to your production URL (e.g. https://sushovan-ai-portfolio.vercel.app).",
        }
    webhook_url = f"{base_url}/api/telegram/webhook"

    url = f"{TELEGRAM_API_BASE}{token}/setWebhook"
    params = {
        "url": webhook_url,
        "drop_pending_updates": True,
        "allowed_updates": ["message", "edited_message"],
    }
    if settings.TELEGRAM_WEBHOOK_SECRET:
        params["secret_token"] = settings.TELEGRAM_WEBHOOK_SECRET

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=params)
            return resp.json()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.get("/webhook-info")
async def webhook_info(request: Request) -> Dict[str, Any]:
    """Checks current webhook registration with Telegram (admin: secret required)."""
    require_webhook_secret(request)

    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not configured"}

    url = f"{TELEGRAM_API_BASE}{token}/getWebhookInfo"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            return resp.json()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}

