"""Add persistent asynchronous AI tasks."""

from alembic import op
import sqlalchemy as sa

revision = "0003_ai_tasks"
down_revision = "0002_semantic_graph"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_tasks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("type", sa.String(32), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("model", sa.String(256), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_ai_tasks_type", "ai_tasks", ["type"])
    op.create_index("ix_ai_tasks_status", "ai_tasks", ["status"])
    op.create_index("ix_ai_tasks_created_at", "ai_tasks", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_ai_tasks_created_at", table_name="ai_tasks")
    op.drop_index("ix_ai_tasks_status", table_name="ai_tasks")
    op.drop_index("ix_ai_tasks_type", table_name="ai_tasks")
    op.drop_table("ai_tasks")
