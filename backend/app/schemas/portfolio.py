"""Portfolio and Profile Pydantic Schemas."""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel


class SkillCategory(BaseModel):
    category: str
    items: List[str]


class ProfileResponse(BaseModel):
    name: str
    role: str
    tagline: str
    education: str
    bio: str
    skills: List[SkillCategory]
    social_links: Dict[str, str]
    technologies: List[str]


class GitHubStatsResponse(BaseModel):
    username: str
    name: Optional[str] = "N/A"
    public_repos: int = 0
    followers: int = 0
    following: int = 0
    avatar_url: Optional[str] = None
    html_url: Optional[str] = None
    bio: Optional[str] = None
