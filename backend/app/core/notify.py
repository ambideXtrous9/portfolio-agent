"""Shared Telegram notification helper.

Single implementation used by both the Telegram CI/CD endpoints and the auth
module (password-reset delivery), replacing the previous duplicate copies.
"""

import logging

import httpx

from backend.app.config import settings

logger = logging.getLogger("telegram_notify")

TELEGRAM_API_BASE = "https://api.telegram.org/bot"


async def send_telegram_msg(chat_id: str | int, text: str, parse_mode: str = "HTML") -> bool:
    """Dispatches a message to a Telegram user or channel."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token or not chat_id:
        logger.warning("Telegram Bot Token or Chat ID not configured; message not sent.")
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
            logger.error("Telegram API error %s: %s", resp.status_code, resp.text)
            return False
    except Exception as exc:
        logger.error("Failed sending Telegram message: %s", exc)
        return False
