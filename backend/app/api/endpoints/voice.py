"""LiveKit Voice Agent API Endpoint for WebRTC Token Generation & Status."""

import logging
import os
import time
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel

from backend.app.config import settings
from backend.app.api.deps import get_optional_user
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
    current_user: Optional[UserResponse] = Depends(get_optional_user),
):
    """Generate and return a LiveKit WebRTC access token via GET request."""
    url = settings.LIVEKIT_URL or os.getenv("LIVEKIT_URL", "wss://my-voice-agent-6wug4ta7.livekit.cloud")
    room_name = (room or "").strip() or f"voice-tour-{uuid.uuid4().hex[:6]}"
    if current_user:
        participant_name = (name or "").strip() or (current_user.full_name or "Traveler")
        caller_identity = (identity or "").strip() or f"user-{current_user.id[:8]}"
    else:
        participant_name = (name or "").strip() or "Guest Traveler"
        caller_identity = (identity or "").strip() or f"guest-{uuid.uuid4().hex[:6]}"

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
    current_user: Optional[UserResponse] = Depends(get_optional_user),
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
    current_user: Optional[UserResponse] = Depends(get_optional_user),
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
            "tools": [getattr(t, "name", getattr(t, "__name__", str(t))) for t in agent_tools],
            "langfuse_observability": is_langfuse_configured(),
        },
    }


class VoiceChatRequest(BaseModel):
    message: str
    room: Optional[str] = None
    session_id: Optional[str] = None


class VoiceChatResponse(BaseModel):
    reply: str
    tools_used: list[str] = []
    sender: str = "Agent"


@router.post("/chat", response_model=VoiceChatResponse)
async def voice_chat(
    payload: VoiceChatRequest,
    current_user: Optional[UserResponse] = Depends(get_optional_user),
):
    """
    Direct voice conversational chat endpoint.
    Executes the Groq LangGraph agent node with tool dispatch (weather, news, bio)
    and returns concise spoken-text answers with tool execution telemetry.
    Acts as the serverless bridge for the frontend Voice Assistant.
    """
    user_query = (payload.message or "").strip()
    if not user_query:
        return VoiceChatResponse(
            reply="I didn't catch that. Could you please say or send your question again?",
            tools_used=[],
            sender="Agent",
        )

    logger.info("Voice chat request received: '%s'", user_query)

    try:
        from langchain_core.messages import HumanMessage
        from backend.app.voice_agent.graph import build_langgraph_workflow

        workflow = build_langgraph_workflow()
        result = await workflow.ainvoke({"messages": [HumanMessage(content=user_query)]})

        messages = result.get("messages", [])
        tools_used: list[str] = []
        for msg in messages:
            if hasattr(msg, "tool_calls") and msg.tool_calls:
                for tc in msg.tool_calls:
                    name = tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", None)
                    if name and name not in tools_used:
                        tools_used.append(name)
            if type(msg).__name__ == "ToolMessage":
                tool_name = getattr(msg, "name", None)
                if tool_name and tool_name not in tools_used:
                    tools_used.append(tool_name)

        reply_content = ""
        if messages:
            last_msg = messages[-1]
            reply_content = getattr(last_msg, "content", "")
            if isinstance(reply_content, list):
                reply_content = " ".join(str(c) for c in reply_content if c)

        reply_content = (reply_content or "").strip()
        if not reply_content:
            reply_content = "I processed your request, but have no response to return. Please try another question."

        return VoiceChatResponse(
            reply=reply_content,
            tools_used=tools_used,
            sender="Agent",
        )
    except Exception as exc:
        logger.error("Error generating voice chat reply for '%s': %s", user_query, exc, exc_info=True)
        return VoiceChatResponse(
            reply="I'm having a brief connection issue with the AI backend. Please ask your question again in a moment.",
            tools_used=[],
            sender="Agent",
        )

