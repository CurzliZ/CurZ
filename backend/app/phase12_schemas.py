from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field



class EvolutionScope(BaseModel):
    note_id: int | None = Field(default=None, ge=1)
    tag: str | None = Field(default=None, max_length=128)


class EvolutionClaim(BaseModel):
    id: int
    note_id: int
    note_title: str
    note_path: str
    note_created_at: datetime
    note_updated_at: datetime
    text: str
    quote: str
    quote_start: int
    quote_end: int
    heading: str | None
    timestamp: datetime
    mock: bool


class EvolutionTimeline(BaseModel):
    scope_label: str
    items: list[EvolutionClaim]
    has_enough_history: bool


class EvolutionChange(BaseModel):
    from_quote: str
    to_quote: str
    description: str
    from_claim_id: int
    to_claim_id: int


class EvolutionSummary(BaseModel):
    summary: str
    changes: list[EvolutionChange]
    interpretation: Literal[True] = True
    mock: bool = False
    insufficient_history: bool = False


class EvolutionSummaryInput(BaseModel):
    note_id: int | None = Field(default=None, ge=1)
    tag: str | None = Field(default=None, max_length=128)


class GapItem(BaseModel):
    note_id: int
    title: str
    path: str
    text: str
    kind: Literal["orphan", "open_question"]


class GapsResponse(BaseModel):
    orphans: list[GapItem]
    open_questions: list[GapItem]
    truncated: bool


class RevisitItem(BaseModel):
    note_id: int
    title: str
    path: str
    reason: str
    reason_code: Literal[
        "saved_for_later",
        "related_to_current",
        "linked_to_recent",
        "new_connection",
        "unresolved_review",
        "valuable_untouched",
    ]
    state: Literal["saved"] | None = None


class RevisitResponse(BaseModel):
    items: list[RevisitItem]


class RevisitPreferenceUpdate(BaseModel):
    state: Literal["saved", "dismissed"]


class RevisitPreferenceResponse(BaseModel):
    note_id: int
    state: Literal["saved", "dismissed"]
    updated_at: datetime


class EvolutionChangeOutput(BaseModel):
    from_quote: str = Field(max_length=10000)
    to_quote: str = Field(max_length=10000)
    description: str = Field(max_length=2000)


class EvolutionSummaryOutput(BaseModel):
    summary: str = Field(max_length=10000)
    changes: list[EvolutionChangeOutput] = Field(default_factory=list, max_length=20)
