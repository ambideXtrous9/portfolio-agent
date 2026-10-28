"""Lightweight in-process sliding-window rate limiter.

Protects auth endpoints against brute-force / enumeration abuse without
adding an external dependency. Suitable for single-instance deployments;
swap for a Redis-backed limiter when scaling horizontally.
"""

import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict, Optional

from fastapi import HTTPException, Request, status

_BUCKETS: Dict[str, Deque[float]] = defaultdict(deque)
_LOCK = threading.Lock()
_LAST_PRUNE: float = 0.0

_MAX_BUCKETS = 10_000  # guard against unbounded key growth


def _prune_stale(now: float) -> None:
    """Periodic global prune of empty/stale buckets."""
    global _LAST_PRUNE
    if now - _LAST_PRUNE < 60.0:
        return
    _LAST_PRUNE = now
    stale = [k for k, v in _BUCKETS.items() if not v or (now - v[-1] > 3600.0)]
    for k in stale:
        _BUCKETS.pop(k, None)
    if len(_BUCKETS) > _MAX_BUCKETS:
        for k in list(_BUCKETS.keys())[: len(_BUCKETS) - _MAX_BUCKETS]:
            _BUCKETS.pop(k, None)


def check_rate_limit(key: str, max_attempts: int, window_seconds: float) -> None:
    """Records an attempt and raises 429 when the limit is exceeded."""
    now = time.time()
    with _LOCK:
        _prune_stale(now)
        bucket = _BUCKETS[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= max_attempts:
            retry_after = int(window_seconds - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(max(retry_after, 1))},
            )
        bucket.append(now)


def client_ip(request: Request) -> str:
    """Best-effort client identity for rate limiting (proxy-aware)."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(
    request: Request,
    scope: str,
    max_attempts: int = 10,
    window_seconds: float = 300.0,
    extra_key: Optional[str] = None,
) -> None:
    """Convenience wrapper: scoped per-IP limiter for HTTP endpoints."""
    check_rate_limit(f"{scope}:{extra_key or client_ip(request)}", max_attempts, window_seconds)
