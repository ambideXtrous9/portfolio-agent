"""Core LLM initialization with automatic fallback and instance caching.

ChatGroq instances hold an HTTP client each; constructing one per agent node
leaks sockets and re-handshakes TLS on every request. Instances are cached per
(temperature, seed, max_tokens, tags) configuration instead.
"""

from typing import List, Optional, Tuple

from langchain_core.runnables import Runnable
from langchain_groq import ChatGroq

from backend.app.config import settings

_llm_cache: dict = {}
_MAX_CACHED_LLM = 32


def _cache_key(temperature: float, seed: int, max_tokens: int, tags: Optional[List[str]]) -> Tuple:
    return (temperature, seed, max_tokens, tuple(tags or ()))


def get_llm(temperature: float = 0.1, tags: Optional[List[str]] = None, seed: int = 42, max_tokens: Optional[int] = 8192) -> Runnable:
    """Returns a cached LLM instance for the given configuration."""
    effective_max_tokens = max_tokens or 8192
    key = _cache_key(temperature, seed, effective_max_tokens, tags)
    cached = _llm_cache.get(key)
    if cached is not None:
        return cached

    model_name = settings.DEFAULT_MODEL
    groq_key = settings.GROQ_API_KEY

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
    llm = groq
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
            llm = groq.with_fallbacks([openrouter])
        except Exception:
            pass

    if len(_llm_cache) >= _MAX_CACHED_LLM:
        _llm_cache.clear()
    _llm_cache[key] = llm
    return llm
