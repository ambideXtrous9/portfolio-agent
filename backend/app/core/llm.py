"""Core LLM initialization module with automatic fallback."""

import os
from typing import Optional, List
from langchain_groq import ChatGroq
from backend.app.config import settings


def get_llm(temperature: float = 0.1, tags: Optional[List[str]] = None, seed: int = 42, max_tokens: Optional[int] = 8192):
    """Initializes and returns the configured LLM with fallback support."""
    model_name = settings.DEFAULT_MODEL
    groq_key = settings.GROQ_API_KEY
    effective_max_tokens = max_tokens or 8192
    
    groq = ChatGroq(
        model_name=model_name,
        temperature=temperature,
        seed=seed,
        tags=tags,
        max_tokens=effective_max_tokens,
        api_key=groq_key or None,
    )
    
    # Optional OpenRouter fallback
    openrouter_key = settings.OPENROUTER_API_KEY
    if openrouter_key:
        try:
            from langchain_openai import ChatOpenAI
            openrouter = ChatOpenAI(
                model="qwen/qwen3-4b:free",
                temperature=temperature,
                openai_api_base="https://openrouter.ai/api/v1",
                openai_api_key=openrouter_key,
                seed=seed,
                tags=tags,
                max_tokens=effective_max_tokens,
            )
            return groq.with_fallbacks([openrouter])
        except Exception:
            pass
            
    return groq
