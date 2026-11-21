"""Authentication and User Management Endpoints (Sign Up, Login, JWT, Logout)."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status

from backend.app.api.deps import extract_candidate_tokens, get_current_active_user, oauth2_scheme
from backend.app.config import settings
from backend.app.core.auth_database import auth_db_manager
from backend.app.core.notify import send_reset_email, send_telegram_msg
from backend.app.core.ratelimit import rate_limit
from backend.app.core.security import (
    create_access_token,
    create_reset_token,
    decode_token,
    hash_password,
    verify_password,
)
from backend.app.schemas.auth import (
    ForgotPasswordRequest,
    MessageResponse,
    ResetPasswordRequest,
    TokenResponse,
    UserResponse,
    UserSignupRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication & Access"])

# Uniform authentication-failure message: prevents user enumeration
AUTH_FAILURE_DETAIL = "Incorrect email or password."
AUTH_FAILURE_HEADERS = {"WWW-Authenticate": "Bearer"}

COOKIE_NAME = "access_token"


def _set_auth_cookie(response: Response, token: str, request: Optional[Request] = None) -> None:
    """Stores the JWT in an httpOnly cookie so the token is not exposed to JS."""
    forwarded_proto = ""
    if request is not None:
        forwarded_proto = (request.headers.get("x-forwarded-proto") or "").split(",")[0].strip()
    is_https = (
        forwarded_proto == "https"
        or (request is not None and request.url.scheme == "https")
        or os_is_https()
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=is_https,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


def os_is_https() -> bool:
    """Detects HTTPS termination for cookie Secure flag (Vercel/proxy aware)."""
    import os as _os

    proto = _os.getenv("X_FORWARDED_PROTO", "")
    vercel = _os.getenv("VERCEL", "")
    return proto == "https" or bool(vercel)


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(key=COOKIE_NAME, path="/")


def _build_user_response(user_dict: dict) -> UserResponse:
    return UserResponse(
        id=str(user_dict["id"]),
        email=user_dict["email"],
        full_name=user_dict.get("full_name"),
        is_active=user_dict.get("is_active", True),
        is_superuser=user_dict.get("is_superuser", False),
        role=user_dict.get("role", "user"),
        created_at=user_dict.get("created_at"),
    )


# ──────────────────────────────────────────────────────────────────────────────
# 1. User Registration (Sign Up)
# ──────────────────────────────────────────────────────────────────────────────
@router.post(
    "/signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
    description="Registers a new user in PostgreSQL and immediately returns an authenticated JWT Bearer session.",
)
async def signup_endpoint(request: UserSignupRequest, response: Response, http_request: Request):
    """Registers a new user and issues an access token."""
    existing_user = await auth_db_manager.get_user_by_email(request.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email address already exists. Please log in instead.",
        )

    # Hash password using Argon2id
    hashed_pwd = hash_password(request.password)

    try:
        user_dict = await auth_db_manager.create_user(
            email=request.email,
            full_name=request.full_name,
            hashed_password=hashed_pwd,
            role="user",
        )
    except RuntimeError as db_err:
        logger.error(f"Sign up database failure: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Unable to register user: {db_err}",
        ) from db_err

    # Issue initial JWT Access Token
    token_payload = {
        "sub": user_dict["email"],
        "user_id": str(user_dict["id"]),
        "role": user_dict.get("role", "user"),
    }
    access_token = create_access_token(
        data=token_payload,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    _set_auth_cookie(response, access_token, http_request)

    logger.info(f"User registered successfully: {request.email} (ID: {user_dict['id']})")
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=_build_user_response(user_dict),
    )


# ──────────────────────────────────────────────────────────────────────────────
# 2. User Login (OAuth2 Form & JSON Support)
# ──────────────────────────────────────────────────────────────────────────────
@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user and issue JWT Bearer token",
    description="Authenticates credentials and returns a signed JWT Bearer token. Supports JSON or form-urlencoded.",
)
async def login_endpoint(request: Request, response: Response):
    """Authenticates credentials from JSON payload or form body."""
    # Brute-force protection: per-IP sliding window
    rate_limit(request, "auth-login", max_attempts=10, window_seconds=300.0)

    email = None
    password = None

    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            body = await request.json()
            email = (body.get("email") or body.get("username") or "").strip()
            password = body.get("password") or ""
        except Exception:
            pass
    else:
        try:
            form = await request.form()
            email = (form.get("username") or form.get("email") or "").strip()
            password = form.get("password") or ""
        except Exception:
            pass

    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email/username and password are required.",
        )

    user_dict = await auth_db_manager.get_user_by_email(email)
    if not user_dict or not verify_password(password, user_dict["hashed_password"]):
        # Uniform failure message: identical for unknown users and wrong passwords
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=AUTH_FAILURE_DETAIL,
            headers=AUTH_FAILURE_HEADERS,
        )

    if not user_dict.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated. Please contact support.",
        )

    # Issue JWT Access Token
    token_payload = {
        "sub": user_dict["email"],
        "user_id": str(user_dict["id"]),
        "role": user_dict.get("role", "user"),
    }
    access_token = create_access_token(
        data=token_payload,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    _set_auth_cookie(response, access_token, request)

    logger.info(f"User authenticated successfully: {email}")
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=_build_user_response(user_dict),
    )


# ──────────────────────────────────────────────────────────────────────────────
# 3. Current User Profile
# ──────────────────────────────────────────────────────────────────────────────
@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user profile",
    description="Returns the profile details of the currently authenticated user.",
)
async def get_me_endpoint(
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Returns profile of currently authenticated user."""
    return current_user


# ──────────────────────────────────────────────────────────────────────────────
# 4. Refresh Session (Sliding Token Rotation)
# ──────────────────────────────────────────────────────────────────────────────
@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Rotate the current JWT access token",
    description=(
        "Issues a fresh access token for an already-authenticated caller. "
        "Active tabs call this before expiry so users are never signed out mid-session."
    ),
)
async def refresh_endpoint(
    request: Request,
    response: Response,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Rotates a valid session token without requiring the password again."""
    rate_limit(request, "auth-refresh", max_attempts=60, window_seconds=300.0)

    token_payload = {
        "sub": current_user.email,
        "user_id": current_user.id,
        "role": current_user.role,
    }
    access_token = create_access_token(
        data=token_payload,
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    _set_auth_cookie(response, access_token, request)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        user=current_user,
    )


# ──────────────────────────────────────────────────────────────────────────────
# 5. User Logout & Token Revocation
# ──────────────────────────────────────────────────────────────────────────────
@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Revoke JWT token (Logout)",
    description="Revokes the current JWT Bearer token and adds it to the token blacklist.",
)
async def logout_endpoint(
    response: Response,
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Revokes every presented token and clears the auth cookie."""
    raw_tokens = extract_candidate_tokens(request, token, None)

    for raw_token in raw_tokens:
        try:
            payload = decode_token(raw_token)
            token_jti = payload.get("jti")
            exp_timestamp = payload.get("exp")

            if token_jti and exp_timestamp:
                expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
                await auth_db_manager.blacklist_token(
                    token_jti=token_jti,
                    user_id=current_user.id,
                    expires_at=expires_at,
                )
        except Exception as e:
            logger.warning(f"Logout token decoding note: {e}")

    _clear_auth_cookie(response)
    logger.info(f"User logged out successfully: {current_user.email}")
    return MessageResponse(
        message="Successfully logged out. Your token has been revoked.",
        status="success",
    )


# ──────────────────────────────────────────────────────────────────────────────
# 6. Forgot Password (Initiate Reset Request)
# ──────────────────────────────────────────────────────────────────────────────
@router.post(
    "/forgot-password",
    summary="Request a password reset token",
    description="Generates a 15-minute time-limited cryptographic password reset token for a registered account.",
)
async def forgot_password_endpoint(
    request: ForgotPasswordRequest,
    request_http: Request,
    background_tasks: BackgroundTasks,
):
    """Generates a time-limited password reset token for a registered account."""
    rate_limit(request_http, "auth-forgot", max_attempts=10, window_seconds=300.0)

    email = (request.email or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid registered email address.",
        )

    user_dict = await auth_db_manager.get_user_by_email(email)
    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No registered account found for this email address. Please check the email or register an account.",
        )

    expires_at = datetime.now(timezone.utc) + timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES)
    reset_token = create_reset_token(
        email=user_dict["email"],
        user_id=str(user_dict["id"]),
        expires_delta=timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES),
    )

    await auth_db_manager.store_reset_token(
        user_id=str(user_dict["id"]),
        token_str=reset_token,
        expires_at=expires_at,
    )

    # Deliver via SMTP email when configured
    email_sent = False
    if settings.SMTP_USER and settings.SMTP_PASSWORD:
        email_sent = await send_reset_email(
            to_email=user_dict["email"],
            reset_token=reset_token,
            expires_minutes=settings.RESET_TOKEN_EXPIRE_MINUTES,
        )

    # Also notify via Telegram when configured
    if settings.TELEGRAM_CHAT_ID and settings.TELEGRAM_BOT_TOKEN:
        owner_chat_id = settings.TELEGRAM_CHAT_ID.split(",")[0].strip()
        background_tasks.add_task(
            send_telegram_msg,
            owner_chat_id,
            f"🔐 <b>Password reset requested</b> for <code>{user_dict['email']}</code>\n\n"
            f"<b>Reset token (valid {settings.RESET_TOKEN_EXPIRE_MINUTES} min):</b>\n"
            f"<code>{reset_token}</code>",
            "HTML",
        )

    logger.info(f"Password reset token issued for: {user_dict['email']} (email_sent={email_sent})")
    return {
        "message": (
            "15-minute reset token generated, auto-applied below, and emailed to your inbox."
            if email_sent
            else "15-minute reset token generated and auto-applied below. Enter your new password to complete the reset."
        ),
        "status": "success",
        "email": user_dict["email"],
        "email_sent": email_sent,
        "reset_token": reset_token,
        "expires_in_minutes": settings.RESET_TOKEN_EXPIRE_MINUTES,
    }


# ──────────────────────────────────────────────────────────────────────────────
# 7. Reset Password (Update Credentials)
# ──────────────────────────────────────────────────────────────────────────────
@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Reset password with token",
    description="Validates the reset token and updates the user's password using Argon2id.",
)
async def reset_password_endpoint(request: ResetPasswordRequest, request_http: Request):
    """Verifies reset token and updates user password."""
    rate_limit(request_http, "auth-reset", max_attempts=10, window_seconds=300.0)

    token_str = (request.token or "").strip()
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token is required.",
        )

    try:
        payload = decode_token(token_str)
        if payload.get("token_type") != "reset_password":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid token type: expected password reset token.",
            )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid or expired reset token: {str(e)}",
        ) from e

    user_id = await auth_db_manager.verify_and_consume_reset_token(token_str)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token is invalid, expired, or has already been used.",
        )

    new_hashed_pwd = hash_password(request.new_password)
    updated = await auth_db_manager.update_user_password(
        user_id,
        new_hashed_pwd,
        email=payload.get("sub"),
    )

    if not updated:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update password. Please try again.",
        )

    logger.info(f"Password updated successfully for User ID: {user_id}")
    return MessageResponse(
        message="Password reset successfully. You can now log in with your new credentials.",
        status="success",
    )
