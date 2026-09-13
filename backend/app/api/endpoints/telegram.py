"""Telegram CI/CD Bot Webhook and Notification Endpoint."""

import logging
import httpx
from fastapi import APIRouter, Request, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, Any

from backend.app.config import settings

logger = logging.getLogger("telegram_bot")
router = APIRouter(prefix="/telegram", tags=["Telegram CI/CD Bot"])

TELEGRAM_API_BASE = "https://api.telegram.org/bot"


class NotificationRequest(BaseModel):
    message: str
    chat_id: Optional[str] = None
    parse_mode: Optional[str] = "HTML"


async def send_telegram_msg(chat_id: str | int, text: str, parse_mode: str = "HTML") -> bool:
    """Dispatches a message to a Telegram user or channel."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token or not chat_id:
        logger.warning("Telegram Bot Token or Chat ID not configured.")
        return False

    url = f"{TELEGRAM_API_BASE}{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 200:
                return True
            logger.error(f"Telegram API error {resp.status_code}: {resp.text}")
            return False
    except Exception as exc:
        logger.error(f"Failed sending Telegram message: {exc}")
        return False


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
    """Receives and routes Telegram updates from @GCICD_bot."""
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
            f"🌐 <b>Primary URL:</b> https://sushovan-ai-portfolio.vercel.app\n"
            f"🔗 <b>Alias URL:</b> https://ambidextrous-portfolio.vercel.app\n"
            f"⚡ <b>LLM Brain:</b> Groq Llama-3.3-70B\n"
            f"🌲 <b>Vector DB:</b> Pinecone (hpvdb-openai)\n"
            f"🎙️ <b>Voice AI:</b> LiveKit WebRTC\n"
            f"☁️ <b>Platform:</b> Vercel Serverless Python 3.12"
        )
        background_tasks.add_task(send_telegram_msg, chat_id, status_text)

    elif cmd == "/health":
        health_text = (
            f"🩺 <b>Backend Microservice Health</b>\n\n"
            f"• FastAPI Router: <b>OK</b>\n"
            f"• Groq API: <b>Configured</b>\n"
            f"• Pinecone MCP: <b>Configured</b>\n"
            f"• LiveKit Cloud: <b>Active</b>\n"
            f"• Telegram Webhook: <b>Connected</b>"
        )
        background_tasks.add_task(send_telegram_msg, chat_id, health_text)

    elif cmd == "/info":
        info_text = (
            f"ℹ️ <b>Portfolio Agent Overview</b>\n\n"
            f"• <b>GitHub Repo:</b> <a href=\"https://github.com/{settings.GITHUB_REPO}\">{settings.GITHUB_REPO}</a>\n"
            f"• <b>Production App:</b> <a href=\"https://sushovan-ai-portfolio.vercel.app\">sushovan-ai-portfolio.vercel.app</a>\n"
            f"• <b>CI/CD:</b> GitHub Actions + Vercel CLI Prebuilt\n"
            f"• <b>Bot Username:</b> @GCICD_bot\n"
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
async def send_notification(payload: NotificationRequest) -> Dict[str, Any]:
    """Sends a notification to Telegram (used by GitHub Actions or backend services)."""
    target_chat = payload.chat_id or settings.TELEGRAM_CHAT_ID
    if not target_chat:
        return {"ok": False, "error": "No chat_id provided and TELEGRAM_CHAT_ID is unset"}

    success = await send_telegram_msg(target_chat, payload.message, payload.parse_mode or "HTML")
    return {"ok": success}


@router.get("/setup-webhook")
@router.post("/setup-webhook")
async def setup_webhook() -> Dict[str, Any]:
    """Registers this endpoint as the official Telegram webhook for @GCICD_bot."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        return {"ok": False, "error": "TELEGRAM_BOT_TOKEN not configured"}

    webhook_url = "https://sushovan-ai-portfolio.vercel.app/api/telegram/webhook"
    url = f"{TELEGRAM_API_BASE}{token}/setWebhook"
    params = {
        "url": webhook_url,
        "drop_pending_updates": True,
        "allowed_updates": ["message", "edited_message"],
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=params)
            return resp.json()
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.get("/webhook-info")
async def webhook_info() -> Dict[str, Any]:
    """Checks current webhook registration with Telegram."""
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
