"""LiveKit Voice Agent API Endpoint for WebRTC Token Generation & Status."""

import logging
import os
import time
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.api.deps import get_current_active_user
from backend.app.schemas.auth import UserResponse
try:
    from backend.app.voice_agent.telemetry import is_langfuse_configured
    from backend.app.voice_agent.tools import agent_tools
except Exception:
    is_langfuse_configured = lambda: False
    agent_tools = []

logger = logging.getLogger("voice_endpoint")
router = APIRouter(prefix="/voice", tags=["LiveKit Voice Agent"])


class TokenRequest(BaseModel):
    room: Optional[str] = None
    name: Optional[str] = None
    identity: Optional[str] = None


class TokenResponse(BaseModel):
    token: str
    url: str
    room: str
    identity: str
    name: str


def generate_livekit_token(room_name: str, participant_name: str, identity: str) -> str:
    """Generate signed JWT token for LiveKit WebRTC Room access."""
    api_key = settings.LIVEKIT_API_KEY or os.getenv("LIVEKIT_API_KEY", "")
    api_secret = settings.LIVEKIT_API_SECRET or os.getenv("LIVEKIT_API_SECRET", "")
    
    if not api_key or not api_secret:
        raise HTTPException(
            status_code=500,
            detail="LiveKit credentials (LIVEKIT_API_KEY and LIVEKIT_API_SECRET) not configured.",
        )

    # 1. Try official livekit.api
    try:
        from livekit import api
        token = (
            api.AccessToken(api_key=api_key, api_secret=api_secret)
            .with_identity(identity)
            .with_name(participant_name)
            .with_grants(
                api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                )
            )
        )
        return token.to_jwt()
    except Exception as exc:
        logger.warning(
            "livekit.api token generation error (%s), using direct HS256 JWT encoding", exc
        )
        import jwt
        now = int(time.time())
        payload = {
            "iss": api_key,
            "sub": identity,
            "name": participant_name,
            "nbf": now,
            "exp": now + 6 * 3600,
            "video": {
                "roomJoin": True,
                "room": room_name,
                "canPublish": True,
                "canSubscribe": True,
                "canPublishData": True,
            },
        }
        return jwt.encode(payload, api_secret, algorithm="HS256")


@router.get("/token", response_model=TokenResponse)
async def get_voice_token(
    room: Optional[str] = Query(None, description="Target room name"),
    name: Optional[str] = Query(None, description="Participant display name"),
    identity: Optional[str] = Query(None, description="Unique caller identifier"),
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Generate and return a LiveKit WebRTC access token via GET request."""
    url = settings.LIVEKIT_URL or os.getenv("LIVEKIT_URL", "wss://my-voice-agent-6wug4ta7.livekit.cloud")
    room_name = (room or "").strip() or f"voice-tour-{uuid.uuid4().hex[:6]}"
    participant_name = (name or "").strip() or (current_user.full_name or "Traveler")
    caller_identity = (identity or "").strip() or f"user-{current_user.id[:8]}"

    jwt_token = generate_livekit_token(room_name, participant_name, caller_identity)
    logger.info("Issued LiveKit token for %s in room %s", caller_identity, room_name)

    return TokenResponse(
        token=jwt_token,
        url=url,
        room=room_name,
        identity=caller_identity,
        name=participant_name,
    )


@router.post("/token", response_model=TokenResponse)
async def post_voice_token(
    payload: TokenRequest,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Generate and return a LiveKit WebRTC access token via POST request."""
    return await get_voice_token(
        room=payload.room,
        name=payload.name,
        identity=payload.identity,
        current_user=current_user,
    )


@router.get("/status")
async def get_voice_status(
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Health & configuration status of the LiveKit voice integration."""
    api_key = settings.LIVEKIT_API_KEY or os.getenv("LIVEKIT_API_KEY", "")
    api_secret = settings.LIVEKIT_API_SECRET or os.getenv("LIVEKIT_API_SECRET", "")
    url = settings.LIVEKIT_URL or os.getenv("LIVEKIT_URL", "")

    return {
        "status": "online" if (api_key and api_secret and url) else "unconfigured",
        "service": "livekit-voice-agent",
        "livekit_url": url,
        "features": {
            "silero_vad": True,
            "bvc_noise_cancellation": True,
            "groq_tool_calling": True,
            "stt_fallback": ["AssemblyAI", "Deepgram"],
            "tts_fallback": ["Cartesia Sonic-3", "Inworld"],
            "tools": [t.name for t in agent_tools],
            "langfuse_observability": is_langfuse_configured(),
        },
    }
