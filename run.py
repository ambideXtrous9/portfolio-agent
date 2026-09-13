"""Application Runner for ambideXtrous AI Portfolio (FastAPI + Decoupled SPA)."""

import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    reload = os.getenv("RELOAD", "false").lower() in ("true", "1", "yes")
    print("=" * 65)
    print("🚀 ambideXtrous AI Portfolio Starting...")
    print(f"🌐 Application URL: http://localhost:{port}")
    print(f"📖 Swagger OpenAPI Docs: http://localhost:{port}/docs")
    print("=" * 65)
    uvicorn.run("backend.app.main:app", host=host, port=port, reload=reload)
