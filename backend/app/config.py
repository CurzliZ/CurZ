from dataclasses import dataclass
import logging
from pathlib import Path
import os

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

APP_NAME = "CurZ"
API_TITLE = f"{APP_NAME} API"
logger = logging.getLogger(__name__)
_legacy_notice_logged = False


def get_environment_value(
    name: str,
    default: str = "",
    legacy_name: str | None = None,
) -> str:
    global _legacy_notice_logged
    value = os.getenv(name)
    if value is not None:
        return value
    if legacy_name and legacy_name in os.environ:
        if not _legacy_notice_logged:
            logger.warning(
                "Legacy environment variables are deprecated; use CURZ_* names."
            )
            _legacy_notice_logged = True
        return os.environ[legacy_name]
    return default


@dataclass(frozen=True)
class Settings:
    app_name: str
    host: str
    port: int
    database_url: str
    ai_ollama_url: str
    ai_chat_model: str
    ai_embedding_model: str
    ai_timeout_seconds: float


def get_settings() -> Settings:
    port = int(get_environment_value("CURZ_PORT", "8000", "PORT"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be between 1 and 65535")
    ai_timeout_seconds = float(
        get_environment_value("CURZ_AI_TIMEOUT_SECONDS", "120", "AI_TIMEOUT_SECONDS")
    )
    if not 0.1 <= ai_timeout_seconds <= 120:
        raise ValueError("AI_TIMEOUT_SECONDS must be between 0.1 and 120")

    return Settings(
        app_name=API_TITLE,
        host=get_environment_value("CURZ_HOST", "127.0.0.1", "HOST"),
        port=port,
        database_url=get_environment_value("CURZ_DATABASE_URL", "", "DATABASE_URL"),
        ai_ollama_url=get_environment_value(
            "CURZ_AI_OLLAMA_URL", "http://127.0.0.1:11434", "AI_OLLAMA_URL"
        ).rstrip("/"),
        ai_chat_model=get_environment_value("CURZ_AI_CHAT_MODEL", "", "AI_CHAT_MODEL").strip(),
        ai_embedding_model=get_environment_value(
            "CURZ_AI_EMBEDDING_MODEL", "", "AI_EMBEDDING_MODEL"
        ).strip(),
        ai_timeout_seconds=ai_timeout_seconds,
    )


settings = get_settings()
