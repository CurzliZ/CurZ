from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import Engine


def upgrade_database(engine: Engine) -> None:
    config_path = Path(__file__).resolve().parents[1] / "alembic.ini"
    config = Config(str(config_path))
    config.attributes["connection"] = engine.connect()
    try:
        command.upgrade(config, "head")
    finally:
        config.attributes["connection"].close()
