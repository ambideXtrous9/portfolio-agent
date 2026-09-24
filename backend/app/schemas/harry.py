"""Harry Potter Lore Agent Pydantic Schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class HarryAskRequest(BaseModel):
    query: str = Field(..., description="Question regarding Harry Potter lore, wandlore, or Indian mythology parallels")


class HarryAskResponse(BaseModel):
    query: str
    classification: str
    research: Optional[str] = None
    mythology: Optional[str] = None
    article: str
    answer: Optional[str] = None
    critique: Optional[str] = None
    execution_time_seconds: float
