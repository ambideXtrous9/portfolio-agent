"""Application Configuration using Pydantic Settings."""

import os
from typing import List
from dotenv import load_dotenv
from pydantic_settings import BaseSettings

load_dotenv()


class Settings(BaseSettings):
    PROJECT_NAME: str = "ambideXtrous AI Portfolio"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api"
    
    # Model configuration
    DEFAULT_MODEL: str = os.getenv("DEFAULT_MODEL", "openai/gpt-oss-120b")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OLLAMA_API_KEY: str = os.getenv("OLLAMA_API_KEY", "")
    
    # Hugging Face Model Hub
    HF_TOKEN: str = os.getenv("HF_TOKEN", os.getenv("HUGGING_FACE_HUB_TOKEN", ""))
    HF_MODEL_REPO_ID: str = os.getenv("HF_MODEL_REPO_ID", "ambideXtrous9/brand-logo-classifiers")
    DOWNLOAD_MODELS_ON_STARTUP: bool = os.getenv("DOWNLOAD_MODELS_ON_STARTUP", "true").lower() in ("1", "true", "yes")

    # MCP & Vector DB
    PINECONE_API_KEY: str = os.getenv("PINECONE_API_KEY", "")
    PINECONE_INDEX_NAME: str = os.getenv("PINECONE_INDEX_NAME", "hpvdb-openai")
    WEATHER_API_KEY: str = os.getenv("WEATHER_API_KEY", "")
    
    # Tracing
    LANGFUSE_PUBLIC_KEY: str = os.getenv("LANGFUSE_PUBLIC_KEY", "")
    LANGFUSE_SECRET_KEY: str = os.getenv("LANGFUSE_SECRET_KEY", "")
    LANGFUSE_HOST: str = os.getenv("LANGFUSE_HOST", "https://us.cloud.langfuse.com")
    
    # LiveKit Voice Agent
    LIVEKIT_URL: str = os.getenv("LIVEKIT_URL", "wss://my-voice-agent-6wug4ta7.livekit.cloud")
    LIVEKIT_API_KEY: str = os.getenv("LIVEKIT_API_KEY", "")
    LIVEKIT_API_SECRET: str = os.getenv("LIVEKIT_API_SECRET", "")
    
    # Telegram Bot & CI/CD Automation
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.getenv("TELEGRAM_CHAT_ID", "")
    GITHUB_DISPATCH_TOKEN: str = os.getenv("GITHUB_DISPATCH_TOKEN", "")
    GITHUB_REPO: str = os.getenv("GITHUB_REPO", "ambideXtrous9/portfolio-agent")
    
    # PostgreSQL Database & LangGraph Checkpointing
    DATABASE_URL: str = os.getenv("DATABASE_URL", os.getenv("POSTGRES_URL", ""))
    POSTGRES_URL: str = os.getenv("POSTGRES_URL", "")
    AUTH_DATABASE_URL: str = os.getenv("AUTH_DATABASE_URL", "")
    DB_POOL_MIN_SIZE: int = int(os.getenv("DB_POOL_MIN_SIZE", "0"))
    DB_POOL_MAX_SIZE: int = int(os.getenv("DB_POOL_MAX_SIZE", "10"))
    DB_POOL_TIMEOUT: float = float(os.getenv("DB_POOL_TIMEOUT", "4.0"))
    TABLE_NAME: str = os.getenv("TABLE_NAME", "portfolio_chat_history")

    # Security & Authentication (Argon2 / JWT)
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "portfolio-super-secret-jwt-key-2026-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))
    RESET_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", "15"))

    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    def _resolve_uri(self, *preferred_keys: str) -> str:
        """Discovers and normalizes PostgreSQL URI across all common cloud/Vercel conventions."""
        candidates = list(preferred_keys) + [
            "AUTH_DATABASE_URL",
            "DATABASE_URL",
            "POSTGRES_URL_NON_POOLING",
            "POSTGRES_URL",
            "POSTGRES_PRISMA_URL",
            "POSTGRESQL_URL",
            "NEON_DATABASE_URL",
            "SUPABASE_DATABASE_URL",
            "SUPABASE_DB_URL",
        ]
        uri = ""
        for cand in candidates:
            if not cand:
                continue
            # If cand looks like a URI directly, use it
            if "://" in cand:
                uri = cand.strip()
                break
            # Otherwise look up from os.getenv
            val = os.getenv(cand, "").strip()
            if val:
                uri = val
                break

        # If still empty, check discrete components provided by Vercel Postgres / Docker
        if not uri:
            host = os.getenv("POSTGRES_HOST", "").strip()
            user = os.getenv("POSTGRES_USER", "").strip()
            password = os.getenv("POSTGRES_PASSWORD", "").strip()
            database = os.getenv("POSTGRES_DATABASE", os.getenv("POSTGRES_DB", "")).strip()
            port = os.getenv("POSTGRES_PORT", "5432").strip()
            if host and user and database:
                uri = f"postgresql://{user}:{password}@{host}:{port}/{database}"

        if not uri:
            return ""

        # Normalize scheme
        if uri.startswith("postgres://"):
            uri = uri.replace("postgres://", "postgresql://", 1)

        # Ensure sslmode for remote cloud databases (Neon, Supabase, Vercel Postgres, AWS)
        is_local = any(h in uri for h in ["localhost", "127.0.0.1", "@postgres:", "@postgres/"])
        if not is_local and "sslmode=" not in uri:
            delimiter = "&" if "?" in uri else "?"
            uri = f"{uri}{delimiter}sslmode=require"

        return uri

    @property
    def effective_db_uri(self) -> str:
        """Returns normalized PostgreSQL URI for chat history & checkpoints."""
        return self._resolve_uri(self.DATABASE_URL, self.POSTGRES_URL)

    @property
    def effective_auth_db_uri(self) -> str:
        """Returns normalized Auth PostgreSQL URI."""
        return self._resolve_uri(self.AUTH_DATABASE_URL, self.DATABASE_URL, self.POSTGRES_URL)

    @property
    def detected_postgres_vars(self) -> List[str]:
        """Returns the list of PostgreSQL-related environment variable keys detected in the environment."""
        keys = [
            "AUTH_DATABASE_URL",
            "DATABASE_URL",
            "POSTGRES_URL_NON_POOLING",
            "POSTGRES_URL",
            "POSTGRES_PRISMA_URL",
            "POSTGRESQL_URL",
            "NEON_DATABASE_URL",
            "SUPABASE_DATABASE_URL",
            "SUPABASE_DB_URL",
            "POSTGRES_HOST",
        ]
        return [k for k in keys if os.getenv(k)]

    @staticmethod
    def mask_uri(uri: str) -> str:
        """Returns masked URI safe for diagnostics/logging without revealing credentials."""
        if not uri:
            return ""
        try:
            if "@" in uri:
                prefix, host_part = uri.split("@", 1)
                scheme = prefix.split("://")[0] if "://" in prefix else "postgresql"
                return f"{scheme}://****:****@{host_part}"
            return uri
        except Exception:
            return "postgresql://****:****@masked"

    class Config:
        case_sensitive = True


settings = Settings()

