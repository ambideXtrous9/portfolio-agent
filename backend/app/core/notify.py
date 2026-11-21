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


def _send_smtp_email_sync(to_email: str, reset_token: str, expires_minutes: int) -> bool:
    """Sends a password reset token email via SMTP when SMTP_USER and SMTP_PASSWORD are set."""
    import smtplib
    from email.message import EmailMessage

    smtp_user = (settings.SMTP_USER or "").strip()
    smtp_password = (settings.SMTP_PASSWORD or "").strip()
    if not smtp_user or not smtp_password:
        return False

    from_addr = (settings.SMTP_FROM_EMAIL or smtp_user).strip()
    msg = EmailMessage()
    msg["Subject"] = "ambideXtrous AI Portfolio — Your 15-Minute Password Reset Token"
    msg["From"] = from_addr
    msg["To"] = to_email
    msg.set_content(
        f"Hello,\n\n"
        f"A password reset was requested for your ambideXtrous AI Portfolio account ({to_email}).\n\n"
        f"Your 15-minute cryptographic reset token is:\n\n"
        f"{reset_token}\n\n"
        f"This token has also been auto-applied in your open browser window. "
        f"It expires in {expires_minutes} minutes and can only be used once.\n\n"
        f"If you did not request this reset, you can safely ignore this email.\n"
    )

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        return True
    except Exception as exc:
        logger.warning("SMTP password reset email delivery failed: %s", exc)
        return False


async def send_reset_email(to_email: str, reset_token: str, expires_minutes: int = 15) -> bool:
    """Async wrapper for sending password reset emails off the event loop."""
    import asyncio

    if not (settings.SMTP_USER and settings.SMTP_PASSWORD):
        return False
    return await asyncio.to_thread(_send_smtp_email_sync, to_email, reset_token, expires_minutes)
