"""Add verified claims and evidence."""

from alembic import op
import sqlalchemy as sa

revision = "0004_claim_evidence"
down_revision = "0003_ai_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "claims",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False, server_default="active"),
        sa.Column("is_mock", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_claims_note_id", "claims", ["note_id"])
    op.create_table(
        "evidence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("claim_id", sa.Integer(), nullable=False),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("heading", sa.String(512), nullable=True),
        sa.Column("quote", sa.Text(), nullable=False),
        sa.Column("quote_start", sa.Integer(), nullable=False),
        sa.Column("quote_end", sa.Integer(), nullable=False),
        sa.Column("source_hash", sa.String(64), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="verified"),
        sa.CheckConstraint("quote_start >= 0 AND quote_end >= quote_start"),
        sa.CheckConstraint("status IN ('verified', 'stale')"),
        sa.ForeignKeyConstraint(["claim_id"], ["claims.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_evidence_claim_id", "evidence", ["claim_id"])
    op.create_index("ix_evidence_note_id", "evidence", ["note_id"])
    op.create_index("ix_evidence_status", "evidence", ["status"])
    op.create_table(
        "extraction_stats",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("task_id", sa.String(36), nullable=False, unique=True),
        sa.Column("raw_quotes", sa.Integer(), nullable=False),
        sa.Column("verified_quotes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "raw_quotes >= 0 AND verified_quotes >= 0 AND verified_quotes <= raw_quotes"
        ),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["ai_tasks.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_extraction_stats_note_id", "extraction_stats", ["note_id"])


def downgrade() -> None:
    op.drop_index("ix_extraction_stats_note_id", table_name="extraction_stats")
    op.drop_table("extraction_stats")
    op.drop_index("ix_evidence_status", table_name="evidence")
    op.drop_index("ix_evidence_note_id", table_name="evidence")
    op.drop_index("ix_evidence_claim_id", table_name="evidence")
    op.drop_table("evidence")
    op.drop_index("ix_claims_note_id", table_name="claims")
    op.drop_table("claims")
