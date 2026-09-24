"""Tour Agent Pydantic Schemas."""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class TourPlanRequest(BaseModel):
    query: str = Field(..., description="Travel query, e.g. '3 days trip to Munnar from tomorrow'")
    destination: Optional[str] = None
    duration: Optional[int] = 3


class TourPlanResponse(BaseModel):
    query: str
    destination: str
    duration_days: int
    checkin: str
    checkout: str
    itinerary_markdown: str
    itinerary: Optional[str] = None
    accommodations: List[Dict[str, Any]] = Field(default_factory=list)
    weather_summary: Optional[str] = None
    airbnb_status: str
    execution_time_seconds: float
