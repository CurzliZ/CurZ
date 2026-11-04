from contextlib import closing
from pathlib import Path
import logging
import os
import sqlite3
import shutil
import tempfile

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import APP_NAME, settings

logger = logging.getLogger(__name__)
DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "curz.db"
LEGACY_DB_PATH = Path(__file__).resolve().parents[1] / "threadwise.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"


def copy_legacy_database(legacy_path: Path, new_path: Path) -> bool:
    if new_path.exists() or not legacy_path.is_file():
        return False
    new_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{new_path.name}.", suffix=".tmp", dir=new_path.parent
    )
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        with closing(
            sqlite3.connect(legacy_path.resolve().as_uri() + "?mode=ro", uri=True)
        ) as source:
            with closing(sqlite3.connect(temporary)) as destination:
                source.backup(destination)
        shutil.copystat(legacy_path, temporary)
        os.replace(temporary, new_path)
    finally:
        if temporary.exists():
            temporary.unlink()
    logger.info("Copied the legacy database to the %s database path.", APP_NAME)
    return True


def normalize_database_url(database_url: str | None = None) -> str:
    if database_url is None and not settings.database_url:
        copy_legacy_database(LEGACY_DB_PATH, DEFAULT_DB_PATH)
    url = database_url or settings.database_url or DEFAULT_DATABASE_URL
    parsed = make_url(url)
    if parsed.drivername.startswith("sqlite") and parsed.database not in (None, ":memory:"):
        database_path = Path(parsed.database)
        if not database_path.is_absolute():
            parsed = parsed.set(database=(DEFAULT_DB_PATH.parent / database_path).resolve().as_posix())
    return parsed.render_as_string(hide_password=False)


def make_engine(database_url: str | None = None) -> Engine:
    url = normalize_database_url(database_url)
    engine = create_engine(url, connect_args={"check_same_thread": False} if url.startswith("sqlite") else {})

    if url.startswith("sqlite"):
        @event.listens_for(engine, "connect")
        def enable_foreign_keys(connection, _record) -> None:
            cursor = connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
