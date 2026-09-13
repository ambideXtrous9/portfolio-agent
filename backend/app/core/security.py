"""Security and Cryptographic Utilities (Argon2 Password Hashing & PyJWT Tokens)."""

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Try modern Argon2id password hashing via pwdlib
try:
    from pwdlib import PasswordHash
    password_hasher = PasswordHash.recommended()
    USE_PWDLIB = True
except Exception as e:
    logger.warning(f"pwdlib not available ({e}), falling back to hashlib PBKDF2-HMAC-SHA256.")
    USE_PWDLIB = False
    password_hasher = None

# Try importing PyJWT
try:
    import jwt
    from jwt.exceptions import ExpiredSignatureError, InvalidTokenError, PyJWTError
    JWT_AVAILABLE = True
except ImportError:
    logger.warning("pyjwt not installed.")
    JWT_AVAILABLE = False
    ExpiredSignatureError = Exception
    InvalidTokenError = Exception
    PyJWTError = Exception

from backend.app.config import settings


def hash_password(password: str) -> str:
    """Hashes a plaintext password using Argon2id or salted PBKDF2-HMAC-SHA256."""
    if USE_PWDLIB and password_hasher:
        try:
            return password_hasher.hash(password)
        except Exception:
            pass

    # Robust stdlib fallback
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"pbkdf2$sha256$100000${salt}${key.hex()}"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plaintext password against Argon2id or PBKDF2 hash."""
    if not hashed_password or not plain_password:
        return False

    if USE_PWDLIB and password_hasher and not hashed_password.startswith("pbkdf2"):
        try:
            return password_hasher.verify(plain_password, hashed_password)
        except Exception as e:
            logger.debug(f"Argon2 verification failed: {e}")

    # Check for PBKDF2 format fallback (handles both pbkdf2$algo$iters$salt$hash and pbkdf2:algo:iters$salt$hash)
    if hashed_password.startswith("pbkdf2"):
        try:
            parts = hashed_password.split("$")
            if len(parts) == 5:
                _, algo, iters, salt, hash_val = parts
                computed = hashlib.pbkdf2_hmac(algo, plain_password.encode("utf-8"), salt.encode("utf-8"), int(iters))
                return secrets.compare_digest(computed.hex(), hash_val)
            elif len(parts) == 3:
                header, salt, hash_val = parts
                subparts = header.split(":")
                algo = subparts[1] if len(subparts) > 1 else "sha256"
                iters = int(subparts[2]) if len(subparts) > 2 else 100000
                computed = hashlib.pbkdf2_hmac(algo, plain_password.encode("utf-8"), salt.encode("utf-8"), iters)
                return secrets.compare_digest(computed.hex(), hash_val)
        except Exception as e:
            logger.warning(f"PBKDF2 verification note: {e}")
            return False

    return False


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Generates a signed JWT access token with unique jti and expiration timestamp."""
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))

    to_encode.update({
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "token_type": "access",
    })

    return jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def create_reset_token(
    email: str,
    user_id: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Generates a short-lived cryptographic password reset token."""
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.RESET_TOKEN_EXPIRE_MINUTES))

    payload = {
        "sub": email,
        "user_id": str(user_id),
        "iat": now,
        "exp": expire,
        "jti": str(uuid.uuid4()),
        "token_type": "reset_password",
    }

    return jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_token(token: str) -> Dict[str, Any]:
    """Decodes and validates a JWT token signature and expiration."""
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except ExpiredSignatureError:
        raise ValueError("Token has expired.")
    except InvalidTokenError as e:
        raise ValueError(f"Invalid token: {str(e)}")
    except PyJWTError as e:
        raise ValueError(f"Token decoding error: {str(e)}")
