from dataclasses import replace

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.providers import AIConfig, normalize_ollama_url
from app.config import settings
from app.models import Setting

KEYS = {
    "ollama_url": "ai.ollama_url",
    "chat_model": "ai.chat_model",
    "embedding_model": "ai.embedding_model",
    "timeout_seconds": "ai.timeout_seconds",
    "demo_mode": "ai.demo_mode",
}


def get_ai_config(session: Session) -> AIConfig:
    values = dict(session.execute(select(Setting.key, Setting.value).where(
        Setting.key.in_(KEYS.values())
    )).all())
    return AIConfig(
        ollama_url=normalize_ollama_url(
            values.get(KEYS["ollama_url"], settings.ai_ollama_url)
        ),
        chat_model=values.get(KEYS["chat_model"], settings.ai_chat_model),
        embedding_model=values.get(KEYS["embedding_model"], settings.ai_embedding_model),
        timeout_seconds=float(values.get(KEYS["timeout_seconds"], settings.ai_timeout_seconds)),
        demo_mode=values.get(KEYS["demo_mode"], "false").lower() == "true",
    )


def save_ai_config(session: Session, config: AIConfig) -> AIConfig:
    values = {
        KEYS["ollama_url"]: normalize_ollama_url(config.ollama_url),
        KEYS["chat_model"]: config.chat_model,
        KEYS["embedding_model"]: config.embedding_model,
        KEYS["timeout_seconds"]: str(config.timeout_seconds),
        KEYS["demo_mode"]: str(config.demo_mode).lower(),
    }
    existing = {
        row.key: row
        for row in session.scalars(select(Setting).where(Setting.key.in_(values))).all()
    }
    for key, value in values.items():
        if key in existing:
            existing[key].value = value
        else:
            session.add(Setting(key=key, value=value))
    session.commit()
    return replace(config, ollama_url=normalize_ollama_url(config.ollama_url))
