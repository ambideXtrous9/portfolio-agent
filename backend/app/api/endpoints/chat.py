"""Chat History and Thread Management Endpoints backed by PostgreSQL."""

import logging
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.app.api.deps import get_current_active_user
from backend.app.core.database import db_manager
from backend.app.schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat History"])


class ChatMessageItem(BaseModel):
    role: str = Field(..., description="Role: 'user', 'assistant', 'system'")
    content: str = Field(..., description="Message content")


class ThreadHistoryResponse(BaseModel):
    thread_id: str
    message_count: int
    messages: List[ChatMessageItem]
    storage_type: str = Field(..., description="'postgresql' or 'in-memory'")


class DeleteThreadResponse(BaseModel):
    thread_id: str
    deleted: bool
    message: str


def _normalize_thread_id(thread_id: str) -> str:
    """Ensures thread_id is a valid UUID string required by PostgresChatMessageHistory."""
    try:
        uuid.UUID(thread_id)
        return thread_id
    except (ValueError, TypeError):
        return str(uuid.uuid5(uuid.NAMESPACE_DNS, thread_id))


@router.get(
    "/threads/{thread_id}/history",
    response_model=ThreadHistoryResponse,
    summary="Get chat history for a thread from PostgreSQL",
)
async def get_thread_history(
    thread_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Retrieves all conversation messages stored in PostgreSQL for the given thread_id."""
    norm_id = _normalize_thread_id(thread_id)

    # IDOR protection: the thread must belong to the requesting user
    owner = await db_manager.get_thread_owner(norm_id)
    if owner is not None and owner != current_user.id:
        # 404 (not 403) to avoid revealing the existence of other users' threads
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")

    history = await db_manager.get_chat_history(norm_id)
    messages = await history.aget_messages()

    if owner is None and not messages:
        # Unknown, empty thread: treat as non-existent (prevents ownerless probing)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")

    if owner is None and messages:
        # Legacy migration: pre-ownership threads are claimed by their first
        # reader (previously they were world-readable; first-claim wins).
        await db_manager.claim_chat_thread(norm_id, current_user.id)

    serialized = []
    for msg in messages:
        role = "assistant"
        msg_type = getattr(msg, "type", "")
        if msg_type in ["human", "user"]:
            role = "user"
        elif msg_type in ["ai", "assistant"]:
            role = "assistant"
        elif msg_type == "system":
            role = "system"

        content = getattr(msg, "content", "")
        if isinstance(content, list):
            content = " ".join(str(c) for c in content)
        serialized.append(ChatMessageItem(role=role, content=str(content)))

    return ThreadHistoryResponse(
        thread_id=thread_id,
        message_count=len(serialized),
        messages=serialized,
        storage_type="in-memory" if db_manager.is_in_memory else "postgresql",
    )


@router.delete(
    "/threads/{thread_id}",
    response_model=DeleteThreadResponse,
    summary="Delete chat history for a thread from PostgreSQL",
)
async def delete_thread_history(
    thread_id: str,
    current_user: UserResponse = Depends(get_current_active_user),
):
    """Deletes all messages for the thread_id from the PostgreSQL database."""
    norm_id = _normalize_thread_id(thread_id)

    # IDOR protection: only the owner may delete
    owner = await db_manager.get_thread_owner(norm_id)
    if owner is None or owner != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")

    deleted = await db_manager.delete_chat_session(norm_id)
    await db_manager.delete_thread_ownership(norm_id)
    return DeleteThreadResponse(
        thread_id=thread_id,
        deleted=deleted,
        message="Thread history deleted successfully." if deleted else "Thread not found or already deleted.",
    )
