"""Persist semantic neighbors and graph layout coordinates."""

from alembic import op
import sqlalchemy as sa

revision = "0002_semantic_graph"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "semantic_neighbors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=False),
        sa.Column("source_content_hash", sa.String(64), nullable=False),
        sa.Column("target_content_hash", sa.String(64), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["notes.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("source_id", "target_id"),
    )
    op.create_index("ix_semantic_neighbors_source_id", "semantic_neighbors", ["source_id"])
    op.create_index("ix_semantic_neighbors_target_id", "semantic_neighbors", ["target_id"])
    op.create_table(
        "graph_layout",
        sa.Column("note_id", sa.Integer(), primary_key=True),
        sa.Column("x", sa.Float(), nullable=False),
        sa.Column("y", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )


def downgrade() -> None:
    op.drop_table("graph_layout")
    op.drop_index("ix_semantic_neighbors_target_id", table_name="semantic_neighbors")
    op.drop_index("ix_semantic_neighbors_source_id", table_name="semantic_neighbors")
    op.drop_table("semantic_neighbors")
