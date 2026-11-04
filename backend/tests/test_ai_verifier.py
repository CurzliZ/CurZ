import json
import time

from app.ai.providers import AIProviderError, ChatResult
from app.ai.verifier import verify_quote
from app.models import AITask, Evidence
from app.services.index import content_hash


def test_verifier_exact_quote_returns_original_character_span():
    note = "Intro.\nA stable claim remains true."
    quote = "A stable claim remains true."
    span = verify_quote(note, quote)
    assert span is not None
    assert note[span.start:span.end] == quote
    assert span.start == note.index(quote)


def test_verifier_collapses_whitespace_differences():
    note = "The first line\n\tand the second line."
    span = verify_quote(note, "first   line and the\n second")
    assert span is not None
    assert note[span.start:span.end] == "first line\n\tand the second"


def test_verifier_ignores_markdown_formatting_and_unifies_quotes_and_dashes():
    note = "# **A \u201cwell-made\u201d note**\n\n- It holds\u2014under pressure."
    span = verify_quote(note, '"well-made" note It holds-under pressure')
    assert span is not None
    assert note[span.start:span.end] == "\u201cwell-made\u201d note**\n\n- It holds\u2014under pressure"


def test_verifier_rejects_fabricated_quote():
    assert verify_quote("A note about careful research.", "The study proves certainty.") is None


def test_verifier_accepts_a_partial_quote_that_is_present():
    note = "Evidence supports a limited conclusion, not certainty."
    quote = "a limited conclusion"
    span = verify_quote(note, quote)
    assert span is not None
    assert note[span.start:span.end] == quote


def test_verifier_rejects_empty_or_markdown_only_quote():
    assert verify_quote("A real sentence.", "") is None
    assert verify_quote("A real sentence.", "**`__~~") is None


def _start_extraction(client, monkeypatch, response_content):
    note_response = client.post(
        "/api/notes",
        json={"path": "evidence.md", "content": "# Evidence\n\nWater freezes at zero degrees Celsius."},
    )
    assert note_response.status_code == 201, note_response.text
    note = note_response.json()
    settings = client.put(
        "/api/ai/settings",
        json={
            "ollama_url": "http://127.0.0.1:11434",
            "chat_model": "test-model",
            "embedding_model": "",
            "timeout_seconds": 1,
            "demo_mode": False,
        },
    )
    assert settings.status_code == 200, settings.text

    class FakeProvider:
        async def chat(self, messages, json_schema=None):
            assert len(messages) == 2
            assert "Water freezes" in messages[1]["content"]
            assert json_schema is not None
            if isinstance(response_content, Exception):
                raise response_content
            return ChatResult(response_content, "test-model", False)

        async def embed(self, texts):
            raise AssertionError(texts)

        async def health(self):
            raise AssertionError

    monkeypatch.setattr("app.ai.tasks.create_provider", lambda _config: FakeProvider())
    started = client.post(f"/api/notes/{note['id']}/claims/extract")
    assert started.status_code == 202, started.text
    task_id = started.json()["id"]
    for _ in range(100):
        task = client.get(f"/api/ai/tasks/{task_id}").json()
        if task["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.01)
    return note, task


def test_fabricated_quote_is_never_stored_as_evidence(opened_client, monkeypatch):
    output = json.dumps({
        "claims": [
            {
                "claim_text": "Water freezes at zero degrees Celsius.",
                "quote": "Water freezes at zero degrees Celsius.",
                "heading": "Evidence",
            },
            {
                "claim_text": "Water always boils at a fixed temperature.",
                "quote": "Water boils at exactly 100 degrees everywhere.",
                "heading": "Evidence",
            },
        ]
    })
    note, task = _start_extraction(opened_client, monkeypatch, output)
    assert task["status"] == "succeeded"
    response = opened_client.get(f"/api/notes/{note['id']}/claims")
    assert response.status_code == 200
    body = response.json()
    assert len(body["claims"]) == 2
    assert sum(len(claim["evidence"]) for claim in body["claims"]) == 1
    assert sum(claim["interpretation"] for claim in body["claims"]) == 1
    assert body["stats"] == {"raw_quotes": 2, "verified_quotes": 1}


def test_editing_note_marks_removed_evidence_stale(opened_client, monkeypatch):
    output = json.dumps({
        "claims": [{
            "claim_text": "Water freezes at zero degrees Celsius.",
            "quote": "Water freezes at zero degrees Celsius.",
            "heading": "Evidence",
        }]
    })
    note, task = _start_extraction(opened_client, monkeypatch, output)
    assert task["status"] == "succeeded"
    updated = opened_client.put(
        f"/api/notes/{note['id']}",
        json={"content": "# Evidence\n\nWater freezes near zero in ordinary conditions."},
    )
    assert updated.status_code == 200
    body = opened_client.get(f"/api/notes/{note['id']}/claims").json()
    assert body["claims"][0]["interpretation"] is False
    evidence = body["claims"][0]["evidence"][0]
    assert evidence["status"] == "stale"
    assert evidence["source_hash"] == content_hash(note["content"])


def test_failed_extraction_leaves_note_untouched(opened_client, monkeypatch):
    note, task = _start_extraction(
        opened_client,
        monkeypatch,
        AIProviderError("timeout", "Test provider timed out."),
    )
    assert task["status"] == "failed"
    assert opened_client.get(f"/api/notes/{note['id']}").json()["content"] == note["content"]
    assert opened_client.get(f"/api/notes/{note['id']}/claims").json()["claims"] == []


def test_unverified_quotes_are_not_inserted_as_evidence(opened_client):
    note = opened_client.post(
        "/api/notes",
        json={"path": "stored.md", "content": "# A note\n\nOriginal text."},
    ).json()
    with opened_client.app.state.session_factory() as session:
        from app.models import Note
        from app.ai.claims import persist_verified_claims

        indexed_note = session.get(Note, note["id"])
        task_id = "test-task-without-foreign-key"
        session.add(
            AITask(
                id=task_id,
                type="extract_claims",
                status="succeeded",
                provider="ollama",
                model="test",
            )
        )
        session.flush()
        raw, verified = persist_verified_claims(
            session,
            indexed_note,
            task_id,
            note["content"],
            [{"claim_text": "A fabricated assertion.", "quote": "Fabricated quotation.", "heading": None}],
            mock=False,
        )
        session.commit()
        stored = session.query(Evidence).filter_by(note_id=note["id"]).count()
    assert (raw, verified, stored) == (1, 0, 0)
