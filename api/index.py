"""Vercel Serverless Function entry point for ambideXtrous AI Portfolio FastAPI backend."""

import os
import sys
from pathlib import Path

# Add project root and backend to sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Import the pre-configured FastAPI app
from backend.app.main import app

# Export app for Vercel Serverless ASGI runtime
__all__ = ["app"]
