"""Persist Revisit choices."""

from alembic import op
import sqlalchemy as sa

revision = "0007_phase12_insights"
down_revision = "0006_ask_retrieval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "revisit_preferences",
        sa.Column("note_id", sa.Integer(), primary_key=True),
        sa.Column("state", sa.String(16), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("state IN ('saved', 'dismissed')"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("revisit_preferences")
