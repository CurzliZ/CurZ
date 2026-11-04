from pathlib import Path
import sqlite3

from alembic import command
from alembic.config import Config

from app.database import make_engine
from app.migrations import upgrade_database


def test_latest_migrations_run_from_empty_database(tmp_path):
    database_path = tmp_path / "empty.db"
    engine = make_engine(f"sqlite:///{database_path.as_posix()}")
    try:
        assert not database_path.exists()
        upgrade_database(engine)
        with sqlite3.connect(database_path) as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
                )
            }
            assert {
                "notes",
                "links",
                "tags",
                "note_tags",
                "revisions",
                "settings",
                "semantic_neighbors",
                "graph_layout",
                "ai_tasks",
                "claims",
                "evidence",
                "extraction_stats",
                "relationships",
                "relationship_evidence",
                "review_decisions",
                "retrieval_chunks",
                "chunk_embeddings",
                "retrieval_chunks_fts",
                "revisit_preferences",
                "notes_fts",
                "alembic_version",
            } <= tables
            assert connection.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone() == ("0007_phase12_insights",)
        upgrade_database(engine)
    finally:
        engine.dispose()


def test_migration_downgrade_and_reupgrade(tmp_path):
    database_path = tmp_path / "downgrade.db"
    engine = make_engine(f"sqlite:///{database_path.as_posix()}")
    try:
        upgrade_database(engine)
        config_path = Path(__file__).resolve().parents[1] / "alembic.ini"
        config = Config(str(config_path))
        with engine.connect() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "0005_relationships")
            connection.commit()
        with sqlite3.connect(database_path) as direct:
            tables = {
                row[0]
                for row in direct.execute(
                    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view')"
                )
            }
            assert "relationships" in tables
            assert "relationship_evidence" in tables
            assert "review_decisions" in tables
            assert "retrieval_chunks" not in tables
            assert "chunk_embeddings" not in tables
            assert "revisit_preferences" not in tables
            assert direct.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone() == ("0005_relationships",)
        with engine.connect() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "0006_ask_retrieval")
            connection.commit()
        with engine.connect() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
            connection.commit()
        with sqlite3.connect(database_path) as direct:
            assert direct.execute(
                "SELECT version_num FROM alembic_version"
            ).fetchone() == ("0007_phase12_insights",)
    finally:
        engine.dispose()
