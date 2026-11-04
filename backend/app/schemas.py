from datetime import datetime
from pathlib import PureWindowsPath
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorDetail


class VaultPathRequest(BaseModel):
    path: str = Field(min_length=1, max_length=4096)


class VaultStatus(BaseModel):
    open: bool
    path: str | None


class NoteCreate(BaseModel):
    path: str | None = Field(default=None, min_length=1, max_length=1024)
    title: str | None = Field(default=None, min_length=1, max_length=512)
    content: str


class NoteUpdate(BaseModel):
    content: str
    force_revision: bool = False


class NoteSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    path: str
    title: str
    content_hash: str
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None
    tags: list[str] = Field(default_factory=list)


class NoteDetail(NoteSummary):
    content: str


class NoteList(BaseModel):
    items: list[NoteSummary]
    total: int
    limit: int
    offset: int


class BacklinkList(BaseModel):
    items: list[NoteSummary]


class LinkOut(BaseModel):
    id: int
    source_id: int
    target_id: int | None
    target_text: str | None
    alias: str | None


class TagOut(BaseModel):
    name: str
    count: int


class SearchResult(NoteSummary):
    snippet: str


class SearchResponse(BaseModel):
    items: list[SearchResult]
    query: str


class RescanResult(BaseModel):
    created: int
    changed: int
    deleted: int


class GraphNode(BaseModel):
    id: int
    title: str
    degree: int
    created_at: datetime
    x: float | None = None
    y: float | None = None
    position_saved: bool = False


class GraphEdge(BaseModel):
    source: int
    target: int
    kind: Literal["explicit", "semantic", "reasoned"] = "explicit"
    score: float | None = None
    relationship_id: int | None = None
    relationship_type: str | None = None
    state: str | None = None
    explanation: str | None = None
    source_title: str | None = None
    target_title: str | None = None
    evidence: list["RelationshipEvidenceOut"] = Field(default_factory=list)


class RelationshipEvidenceOut(BaseModel):
    note_id: int
    note_title: str
    quote: str
    quote_start: int
    quote_end: int
    status: Literal["verified", "stale"]


class RelationshipOut(BaseModel):
    id: int
    source_note_id: int
    source_title: str
    target_note_id: int
    target_title: str
    relationship_type: str
    explanation: str
    confidence: float | None
    origin: Literal["ai", "manual"]
    state: Literal["pending", "accepted", "rejected", "outdated"]
    created_at: datetime
    evidence: list[RelationshipEvidenceOut]


class RelationshipList(BaseModel):
    items: list[RelationshipOut]


class RelationshipGenerationResult(BaseModel):
    task_id: str


class RelationshipCreate(BaseModel):
    source_note_id: int
    target_note_id: int
    relationship_type: Literal[
        "supports", "contradicts", "extends", "example_of", "depends_on",
        "applies_to", "inspired_by", "tension",
    ]
    explanation: str = Field(min_length=1, max_length=2000)
    source_quote: str = Field(min_length=1, max_length=10000)
    target_quote: str = Field(min_length=1, max_length=10000)


class RelationshipDecision(BaseModel):
    action: Literal["accept", "edit", "dismiss", "defer"]
    relationship_type: Literal[
        "supports", "contradicts", "extends", "example_of", "depends_on",
        "applies_to", "inspired_by", "tension",
    ] | None = None
    explanation: str | None = Field(default=None, min_length=1, max_length=2000)
    source_quote: str | None = Field(default=None, min_length=1, max_length=10000)
    target_quote: str | None = Field(default=None, min_length=1, max_length=10000)


class AskScope(BaseModel):
    kind: Literal["current_note", "folder", "tag", "vault"]
    note_id: int | None = Field(default=None, ge=1)
    folder: str | None = Field(default=None, max_length=1024)
    tag: str | None = Field(default=None, max_length=128)

    @model_validator(mode="after")
    def validate_scope(self):
        if self.kind == "current_note" and self.note_id is None:
            raise ValueError("Current-note scope requires a note ID.")
        if self.kind == "folder":
            normalized = self.folder.replace("\\", "/").strip("/") if self.folder else ""
            parts = normalized.split("/")
            if (
                not normalized
                or PureWindowsPath(self.folder).drive
                or self.folder.startswith(("/", "\\"))
                or any(part in ("", ".", "..") for part in parts)
            ):
                raise ValueError("Folder scope requires a safe vault-relative folder.")
        if self.kind == "tag" and not self.tag:
            raise ValueError("Tag scope requires a tag.")
        if self.kind != "current_note" and self.note_id is not None:
            raise ValueError("Note ID is only valid for current-note scope.")
        if self.kind != "folder" and self.folder is not None:
            raise ValueError("Folder is only valid for folder scope.")
        if self.kind != "tag" and self.tag is not None:
            raise ValueError("Tag is only valid for tag scope.")
        return self


class AskTurn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    answer: str = Field(min_length=1, max_length=10000)


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    scope: AskScope
    turns: list[AskTurn] = Field(default_factory=list, max_length=4)


class AskClaimInput(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    quote: str = Field(min_length=1, max_length=10000)
    note_id: int = Field(ge=1)


class AskOutput(BaseModel):
    answer: str = Field(max_length=10000)
    claims: list[AskClaimInput] = Field(default_factory=list, max_length=20)
    unsupported: list[str] = Field(default_factory=list, max_length=20)


class AskTaskStart(BaseModel):
    id: str
    status: str


class AskScopesResponse(BaseModel):
    folders: list[str]
    tags: list[str]


class GraphNeighborhood(BaseModel):
    center_id: int
    depth: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    truncated: bool


class GraphOverview(BaseModel):
    total_nodes: int
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    truncated: bool


class GraphLayoutPosition(BaseModel):
    note_id: int
    x: float = Field(ge=-1_000_000, le=1_000_000, allow_inf_nan=False)
    y: float = Field(ge=-1_000_000, le=1_000_000, allow_inf_nan=False)


class GraphLayoutSave(BaseModel):
    positions: list[GraphLayoutPosition] = Field(max_length=5000)


class GraphLayoutResult(BaseModel):
    saved: int


class GraphLayoutResetResult(BaseModel):
    reset: bool


class DeletedResponse(BaseModel):
    deleted: bool


class RevisionSummary(BaseModel):
    id: int
    note_id: int
    content_hash: str
    created_at: datetime


class RevisionDetail(RevisionSummary):
    content: str


class RevisionList(BaseModel):
    items: list[RevisionSummary]
