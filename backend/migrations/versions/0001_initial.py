"""Initial file-backed note index."""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("path", sa.String(1024), nullable=False),
        sa.Column("title", sa.String(512), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("archived_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("path"),
    )
    op.create_index("ix_notes_path", "notes", ["path"], unique=True)
    op.create_index("ix_notes_title", "notes", ["title"])
    op.create_index("ix_notes_archived_at", "notes", ["archived_at"])

    op.create_table(
        "links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("target_id", sa.Integer(), nullable=True),
        sa.Column("target_text", sa.String(512), nullable=True),
        sa.Column("alias", sa.String(512), nullable=True),
        sa.ForeignKeyConstraint(["source_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["notes.id"], ondelete="SET NULL"),
        sa.UniqueConstraint("source_id", "target_id", "target_text", "alias"),
    )
    op.create_index("ix_links_source_id", "links", ["source_id"])
    op.create_index("ix_links_target_id", "links", ["target_id"])

    op.create_table(
        "tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False, unique=True),
    )
    op.create_index("ix_tags_name", "tags", ["name"], unique=True)

    op.create_table(
        "note_tags",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("note_id", "tag_id"),
    )
    op.create_index("ix_note_tags_note_id", "note_tags", ["note_id"])
    op.create_index("ix_note_tags_tag_id", "note_tags", ["tag_id"])

    op.create_table(
        "revisions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_revisions_note_id", "revisions", ["note_id"])
    op.create_index("ix_revisions_content_hash", "revisions", ["content_hash"])
    op.create_index("ix_revisions_created_at", "revisions", ["created_at"])

    op.create_table(
        "settings",
        sa.Column("key", sa.String(128), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )
    op.execute(
        "CREATE VIRTUAL TABLE notes_fts USING fts5(note_id UNINDEXED, title, body)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notes_fts")
    op.drop_table("settings")
    op.drop_index("ix_revisions_created_at", table_name="revisions")
    op.drop_index("ix_revisions_content_hash", table_name="revisions")
    op.drop_index("ix_revisions_note_id", table_name="revisions")
    op.drop_table("revisions")
    op.drop_index("ix_note_tags_tag_id", table_name="note_tags")
    op.drop_index("ix_note_tags_note_id", table_name="note_tags")
    op.drop_table("note_tags")
    op.drop_index("ix_tags_name", table_name="tags")
    op.drop_table("tags")
    op.drop_index("ix_links_target_id", table_name="links")
    op.drop_index("ix_links_source_id", table_name="links")
    op.drop_table("links")
    op.drop_index("ix_notes_archived_at", table_name="notes")
    op.drop_index("ix_notes_title", table_name="notes")
    op.drop_index("ix_notes_path", table_name="notes")
    op.drop_table("notes")
