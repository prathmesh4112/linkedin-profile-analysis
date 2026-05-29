from pydantic import BaseModel
from typing import List, Optional

class ProfileInput(BaseModel):
    name: Optional[str] = ""
    headline: Optional[str] = ""
    location: Optional[str] = ""
    about: Optional[str] = ""
    experience: Optional[List[str]] = []
    education: Optional[List[str]] = []
    skills: Optional[List[str]] = []
    has_photo: Optional[int] = 0
    connectionText: Optional[str] = ""
    url: Optional[str] = ""
    scrapedAt: Optional[str] = ""

class SkillGap(BaseModel):
    have: List[str]
    missing: List[str]
    growing: List[str]

class ProfileHealthSuggestion(BaseModel):
    priority: str
    category: str
    issue: str
    fix: str

class ScoreOutput(BaseModel):
    career_trajectory: int
    skill_completeness: int
    authenticity: int
    hire_fit: int
    profile_health: int
    skill_gap: SkillGap
    insights: List[str]
    suggestions: List[ProfileHealthSuggestion]
    strengths: List[str] = []
    tiers: dict = {}