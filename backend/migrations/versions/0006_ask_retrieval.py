"""Add scoped retrieval chunks and rebuildable local embeddings."""

from alembic import op
import sqlalchemy as sa

revision = "0006_ask_retrieval"
down_revision = "0005_relationships"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "retrieval_chunks",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("heading", sa.Text(), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("quote_start", sa.Integer(), nullable=False),
        sa.Column("quote_end", sa.Integer(), nullable=False),
        sa.UniqueConstraint("note_id", "chunk_index"),
        sa.CheckConstraint("quote_start >= 0 AND quote_end >= quote_start"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_retrieval_chunks_note_id", "retrieval_chunks", ["note_id"])
    op.create_index(
        "ix_retrieval_chunks_content_hash", "retrieval_chunks", ["content_hash"]
    )
    op.create_table(
        "chunk_embeddings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("model", sa.String(256), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("vector_json", sa.Text(), nullable=False),
        sa.UniqueConstraint("note_id", "content_hash", "model", "chunk_index"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_chunk_embeddings_note_id", "chunk_embeddings", ["note_id"])
    op.create_index(
        "ix_chunk_embeddings_content_hash", "chunk_embeddings", ["content_hash"]
    )
    op.create_index("ix_chunk_embeddings_model", "chunk_embeddings", ["model"])
    op.execute(
        "CREATE VIRTUAL TABLE retrieval_chunks_fts USING fts5("
        "heading, content, tokenize='unicode61')"
    )
    op.execute(
        """
        CREATE TRIGGER retrieval_chunks_fts_insert AFTER INSERT ON retrieval_chunks
        BEGIN
            INSERT INTO retrieval_chunks_fts(rowid, heading, content)
            VALUES (new.id, new.heading, new.content);
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER retrieval_chunks_fts_delete AFTER DELETE ON retrieval_chunks
        BEGIN
            DELETE FROM retrieval_chunks_fts WHERE rowid = old.id;
        END
        """
    )
    op.execute(
        """
        CREATE TRIGGER retrieval_chunks_fts_update AFTER UPDATE ON retrieval_chunks
        BEGIN
            DELETE FROM retrieval_chunks_fts WHERE rowid = old.id;
            INSERT INTO retrieval_chunks_fts(rowid, heading, content)
            VALUES (new.id, new.heading, new.content);
        END
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER retrieval_chunks_fts_update")
    op.execute("DROP TRIGGER retrieval_chunks_fts_delete")
    op.execute("DROP TRIGGER retrieval_chunks_fts_insert")
    op.execute("DROP TABLE retrieval_chunks_fts")
    op.drop_index("ix_chunk_embeddings_model", table_name="chunk_embeddings")
    op.drop_index("ix_chunk_embeddings_content_hash", table_name="chunk_embeddings")
    op.drop_index("ix_chunk_embeddings_note_id", table_name="chunk_embeddings")
    op.drop_table("chunk_embeddings")
    op.drop_index("ix_retrieval_chunks_content_hash", table_name="retrieval_chunks")
    op.drop_index("ix_retrieval_chunks_note_id", table_name="retrieval_chunks")
    op.drop_table("retrieval_chunks")
