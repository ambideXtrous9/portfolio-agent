"""Authentication and Authorization Dependencies for FastAPI Route Protection."""

import logging
from typing import Callable, Optional

from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer

from backend.app.core.auth_database import auth_db_manager
from backend.app.core.security import decode_token
from backend.app.schemas.auth import UserResponse

logger = logging.getLogger(__name__)

# Native FastAPI OAuth2 scheme (auto_error=False allows query parameter token fallback)
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl="/api/auth/login",
    auto_error=False,
)


async def validate_token_and_get_user(token: str) -> UserResponse:
    """Validates token authenticity, blacklist revocation, and active user profile."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Please log in.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = decode_token(token)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    # 1. Check if token was blacklisted (logged out)
    token_jti = payload.get("jti")
    if token_jti:
        is_revoked = await auth_db_manager.is_token_blacklisted(token_jti)
        if is_revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has been revoked. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # 2. Extract email / username subject
    email: Optional[str] = payload.get("sub")
    if not email:
        raise credentials_exception

    # 3. Retrieve user from auth_db
    user_dict = await auth_db_manager.get_user_by_email(email)
    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account associated with token does not exist.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return UserResponse(
        id=str(user_dict["id"]),
        email=user_dict["email"],
        full_name=user_dict.get("full_name"),
        is_active=user_dict.get("is_active", True),
        is_superuser=user_dict.get("is_superuser", False),
        role=user_dict.get("role", "user"),
        created_at=user_dict.get("created_at"),
    )


def extract_candidate_tokens(request: Request, token: Optional[str], query_token: Optional[str]) -> list[str]:
    """Collects unique candidate JWTs in priority order: OAuth2 header, query param, httpOnly cookie."""
    candidates: list[str] = []
    for t in (token, query_token):
        if t and t.strip() and t.strip() not in candidates:
            candidates.append(t.strip())
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if auth_header and auth_header.startswith("Bearer "):
        h_tok = auth_header.split(" ", 1)[1].strip()
        if h_tok and h_tok not in candidates:
            candidates.append(h_tok)
    cookie_tok = request.cookies.get("access_token")
    if cookie_tok and cookie_tok.strip() and cookie_tok.strip() not in candidates:
        candidates.append(cookie_tok.strip())
    return candidates


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    query_token: Optional[str] = Query(None, alias="token", description="JWT token for SSE/WS access"),
) -> UserResponse:
    """
    Decodes JWT Bearer token from header, query parameter, or httpOnly cookie,
    verifies revocation, and fetches user profile. If multiple token sources
    are present (e.g. fresh header + stale cookie), tries each candidate.
    """
    candidates = extract_candidate_tokens(request, token, query_token)
    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in to access this AI feature.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    last_exc: Optional[HTTPException] = None
    for raw_token in candidates:
        try:
            return await validate_token_and_get_user(raw_token)
        except HTTPException as exc:
            last_exc = exc
            continue

    raise last_exc or HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Please log in to access this AI feature.",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_active_user(
    current_user: UserResponse = Depends(get_current_user),
) -> UserResponse:
    """Ensures the authenticated user account is active."""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Please contact support.",
        )
    return current_user


async def get_optional_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    query_token: Optional[str] = Query(None, alias="token"),
) -> Optional[UserResponse]:
    """Optional user dependency that returns None if no token or invalid token."""
    for raw_token in extract_candidate_tokens(request, token, query_token):
        try:
            return await validate_token_and_get_user(raw_token)
        except Exception:
            continue
    return None


def require_role(*allowed_roles: str) -> Callable:
    """Dependency factory enforcing Role-Based Access Control (RBAC)."""
    async def role_checker(
        current_user: UserResponse = Depends(get_current_active_user),
    ) -> UserResponse:
        if current_user.is_superuser:
            return current_user
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires one of roles {allowed_roles}",
            )
        return current_user

    return role_checker
