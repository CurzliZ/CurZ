from datetime import UTC, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    path: Mapped[str] = mapped_column(String(1024), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(512), index=True)
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)

    links: Mapped[list["Link"]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        foreign_keys="Link.source_id",
    )
    note_tags: Mapped[list["NoteTag"]] = relationship(
        back_populates="note", cascade="all, delete-orphan"
    )
    revisions: Mapped[list["Revision"]] = relationship(
        back_populates="note", cascade="all, delete-orphan"
    )


class Link(Base):
    __tablename__ = "links"
    __table_args__ = (
        UniqueConstraint("source_id", "target_id", "target_text", "alias"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    target_id: Mapped[int | None] = mapped_column(
        ForeignKey("notes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    target_text: Mapped[str | None] = mapped_column(String(512), nullable=True)
    alias: Mapped[str | None] = mapped_column(String(512), nullable=True)

    source: Mapped[Note] = relationship(back_populates="links", foreign_keys=[source_id])


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    note_tags: Mapped[list["NoteTag"]] = relationship(
        back_populates="tag", cascade="all, delete-orphan"
    )


class NoteTag(Base):
    __tablename__ = "note_tags"
    __table_args__ = (UniqueConstraint("note_id", "tag_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    tag_id: Mapped[int] = mapped_column(
        ForeignKey("tags.id", ondelete="CASCADE"), index=True
    )

    note: Mapped[Note] = relationship(back_populates="note_tags")
    tag: Mapped[Tag] = relationship(back_populates="note_tags")


class Revision(Base):
    __tablename__ = "revisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)

    note: Mapped[Note] = relationship(back_populates="revisions")


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(128), primary_key=True)
    value: Mapped[str] = mapped_column(Text)


class RevisitPreference(Base):
    __tablename__ = "revisit_preferences"

    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True
    )
    state: Mapped[str] = mapped_column(String(16))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)


class AITask(Base):
    __tablename__ = "ai_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    type: Mapped[str] = mapped_column(String(32), index=True)
    status: Mapped[str] = mapped_column(String(24), index=True)
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(256))
    result_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(Text)
    state: Mapped[str] = mapped_column(String(24), default="active")
    is_mock: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    evidence: Mapped[list["Evidence"]] = relationship(
        back_populates="claim", cascade="all, delete-orphan"
    )


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (
        CheckConstraint("quote_start >= 0 AND quote_end >= quote_start"),
        CheckConstraint("status IN ('verified', 'stale')"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[int] = mapped_column(
        ForeignKey("claims.id", ondelete="CASCADE"), index=True
    )
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    heading: Mapped[str | None] = mapped_column(String(512), nullable=True)
    quote: Mapped[str] = mapped_column(Text)
    quote_start: Mapped[int] = mapped_column()
    quote_end: Mapped[int] = mapped_column()
    source_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="verified", index=True)
    claim: Mapped[Claim] = relationship(back_populates="evidence")


class ExtractionStat(Base):
    __tablename__ = "extraction_stats"
    __table_args__ = (
        CheckConstraint(
            "raw_quotes >= 0 AND verified_quotes >= 0 AND verified_quotes <= raw_quotes"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    task_id: Mapped[str] = mapped_column(
        ForeignKey("ai_tasks.id", ondelete="CASCADE"), unique=True
    )
    raw_quotes: Mapped[int] = mapped_column()
    verified_quotes: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class SemanticNeighbor(Base):
    __tablename__ = "semantic_neighbors"
    __table_args__ = (UniqueConstraint("source_id", "target_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    target_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    source_content_hash: Mapped[str] = mapped_column(String(64))
    target_content_hash: Mapped[str] = mapped_column(String(64))
    score: Mapped[float] = mapped_column(Float)


class GraphLayout(Base):
    __tablename__ = "graph_layout"

    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True
    )
    x: Mapped[float] = mapped_column(Float)
    y: Mapped[float] = mapped_column(Float)


class Relationship(Base):
    __tablename__ = "relationships"
    __table_args__ = (
        CheckConstraint(
            "relationship_type IN ('supports', 'contradicts', 'extends', 'example_of', "
            "'depends_on', 'applies_to', 'inspired_by', 'tension')"
        ),
        CheckConstraint("origin IN ('ai', 'manual')"),
        CheckConstraint("state IN ('pending', 'accepted', 'rejected', 'outdated')"),
        CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)"),
        CheckConstraint("source_note_id != target_note_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    target_note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    relationship_type: Mapped[str] = mapped_column(String(32))
    explanation: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    origin: Mapped[str] = mapped_column(String(16))
    state: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    source_hash: Mapped[str] = mapped_column(String(64))
    target_hash: Mapped[str] = mapped_column(String(64))
    deferred_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now)
    evidence: Mapped[list["RelationshipEvidence"]] = relationship(
        back_populates="relationship", cascade="all, delete-orphan"
    )


class RelationshipEvidence(Base):
    __tablename__ = "relationship_evidence"
    __table_args__ = (
        CheckConstraint("quote_start >= 0 AND quote_end >= quote_start"),
        CheckConstraint("status IN ('verified', 'stale')"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    relationship_id: Mapped[int] = mapped_column(
        ForeignKey("relationships.id", ondelete="CASCADE"), index=True
    )
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    quote: Mapped[str] = mapped_column(Text)
    quote_start: Mapped[int] = mapped_column()
    quote_end: Mapped[int] = mapped_column()
    source_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="verified", index=True)
    relationship: Mapped[Relationship] = relationship(back_populates="evidence")


class ReviewDecision(Base):
    __tablename__ = "review_decisions"

    id: Mapped[int] = mapped_column(primary_key=True)
    relationship_id: Mapped[int] = mapped_column(
        ForeignKey("relationships.id", ondelete="CASCADE"), index=True
    )
    action: Mapped[str] = mapped_column(String(16))
    relationship_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    explanation: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now)


class RetrievalChunk(Base):
    __tablename__ = "retrieval_chunks"
    __table_args__ = (UniqueConstraint("note_id", "chunk_index"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    chunk_index: Mapped[int] = mapped_column()
    heading: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[str] = mapped_column(Text)
    quote_start: Mapped[int] = mapped_column()
    quote_end: Mapped[int] = mapped_column()


class ChunkEmbedding(Base):
    __tablename__ = "chunk_embeddings"
    __table_args__ = (
        UniqueConstraint("note_id", "content_hash", "model", "chunk_index"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    note_id: Mapped[int] = mapped_column(
        ForeignKey("notes.id", ondelete="CASCADE"), index=True
    )
    content_hash: Mapped[str] = mapped_column(String(64), index=True)
    model: Mapped[str] = mapped_column(String(256), index=True)
    chunk_index: Mapped[int] = mapped_column()
    vector_json: Mapped[str] = mapped_column(Text)
