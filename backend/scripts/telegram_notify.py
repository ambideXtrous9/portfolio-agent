#!/usr/bin/env python3
"""
Telegram Notification Helper for GitHub Actions CI/CD Pipeline.
Sends rich HTML formatted progress updates to Telegram @GCICD_bot.
"""

import os
import sys
import json
import argparse
import urllib.request
import urllib.error


def send_telegram_message(token: str, chat_id: str, message: str) -> bool:
    """Dispatches an HTML formatted message to Telegram Bot API."""
    if not token or not chat_id:
        print("ℹ️ Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not provided.")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "User-Agent": "GitHubActions-CI/2.0"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print("✅ Telegram notification delivered successfully.")
                return True
            print(f"⚠️ Telegram API responded with status {response.status}")
            return False
    except urllib.error.HTTPError as err:
        error_body = err.read().decode("utf-8", errors="replace")
        print(f"⚠️ Telegram HTTP error {err.code}: {error_body}")
        return False
    except Exception as exc:
        print(f"⚠️ Telegram connection error: {exc}")
        return False


def build_message(event: str, extra_url: str = "") -> str:
    """Builds rich HTML status messages based on the pipeline event."""
    repo = os.environ.get("GITHUB_REPOSITORY", "ambideXtrous9/portfolio-agent")
    branch = os.environ.get("BRANCH") or os.environ.get("GITHUB_REF_NAME", "main")
    sha = os.environ.get("SHA") or os.environ.get("GITHUB_SHA", "unknown")
    short_sha = sha[:7] if sha != "unknown" else "unknown"
    actor = os.environ.get("ACTOR") or os.environ.get("GITHUB_ACTOR", "ambideXtrous9")
    event_name = os.environ.get("EVENT_NAME") or os.environ.get("GITHUB_EVENT_NAME", "push")
    commit_msg = os.environ.get("COMMIT_MSG", "").strip() or "Deployment update"
    first_line_msg = commit_msg.splitlines()[0][:100] if commit_msg else "Manual trigger"
    
    server_url = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    run_id = os.environ.get("GITHUB_RUN_ID", "")
    run_url = os.environ.get("RUN_URL") or (f"{server_url}/{repo}/actions/runs/{run_id}" if run_id else f"{server_url}/{repo}/actions")

    if event == "pipeline_start":
        return (
            f"🚀 <b>CI/CD Pipeline Started</b>\n\n"
            f"📦 <b>Repository:</b> <code>{repo}</code>\n"
            f"🌿 <b>Branch:</b> <code>{branch}</code>\n"
            f"👤 <b>Triggered By:</b> {actor} (<code>{event_name}</code>)\n"
            f"📝 <b>Commit:</b> <code>{short_sha}</code> — <i>{first_line_msg}</i>\n\n"
            f"🔗 <a href=\"{run_url}\">View Live Pipeline on GitHub</a>\n"
            f"⏳ <i>Running lint checks, backend syntax validation, and frontend asset verification...</i>"
        )

    elif event == "validation_pass":
        return (
            f"✅ <b>Code &amp; Config Integrity Passed!</b>\n\n"
            f"• <b>Python Backend:</b> Syntax compiled cleanly\n"
            f"• <b>vercel.json:</b> Configuration schema valid\n"
            f"• <b>Frontend SPA:</b> HTML / CSS / JS assets verified\n\n"
            f"⏳ <i>Proceeding to Vercel Serverless build &amp; production deployment...</i>"
        )

    elif event == "validation_fail":
        return (
            f"❌ <b>CI Validation Failed!</b>\n\n"
            f"📦 <b>Repository:</b> <code>{repo}</code>\n"
            f"🔍 <b>Commit:</b> <code>{short_sha}</code>\n"
            f"⚠️ Syntax, schema, or asset integrity checks encountered errors.\n\n"
            f"🚨 <a href=\"{run_url}\">Inspect Failure Logs</a>"
        )

    elif event == "deploy_start":
        return (
            f"📦 <b>Deploying to Vercel Production...</b>\n\n"
            f"• Pulling Vercel project configuration\n"
            f"• Setting up Node.js 20 &amp; uv Python 3.12 runtime\n"
            f"• Generating optimized serverless output bundle\n\n"
            f"⏳ <i>Deploying live to Vercel edge network...</i>"
        )

    elif event == "deploy_success":
        deployment_instance = extra_url or "https://sushovan-ai-portfolio.vercel.app"
        return (
            f"🎉 <b>Production Deployment Succeeded!</b>\n\n"
            f"🌐 <b>Production URL:</b>\n"
            f"👉 <a href=\"https://sushovan-ai-portfolio.vercel.app\">https://sushovan-ai-portfolio.vercel.app</a>\n\n"
            f"🔗 <b>Alias Domain:</b>\n"
            f"👉 <a href=\"https://ambidextrous-portfolio.vercel.app\">https://ambidextrous-portfolio.vercel.app</a>\n\n"
            f"📦 <b>Deployment Instance:</b> <code>{deployment_instance}</code>\n"
            f"📝 <b>Commit:</b> <code>{short_sha}</code>\n"
            f"⚡ <b>Status:</b> All agents &amp; endpoints are live and operational!\n\n"
            f"<i>💡 You can trigger a new redeployment anytime by sending /redeploy to @GCICD_bot.</i>"
        )

    elif event == "deploy_fail":
        return (
            f"🚨 <b>Vercel Production Deployment Failed!</b>\n\n"
            f"📦 <b>Repository:</b> <code>{repo}</code>\n"
            f"🔍 <b>Commit:</b> <code>{short_sha}</code>\n"
            f"⚠️ An error occurred during the Vercel build or deploy step.\n\n"
            f"🔗 <a href=\"{run_url}\">View Detailed Error Logs on GitHub</a>"
        )

    return f"ℹ️ <b>CI/CD Update:</b> {event} (<code>{short_sha}</code>)"


def main():
    parser = argparse.ArgumentParser(description="Send CI/CD updates to Telegram.")
    parser.add_argument(
        "--event",
        required=True,
        choices=[
            "pipeline_start",
            "validation_pass",
            "validation_fail",
            "deploy_start",
            "deploy_success",
            "deploy_fail",
        ],
        help="CI/CD Event stage to announce",
    )
    parser.add_argument("--url", default="", help="Optional deployment URL or link")
    args = parser.parse_args()

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()

    message = build_message(args.event, args.url)
    send_telegram_message(token, chat_id, message)


if __name__ == "__main__":
    main()
