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
    AUTH_DATABASE_URL: str = os.getenv("AUTH_DATABASE_URL", os.getenv("DATABASE_URL", os.getenv("POSTGRES_URL", "")))
    DB_POOL_MIN_SIZE: int = int(os.getenv("DB_POOL_MIN_SIZE", "1"))
    DB_POOL_MAX_SIZE: int = int(os.getenv("DB_POOL_MAX_SIZE", "10"))
    DB_POOL_TIMEOUT: float = float(os.getenv("DB_POOL_TIMEOUT", "5.0"))
    TABLE_NAME: str = os.getenv("TABLE_NAME", "portfolio_chat_history")

    # Security & Authentication (Argon2 / JWT)
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "portfolio-super-secret-jwt-key-2026-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
    RESET_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("RESET_TOKEN_EXPIRE_MINUTES", "15"))

    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    @property
    def effective_db_uri(self) -> str:
        """Returns normalized PostgreSQL URI (handles postgres:// vs postgresql://)."""
        uri = self.DATABASE_URL or self.POSTGRES_URL or ""
        if uri.startswith("postgres://"):
            uri = uri.replace("postgres://", "postgresql://", 1)
        return uri

    @property
    def effective_auth_db_uri(self) -> str:
        """Returns normalized Auth PostgreSQL URI."""
        uri = self.AUTH_DATABASE_URL or self.DATABASE_URL or self.POSTGRES_URL or ""
        if uri.startswith("postgres://"):
            uri = uri.replace("postgres://", "postgresql://", 1)
        return uri

    class Config:
        case_sensitive = True


settings = Settings()
