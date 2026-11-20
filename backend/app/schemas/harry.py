"""Harry Potter Lore Agent Pydantic Schemas."""

from typing import Optional

from pydantic import BaseModel, Field


class HarryAskRequest(BaseModel):
    query: str = Field(..., description="Question regarding Harry Potter lore, wandlore, or Indian mythology parallels")
    session_id: Optional[str] = Field(default=None, description="Optional thread/session ID for conversation continuity")


class HarryAskResponse(BaseModel):
    query: str
    thread_id: Optional[str] = None
    classification: str
    research: Optional[str] = None
    mythology: Optional[str] = None
    article: str
    answer: Optional[str] = None
    critique: Optional[str] = None
    execution_time_seconds: float
