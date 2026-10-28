"""Static hardening checks for Sprint 1 frontend + security configuration.

These act as CI-enforceable regression guards for XSS, SRI pinning, and the
torch pickle fix — cheap greps that would have caught the original findings.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FRONTEND = ROOT / "frontend"
INDEX = (FRONTEND / "index.html").read_text()


def test_cdn_scripts_are_pinned_with_sri():
    script_tags = re.findall(r'<script[^>]+src="(https://[^"]+)"[^>]*>', INDEX)
    cdn_scripts = [s for s in script_tags if "cdn" in s]
    assert cdn_scripts, "expected CDN scripts in index.html"
    for url in cdn_scripts:
        # Pinned either as @major.minor.patch (jsdelivr) or -X.Y.Z.min.js (plotly)
        assert re.search(r"[@-]\d+\.\d+\.\d+", url), f"CDN script not version-pinned: {url}"
    # Every CDN script tag carries integrity + crossorigin
    for tag in re.findall(r'<script[^>]+https://cdn[^>]*>', INDEX):
        assert 'integrity="sha384-' in tag, f"missing SRI: {tag}"
        assert "crossorigin=" in tag, f"missing crossorigin: {tag}"


def test_dompurify_is_loaded():
    assert "dompurify" in INDEX.lower()


def test_marked_parse_only_used_inside_sanitize_wrapper():
    """All marked.parse usage must live in frontend/js/markdown.js."""
    offenders = []
    for js in (FRONTEND / "js").glob("*.js"):
        if js.name == "markdown.js":
            continue
        content = js.read_text()
        if re.search(r"marked\.parse\(", content):
            offenders.append(js.name)
    assert not offenders, f"raw marked.parse outside sanitizer: {offenders}"


def test_vision_uses_weights_only_true():
    vision_src = (ROOT / "backend/app/api/endpoints/vision.py").read_text()
    assert "weights_only=False" not in vision_src
    assert "weights_only=True" in vision_src


def test_semgrep_config_has_no_stale_path():
    semgrep = (ROOT / ".semgrep.yml").read_text()
    assert "ImageClassifier/classifier.py" not in semgrep


def test_no_hardcoded_jwt_secret_default():
    config_src = (ROOT / "backend/app/config.py").read_text()
    assert "portfolio-super-secret-jwt-key" not in config_src


def test_cors_no_wildcard_default():
    config_src = (ROOT / "backend/app/config.py").read_text()
    assert 'CORS_ORIGINS: List[str] = ["*"]' not in config_src


def test_telegram_webhook_verifies_secret_header():
    tg = (ROOT / "backend/app/api/endpoints/telegram.py").read_text()
    assert "X-Telegram-Bot-Api-Secret-Token" in tg
    assert "require_webhook_secret" in tg


def test_chat_endpoints_enforce_ownership():
    chat = (ROOT / "backend/app/api/endpoints/chat.py").read_text()
    assert "get_thread_owner" in chat
    assert chat.count("404_NOT_FOUND") >= 3


def test_agent_sockets_require_handshake_auth():
    for name in ("harry.py", "tour.py"):
        src = (ROOT / f"backend/app/api/endpoints/{name}").read_text()
        assert "close(code=4401)" in src, f"{name} WS must reject unauthenticated handshakes"
