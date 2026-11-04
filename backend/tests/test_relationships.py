import json
import time

from app.ai.providers import ChatResult
from app.services.relationships import select_candidates


def create_note(client, path, content):
    response = client.post("/api/notes", json={"path": path, "content": content})
    assert response.status_code == 201, response.text
    return response.json()


def related_notes(client):
    source = create_note(client, "source.md", "#shared\n\nSource fact Alpha.")
    target = create_note(client, "target.md", "#shared\n\nTarget fact Beta.")
    return source, target


class JudgmentProvider:
    def __init__(self, source_quote="Source fact Alpha.", target_quote="Target fact Beta."):
        self.source_quote = source_quote
        self.target_quote = target_quote

    async def chat(self, messages, json_schema=None):
        assert json_schema is not None
        return ChatResult(
            json.dumps({
                "type": "tension",
                "explanation": "The notes frame the same topic differently.",
                "source_quote": self.source_quote,
                "target_quote": self.target_quote,
                "confidence": 0.7,
            }),
            "test-model",
            False,
        )

    async def embed(self, texts):
        raise AssertionError(texts)

    async def health(self):
        raise AssertionError


def configure_provider(client, monkeypatch, provider):
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
    monkeypatch.setattr("app.ai.tasks.create_provider", lambda _config: provider)


def run_generation(client):
    started = client.post("/api/relationships/generate")
    assert started.status_code == 202, started.text
    task_id = started.json()["id"]
    for _ in range(100):
        task = client.get(f"/api/ai/tasks/{task_id}").json()
        if task["status"] in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.01)
    assert task["status"] == "succeeded", task
    return task


def get_proposal(client, view="tensions"):
    items = client.get(f"/api/relationships/review?view={view}").json()["items"]
    assert len(items) == 1
    return items[0]


def test_candidate_generation_shortlists_shared_tags_only(opened_client):
    source, target = related_notes(opened_client)
    create_note(opened_client, "unrelated.md", "#other\n\nAn unrelated statement.")
    with opened_client.app.state.session_factory() as session:
        from app.services.vault import get_vault_root

        candidates = select_candidates(session, get_vault_root(session))
    assert [(item["source"].id, item["target"].id) for item in candidates] == [
        (source["id"], target["id"])
    ]


def test_proposal_without_verified_quotes_on_both_notes_is_discarded(opened_client, monkeypatch):
    related_notes(opened_client)
    configure_provider(
        opened_client,
        monkeypatch,
        JudgmentProvider(target_quote="A statement absent from the target note."),
    )
    task = run_generation(opened_client)
    assert task["result"]["candidate_count"] == 1
    assert task["result"]["proposed_count"] == 0
    assert opened_client.get("/api/relationships/review?view=tensions").json()["items"] == []


def test_rejected_proposal_is_not_regenerated_for_unchanged_notes(opened_client, monkeypatch):
    related_notes(opened_client)
    configure_provider(opened_client, monkeypatch, JudgmentProvider())
    run_generation(opened_client)
    proposal = get_proposal(opened_client)
    dismissed = opened_client.post(
        f"/api/relationships/{proposal['id']}/decision",
        json={"action": "dismiss"},
    )
    assert dismissed.status_code == 200
    assert dismissed.json()["state"] == "rejected"
    assert run_generation(opened_client)["result"]["candidate_count"] == 0


def test_note_edit_marks_relationship_outdated_and_evidence_stale(opened_client, monkeypatch):
    source, _target = related_notes(opened_client)
    configure_provider(opened_client, monkeypatch, JudgmentProvider())
    run_generation(opened_client)
    proposal = get_proposal(opened_client)
    updated = opened_client.put(
        f"/api/notes/{source['id']}",
        json={"content": "#shared\n\nA changed source statement."},
    )
    assert updated.status_code == 200
    stale = opened_client.get("/api/relationships/review?view=stale").json()["items"]
    assert len(stale) == 1
    assert stale[0]["state"] == "outdated"
    assert any(item["status"] == "stale" for item in stale[0]["evidence"])


def test_mock_proposal_acceptance_adds_reasoned_graph_edge(opened_client):
    source, target = related_notes(opened_client)
    settings = opened_client.put(
        "/api/ai/settings",
        json={
            "ollama_url": "http://127.0.0.1:11434",
            "chat_model": "",
            "embedding_model": "",
            "timeout_seconds": 5,
            "demo_mode": True,
        },
    )
    assert settings.status_code == 200
    task = run_generation(opened_client)
    assert task["result"]["mock"] is True
    assert task["result"]["proposed_count"] == 1
    proposal = get_proposal(opened_client, "relations")
    assert proposal["origin"] == "ai"
    assert {proof["note_id"] for proof in proposal["evidence"]} == {
        source["id"],
        target["id"],
    }
    accepted = opened_client.post(
        f"/api/relationships/{proposal['id']}/decision",
        json={"action": "accept"},
    )
    assert accepted.status_code == 200
    assert accepted.json()["state"] == "accepted"
    graph = opened_client.get(
        "/api/graph/overview",
        params={"limit": 20, "explicit": False, "reasoned": True},
    ).json()
    edge = next(edge for edge in graph["edges"] if edge["kind"] == "reasoned")
    assert edge["state"] == "accepted"
    assert edge["relationship_type"] == "supports"


def test_rejected_proposal_is_reconsidered_when_note_content_changes(opened_client, monkeypatch):
    source, _target = related_notes(opened_client)
    configure_provider(opened_client, monkeypatch, JudgmentProvider())
    run_generation(opened_client)
    proposal = get_proposal(opened_client)
    opened_client.post(f"/api/relationships/{proposal['id']}/decision", json={"action": "dismiss"})
    assert run_generation(opened_client)["result"]["candidate_count"] == 0

    # Changing note content unsuppresses the rejected candidate
    opened_client.put(
        f"/api/notes/{source['id']}",
        json={"content": "#shared\n\nSource fact Alpha modified."},
    )
    configure_provider(
        opened_client,
        monkeypatch,
        JudgmentProvider(source_quote="Source fact Alpha modified."),
    )
    task2 = run_generation(opened_client)
    assert task2["result"]["candidate_count"] == 1
    assert task2["result"]["proposed_count"] == 1


def test_cannot_accept_stale_proposal_without_editing(opened_client, monkeypatch):
    source, _target = related_notes(opened_client)
    configure_provider(opened_client, monkeypatch, JudgmentProvider())
    run_generation(opened_client)
    proposal = get_proposal(opened_client)

    # Edit note so evidence becomes stale
    opened_client.put(
        f"/api/notes/{source['id']}",
        json={"content": "#shared\n\nNew wording without original quote."},
    )
    stale_items = opened_client.get("/api/relationships/review?view=stale").json()["items"]
    assert len(stale_items) == 1
    stale_id = stale_items[0]["id"]

    # Direct accept should fail with 409
    fail_accept = opened_client.post(
        f"/api/relationships/{stale_id}/decision",
        json={"action": "accept"},
    )
    assert fail_accept.status_code == 409
    assert fail_accept.json()["error"]["code"] == "relationship_evidence_stale"

    # Editing with fresh verified quotes succeeds
    edit_accept = opened_client.post(
        f"/api/relationships/{stale_id}/decision",
        json={
            "action": "edit",
            "relationship_type": "supports",
            "explanation": "Updated explanation with fresh quotes.",
            "source_quote": "New wording without original quote.",
            "target_quote": "Target fact Beta.",
        },
    )
    assert edit_accept.status_code == 200
    assert edit_accept.json()["state"] == "accepted"
    assert edit_accept.json()["relationship_type"] == "supports"
    assert all(e["status"] == "verified" for e in edit_accept.json()["evidence"])


def test_manual_relationship_creation_validation_and_graph(opened_client):
    source, target = related_notes(opened_client)

    # Self-relationship rejected
    self_rel = opened_client.post(
        "/api/relationships",
        json={
            "source_note_id": source["id"],
            "target_note_id": source["id"],
            "relationship_type": "supports",
            "explanation": "Self note",
            "source_quote": "Source fact Alpha.",
            "target_quote": "Source fact Alpha.",
        },
    )
    assert self_rel.status_code == 422

    # Unverified quote rejected
    bad_quote = opened_client.post(
        "/api/relationships",
        json={
            "source_note_id": source["id"],
            "target_note_id": target["id"],
            "relationship_type": "extends",
            "explanation": "Extends idea",
            "source_quote": "Quote that does not exist.",
            "target_quote": "Target fact Beta.",
        },
    )
    assert bad_quote.status_code == 422
    assert bad_quote.json()["error"]["code"] == "unverified_relationship_evidence"

    # Valid manual relationship
    good_rel = opened_client.post(
        "/api/relationships",
        json={
            "source_note_id": source["id"],
            "target_note_id": target["id"],
            "relationship_type": "extends",
            "explanation": "Valid manual extension.",
            "source_quote": "Source fact Alpha.",
            "target_quote": "Target fact Beta.",
        },
    )
    assert good_rel.status_code == 201
    created = good_rel.json()
    assert created["origin"] == "manual"
    assert created["state"] == "accepted"

    # Reflected in graph overview with reasoned degree
    graph = opened_client.get(
        "/api/graph/overview",
        params={"limit": 20, "explicit": False, "reasoned": True},
    ).json()
    edge = next(e for e in graph["edges"] if e["relationship_id"] == created["id"])
    assert edge["kind"] == "reasoned"
    assert edge["relationship_type"] == "extends"
    # Node degrees include the reasoned connection
    node_map = {n["id"]: n["degree"] for n in graph["nodes"]}
    assert node_map[source["id"]] >= 1
    assert node_map[target["id"]] >= 1
