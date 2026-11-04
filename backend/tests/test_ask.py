import json
import time

import pytest
from pydantic import ValidationError
from sqlalchemy import delete

from app.ai.providers import AIProviderError, ChatResult
from app.models import Note, RetrievalChunk, Setting
from app.schemas import AskScope
from app.services.retrieval import (
    RetrievalScope,
    assert_hits_current,
    ensure_retrieval_index,
    retrieve_bm25,
)


def create_note(client, path, content):
    response = client.post("/api/notes", json={"path": path, "content": content})
    assert response.status_code == 201, response.text
    return response.json()


class AskProvider:
    def __init__(self, response):
        self.response = response
        self.chat_calls = 0
        self.embed_calls = 0

    async def chat(self, messages, json_schema=None):
        self.chat_calls += 1
        assert json_schema is not None
        assert "Entirely unrelated corpus secret" not in messages[-1]["content"]
        return ChatResult(json.dumps(self.response), "test-model", False)

    async def embed(self, texts):
        self.embed_calls += 1
        raise AssertionError("Embedding should not be used when none is configured.")

    async def health(self):
        raise AssertionError


def settings(client):
    response = client.put(
        "/api/ai/settings",
        json={
            "ollama_url": "http://127.0.0.1:11434",
            "chat_model": "test-model",
            "embedding_model": "",
            "timeout_seconds": 5,
            "demo_mode": False,
        },
    )
    assert response.status_code == 200


def ask(client, question, scope):
    started = client.post(
        "/api/ask",
        json={"question": question, "scope": scope, "turns": []},
    )
    assert started.status_code == 202, started.text
    task_id = started.json()["id"]
    for _ in range(100):
        task = client.get(f"/api/ai/tasks/{task_id}").json()
        if task["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.01)
    assert task["status"] == "succeeded", task.get("error")
    return task["result"]


def test_retrieval_scope_filters_by_current_note_folder_and_tag(opened_client):
    first = create_note(
        opened_client,
        "research/alpha.md",
        "---\ntags: [focus]\n---\n# Alpha\n\nQuartz planets orbit the star.",
    )
    second = create_note(
        opened_client,
        "journal/beta.md",
        "---\ntags: [other]\n---\n# Beta\n\nQuartz planets glow at dusk.",
    )
    with opened_client.app.state.session_factory() as session:
        assert {hit.note_id for hit in retrieve_bm25(
            session, "quartz planets", RetrievalScope("current_note", note_id=first["id"])
        )} == {first["id"]}
        assert {hit.note_id for hit in retrieve_bm25(
            session, "quartz planets", RetrievalScope("folder", folder="journal")
        )} == {second["id"]}
        assert {hit.note_id for hit in retrieve_bm25(
            session, "quartz planets", RetrievalScope("tag", tag="focus")
        )} == {first["id"]}


def test_existing_vault_chunks_are_backfilled_once(opened_client):
    note = create_note(
        opened_client,
        "backfill.md",
        "# Backfill\n\nA preserved passage about quartz planets.",
    )
    with opened_client.app.state.session_factory() as session:
        session.execute(delete(RetrievalChunk).where(RetrievalChunk.note_id == note["id"]))
        session.execute(delete(Setting).where(Setting.key == "retrieval.chunks_version"))
        session.commit()

        ensure_retrieval_index(session)

        chunks = session.query(RetrievalChunk).filter_by(note_id=note["id"]).all()
        assert len(chunks) == 1
        assert "preserved passage" in chunks[0].content
        assert session.get(Setting, "retrieval.chunks_version").value == "1"


def test_external_note_edit_is_not_cited_from_stale_chunks(opened_client, tmp_path):
    create_note(
        opened_client,
        "external.md",
        "# External\n\nA quartz planet circles a star.",
    )
    (tmp_path / "vault" / "external.md").write_text(
        "# External\n\nThe note was changed outside CurZ.",
        encoding="utf-8",
    )
    with opened_client.app.state.session_factory() as session:
        hits = retrieve_bm25(session, "quartz planet", RetrievalScope("vault"))
        with pytest.raises(AIProviderError, match="changed outside CurZ"):
            assert_hits_current(session, hits)


@pytest.mark.parametrize("folder", ["../outside", "/absolute", "C:\\outside", "a//b"])
def test_folder_scope_rejects_unsafe_paths(folder):
    with pytest.raises(ValidationError):
        AskScope(kind="folder", folder=folder)


def test_fabricated_quote_is_removed_from_supported_answer(opened_client, monkeypatch):
    note = create_note(
        opened_client,
        "planet.md",
        "# Planets\n\nQuartz planets orbit the star.",
    )
    provider = AskProvider({
        "answer": "Fabricated answer should not be trusted.",
        "claims": [{
            "text": "The planets are made of cheese.",
            "quote": "The planets are made of cheese.",
            "note_id": note["id"],
        }],
        "unsupported": [],
    })
    settings(opened_client)
    monkeypatch.setattr("app.services.ask.create_provider", lambda _config: provider)
    result = ask(
        opened_client,
        "What do the planets orbit?",
        {"kind": "current_note", "note_id": note["id"]},
    )
    assert result["answer"] == "I couldn't find support for this in your notes"
    assert result["claims"] == []
    assert "The planets are made of cheese." in result["unsupported"]
    assert result["searched"]["chunks_searched"] == 1
    assert provider.embed_calls == 0


def test_no_evidence_returns_required_message_and_scope_without_ai(opened_client, monkeypatch):
    create_note(opened_client, "corpus.md", "# Corpus\n\nEntirely unrelated corpus secret.")
    provider = AskProvider({"answer": "should not be called", "claims": [], "unsupported": []})
    settings(opened_client)
    monkeypatch.setattr("app.services.ask.create_provider", lambda _config: provider)
    result = ask(opened_client, "Quasar blimfrob", {"kind": "vault"})
    assert result["answer"] == "I couldn't find support for this in your notes"
    assert result["claims"] == []
    assert result["searched"]["scope_label"] == "Whole vault"
    assert result["searched"]["chunks_searched"] == 0
    assert provider.chat_calls == 0


def test_bm25_answers_and_cites_without_embedding_configuration(opened_client, monkeypatch):
    note = create_note(
        opened_client,
        "folder/orbit.md",
        "# Orbital mechanics\n\nQuartz planets orbit the star Helion.",
    )
    provider = AskProvider({
        "answer": "Quartz planets orbit Helion.",
        "claims": [{
            "text": "Quartz planets orbit the star Helion.",
            "quote": "Quartz planets orbit the star Helion.",
            "note_id": note["id"],
        }],
        "unsupported": [],
    })
    settings(opened_client)
    monkeypatch.setattr("app.services.ask.create_provider", lambda _config: provider)
    result = ask(
        opened_client,
        "Where do quartz planets orbit?",
        {"kind": "folder", "folder": "folder"},
    )
    assert result["answer"] == "Quartz planets orbit the star Helion."
    assert result["claims"][0]["status"] == "verified"
    assert result["claims"][0]["quote"] == "Quartz planets orbit the star Helion."
    assert result["claims"][0]["quote_start"] == note["content"].index(
        "Quartz planets orbit the star Helion."
    )
    assert result["searched"]["retrieval_method"] == "BM25"
    assert result["searched"]["embedding_used"] is False
    assert provider.chat_calls == 1
    assert provider.embed_calls == 0


def test_demo_mode_ask_returns_labeled_verified_passage(opened_client):
    note = create_note(
        opened_client,
        "demo.md",
        "# Orbit\n\nQuartz planets orbit the star Helion.",
    )
    response = opened_client.put(
        "/api/ai/settings",
        json={
            "ollama_url": "http://127.0.0.1:11434",
            "chat_model": "",
            "embedding_model": "",
            "timeout_seconds": 5,
            "demo_mode": True,
        },
    )
    assert response.status_code == 200

    result = ask(
        opened_client,
        "Where do quartz planets orbit?",
        {"kind": "current_note", "note_id": note["id"]},
    )

    assert result["mock"] is True
    assert result["claims"][0]["status"] == "verified"
    assert result["claims"][0]["quote"] == "Quartz planets orbit the star Helion."
    assert "Demo Mode retrieved this passage" in result["answer"]
