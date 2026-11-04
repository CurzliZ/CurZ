from datetime import datetime
from typing import Any, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, model_validator


class AISettingsUpdate(BaseModel):
    ollama_url: AnyHttpUrl
    chat_model: str = Field(max_length=256)
    embedding_model: str = Field(max_length=256)
    timeout_seconds: float = Field(ge=0.1, le=120)
    demo_mode: bool


class AISettingsResponse(BaseModel):
    provider: Literal["ollama", "mock"]
    ollama_url: str
    chat_model: str
    embedding_model: str
    timeout_seconds: float
    demo_mode: bool


class AIHealthResponse(BaseModel):
    provider: str
    reachable: bool
    chat_model: str
    chat_model_present: bool
    embedding_model: str
    embedding_model_present: bool
    chat_model_error: str | None = None
    embedding_model_error: str | None = None
    mock: bool
    error: str | None = None


class ExtractionClaimInput(BaseModel):
    claim_text: str = Field(min_length=1, max_length=2000)
    quote: str = Field(min_length=1, max_length=10000)
    heading: str | None = Field(default=None, max_length=512)


class ExtractionOutput(BaseModel):
    claims: list[ExtractionClaimInput] = Field(max_length=20)


RELATIONSHIP_TYPES = (
    "supports",
    "contradicts",
    "extends",
    "example_of",
    "depends_on",
    "applies_to",
    "inspired_by",
    "tension",
    "none",
)


class RelationshipJudgment(BaseModel):
    type: Literal[
        "supports",
        "contradicts",
        "extends",
        "example_of",
        "depends_on",
        "applies_to",
        "inspired_by",
        "tension",
        "none",
    ]
    explanation: str = Field(max_length=2000)
    source_quote: str = Field(max_length=10000)
    target_quote: str = Field(max_length=10000)
    confidence: float | None = Field(default=None, ge=0, le=1)


class EvidenceResponse(BaseModel):
    id: int
    heading: str | None
    quote: str
    quote_start: int
    quote_end: int
    source_hash: str
    status: Literal["verified", "stale"]


class ClaimResponse(BaseModel):
    id: int
    text: str
    state: str
    interpretation: bool
    mock: bool
    evidence: list[EvidenceResponse]


class ExtractionStatsResponse(BaseModel):
    raw_quotes: int
    verified_quotes: int


class NoteClaimsResponse(BaseModel):
    note_id: int
    claims: list[ClaimResponse]
    stats: ExtractionStatsResponse | None


class ClaimExtractionTaskRequest(BaseModel):
    type: Literal["extract_claims"] = "extract_claims"
    note_id: int


class AIMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str = Field(max_length=100_000)


class AITaskRequest(BaseModel):
    type: Literal["chat", "embed", "extract_claims"]
    note_id: int | None = None
    messages: list[AIMessage] = Field(default_factory=list, max_length=100)
    texts: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_payload(self):
        if self.type == "chat" and not self.messages:
            raise ValueError("Chat tasks require at least one message.")
        if self.type == "embed" and (not self.texts or any(len(text) > 100_000 for text in self.texts)):
            raise ValueError("Embedding tasks require 1–100 texts, each at most 100000 characters.")
        if self.type == "extract_claims" and self.note_id is None:
            raise ValueError("Claim extraction requires a note ID.")
        if self.type != "extract_claims" and self.note_id is not None:
            raise ValueError("Note IDs are only valid for claim extraction tasks.")
        if self.type == "chat" and self.texts or self.type == "embed" and self.messages:
            raise ValueError("Provide only the payload matching the task type.")
        return self


class AITaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    status: str
    provider: str
    model: str
    result: dict[str, Any] | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
