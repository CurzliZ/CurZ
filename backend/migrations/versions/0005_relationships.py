"""Add typed relationships and review history."""

from alembic import op
import sqlalchemy as sa

revision = "0005_relationships"
down_revision = "0004_claim_evidence"
branch_labels = None
depends_on = None

RELATIONSHIP_TYPES = (
    "'supports', 'contradicts', 'extends', 'example_of', 'depends_on', "
    "'applies_to', 'inspired_by', 'tension'"
)


def upgrade() -> None:
    op.create_table(
        "relationships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_note_id", sa.Integer(), nullable=False),
        sa.Column("target_note_id", sa.Integer(), nullable=False),
        sa.Column("relationship_type", sa.String(32), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("origin", sa.String(16), nullable=False),
        sa.Column("state", sa.String(16), nullable=False, server_default="pending"),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("target_hash", sa.String(64), nullable=False),
        sa.Column("deferred_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(f"relationship_type IN ({RELATIONSHIP_TYPES})"),
        sa.CheckConstraint("origin IN ('ai', 'manual')"),
        sa.CheckConstraint("state IN ('pending', 'accepted', 'rejected', 'outdated')"),
        sa.CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)"),
        sa.ForeignKeyConstraint(["source_note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.CheckConstraint("source_note_id != target_note_id"),
    )
    op.create_index("ix_relationships_source_note_id", "relationships", ["source_note_id"])
    op.create_index("ix_relationships_target_note_id", "relationships", ["target_note_id"])
    op.create_index("ix_relationships_state", "relationships", ["state"])
    op.create_table(
        "relationship_evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("relationship_id", sa.Integer(), nullable=False),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("quote_start", sa.Integer(), nullable=False),
        sa.Column("quote_end", sa.Integer(), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="verified"),
        sa.CheckConstraint("quote_start >= 0 AND quote_end >= quote_start"),
        sa.CheckConstraint("status IN ('verified', 'stale')"),
        sa.ForeignKeyConstraint(["relationship_id"], ["relationships.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_relationship_evidence_relationship_id", "relationship_evidence", ["relationship_id"])
    op.create_index("ix_relationship_evidence_note_id", "relationship_evidence", ["note_id"])
    op.create_index("ix_relationship_evidence_status", "relationship_evidence", ["status"])
    op.create_table(
        "review_decisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("relationship_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("relationship_type", sa.String(32), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("action IN ('accepted', 'edited', 'rejected', 'deferred')"),
        sa.ForeignKeyConstraint(["relationship_id"], ["relationships.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_review_decisions_relationship_id", "review_decisions", ["relationship_id"])


def downgrade() -> None:
    op.drop_index("ix_review_decisions_relationship_id", table_name="review_decisions")
    op.drop_table("review_decisions")
    op.drop_index("ix_relationship_evidence_status", table_name="relationship_evidence")
    op.drop_index("ix_relationship_evidence_note_id", table_name="relationship_evidence")
    op.drop_index("ix_relationship_evidence_relationship_id", table_name="relationship_evidence")
    op.drop_table("relationship_evidence")
    op.drop_index("ix_relationships_state", table_name="relationships")
    op.drop_index("ix_relationships_target_note_id", table_name="relationships")
    op.drop_index("ix_relationships_source_note_id", table_name="relationships")
    op.drop_table("relationships")
