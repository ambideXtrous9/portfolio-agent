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


def test_chat_history_restoration_checks_role_field():
    for name in ("harry.js", "tour.js"):
        src = (FRONTEND / "js" / name).read_text()
        assert "msg.role" in src, f"{name} must inspect msg.role returned by ChatMessageItem"


def test_vision_uses_real_groq_vision_models():
    vision_src = (ROOT / "backend/app/api/endpoints/vision.py").read_text()
    assert "qwen/qwen3.8-27b" in vision_src
    assert "qwen/qwen3.6-27b" in vision_src


def test_vision_brand_matching_and_json_extraction():
    from backend.app.api.endpoints.vision import _extract_first_json_dict, _match_brand_class

    assert _match_brand_class("Porsche") == "Porsche"
    assert _match_brand_class("Nike") == "Nike"
    assert _match_brand_class("Coca-Cola") == "Cocacola"
    assert _match_brand_class("McDonald's") == "McDonalds"
    assert _match_brand_class("Red Bull") == "RedBull"
    assert _match_brand_class("Citroën") == "Citroen"
    assert _match_brand_class("Unknown Brand") == "None"

    parsed = _extract_first_json_dict(
        '<think>analyzing logo...</think>\n```json\n[{"brand": "Nike", "confidence": 0.96, "bbox": [20, 30, 80, 70]}]\n```'
    )
    assert parsed is not None
    assert parsed["brand"] == "Nike"
    assert parsed["bbox"] == [20, 30, 80, 70]


def test_vision_classify_all_and_yolo_endpoints(client, monkeypatch):
    import io

    from PIL import Image, ImageDraw

    import backend.app.api.endpoints.vision as vision_mod

    monkeypatch.setattr(
        vision_mod,
        "detect_brand_and_bbox",
        lambda img: ("Porsche", 0.96, [25.0, 20.0, 175.0, 140.0]),
    )

    im = Image.new("RGB", (200, 160), (250, 250, 250))
    draw = ImageDraw.Draw(im)
    draw.rectangle([50, 30, 150, 130], fill=(20, 20, 20))
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    payload = buf.getvalue()

    r_cls = client.post(
        "/api/vision/classify-all",
        files={"file": ("porsche.png", io.BytesIO(payload), "image/png")},
    )
    assert r_cls.status_code == 200, r_cls.text
    cls_body = r_cls.json()
    assert len(cls_body["models"]) == 4
    assert all(m["predicted_class"] == "Porsche" for m in cls_body["models"])
    assert all(m["accuracy"] >= 0.80 for m in cls_body["models"])
    assert all(m["inference_time_seconds"] > 0 for m in cls_body["models"])

    r_yolo = client.post(
        "/api/vision/yolo",
        files={"file": ("porsche.png", io.BytesIO(payload), "image/png")},
    )
    assert r_yolo.status_code == 200, r_yolo.text
    yolo_body = r_yolo.json()
    assert yolo_body["total_detections"] == 1
    assert yolo_body["detections"][0]["label"] == "Porsche"
    assert yolo_body["annotated_image_base64"].startswith("data:image/jpeg;base64,")
