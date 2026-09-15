"""Hugging Face Hub Model Checkpoint Manager.

Downloads transfer learning and YOLO model checkpoints from Hugging Face Hub
dynamically on FastAPI startup (lifespan) instead of bundling heavy binary
weights in the git repository.
"""

import logging
import os
import tempfile
from pathlib import Path
from typing import Dict, List, Optional

from backend.app.config import settings

logger = logging.getLogger(__name__)

# Canonical checkpoint files hosted in Hugging Face repo
CHECKPOINT_FILES = [
    "EfficientNet.ckpt",
    "InceptionV3.ckpt",
    "MobileNetV2.ckpt",
    "Xception.ckpt",
    "LogoYolobest.pt",
]

BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_MODELS_DIR = os.path.join(str(BACKEND_DIR), "models")


def get_models_dir() -> str:
    """Returns the effective models directory, falling back to tempdir if read-only."""
    custom_dir = os.getenv("MODELS_DIR")
    if custom_dir:
        os.makedirs(custom_dir, exist_ok=True)
        return custom_dir

    target_dir = DEFAULT_MODELS_DIR
    try:
        os.makedirs(target_dir, exist_ok=True)
        # Test write permission
        test_file = os.path.join(target_dir, ".write_test")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        return target_dir
    except (OSError, PermissionError):
        fallback_dir = os.path.join(tempfile.gettempdir(), "portfolio_models")
        os.makedirs(fallback_dir, exist_ok=True)
        return fallback_dir


def _ensure_writable_hf_home():
    """Ensures HF_HOME points to a writable directory to prevent permission errors."""
    hf_home = os.getenv("HF_HOME", "")
    if not hf_home or hf_home.startswith("/app") and not os.path.exists("/app"):
        cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "huggingface")
        try:
            os.makedirs(cache_dir, exist_ok=True)
            os.environ["HF_HOME"] = cache_dir
        except Exception:
            os.environ["HF_HOME"] = os.path.join(tempfile.gettempdir(), "hf_cache")


def sync_hf_checkpoints(force: bool = False) -> Dict[str, str]:
    """Downloads missing model checkpoints from Hugging Face Hub.

    Returns:
        Dict mapping checkpoint filename to absolute local file path.
    """
    if not settings.DOWNLOAD_MODELS_ON_STARTUP:
        logger.info("DOWNLOAD_MODELS_ON_STARTUP is disabled; skipping HF checkpoint sync.")
        return {}

    _ensure_writable_hf_home()
    target_dir = get_models_dir()
    repo_id = settings.HF_MODEL_REPO_ID
    token = settings.HF_TOKEN.strip() if settings.HF_TOKEN else None

    logger.info(f"🤗 Checking Hugging Face model checkpoints from '{repo_id}' -> '{target_dir}'...")

    results: Dict[str, str] = {}

    try:
        from huggingface_hub import hf_hub_download
    except ImportError as e:
        logger.warning(f"huggingface_hub package not available: {e}. Cannot download checkpoints.")
        return results

    for filename in CHECKPOINT_FILES:
        dest_path = os.path.join(target_dir, filename)
        if not force and os.path.exists(dest_path) and os.path.getsize(dest_path) > 1024:
            size_mb = os.path.getsize(dest_path) / (1024 * 1024)
            logger.info(f"  ✅ Checkpoint already present: {filename} ({size_mb:.2f} MB)")
            results[filename] = dest_path
            continue

        try:
            logger.info(f"  ⬇️ Downloading {filename} from Hugging Face ({repo_id})...")
            downloaded_path = hf_hub_download(
                repo_id=repo_id,
                filename=filename,
                token=token,
                local_dir=target_dir,
            )
            size_mb = os.path.getsize(downloaded_path) / (1024 * 1024)
            logger.info(f"  🎉 Downloaded {filename} ({size_mb:.2f} MB) -> {downloaded_path}")
            results[filename] = downloaded_path
        except Exception as err:
            logger.warning(f"  ⚠️ Could not download {filename} from HF repo '{repo_id}': {err}")
            if os.path.exists(dest_path):
                results[filename] = dest_path

    return results
