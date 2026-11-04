from datetime import timedelta
import hashlib
import time

from app.models import Claim, Evidence, Note, Revision, utc_now
from app.phase12_schemas import EvolutionScope, EvolutionSummaryOutput
from app.services.evolution import build_timeline, verify_evolution_summary


def create_note(client, path, content):
    response = client.post("/api/notes", json={"path": path, "content": content})
    assert response.status_code == 201, response.text
    return response.json()


def test_evolution_timeline_orders_verified_claims_by_revision_date(opened_client):
    note = create_note(
        opened_client,
        "evolving.md",
        "# Evolution\n\nToday, the result is 42.",
    )
    old_content = "# Evolution\n\nAt first, the result was uncertain."
    old_hash = hashlib.sha256(old_content.encode("utf-8")).hexdigest()
    old_date = utc_now() - timedelta(days=30)
    with opened_client.app.state.session_factory() as session:
        db_note = session.get(Note, note["id"])
        current_updated_at = db_note.updated_at
        current_created_at = db_note.created_at
        session.add(
            Revision(
                note_id=note["id"],
                content_hash=old_hash,
                content=old_content,
                created_at=old_date,
            )
        )
        older = Claim(note_id=note["id"], text="The result was uncertain.", state="superseded")
        newer = Claim(note_id=note["id"], text="The result is 42.", state="verified")
        session.add_all([older, newer])
        session.flush()
        session.add_all(
            [
                Evidence(
                    claim_id=older.id,
                    note_id=note["id"],
                    quote="At first, the result was uncertain.",
                    quote_start=old_content.index("At first"),
                    quote_end=len(old_content),
                    source_hash=old_hash,
                    status="stale",
                ),
                Evidence(
                    claim_id=newer.id,
                    note_id=note["id"],
                    quote="Today, the result is 42.",
                    quote_start=note["content"].index("Today"),
                    quote_end=len(note["content"]),
                    source_hash=db_note.content_hash,
                    status="verified",
                ),
            ]
        )
        session.commit()
        timeline = build_timeline(session, EvolutionScope(note_id=note["id"]))

    assert [item.text for item in timeline.items] == [
        "The result was uncertain.",
        "The result is 42.",
    ]
    assert timeline.items[0].timestamp == old_date
    assert timeline.items[1].timestamp == current_updated_at
    assert timeline.items[1].note_created_at == current_created_at
    assert timeline.items[1].note_updated_at == current_updated_at
    assert timeline.has_enough_history

    ai_settings = opened_client.put(
        "/api/ai/settings",
        json={
            "ollama_url": "http://127.0.0.1:11434",
            "chat_model": "",
            "embedding_model": "",
            "timeout_seconds": 5,
            "demo_mode": True,
        },
    )
    assert ai_settings.status_code == 200
    started = opened_client.post(
        "/api/evolution/summarize",
        json={"note_id": note["id"]},
    )
    assert started.status_code == 202
    task_id = started.json()["id"]
    for _ in range(100):
        task = opened_client.get(f"/api/ai/tasks/{task_id}").json()
        if task["status"] in {"succeeded", "failed"}:
            break
        time.sleep(0.01)
    assert task["status"] == "succeeded", task["error"]
    assert task["result"]["interpretation"] is True
    assert task["result"]["mock"] is True


def test_evolution_summary_discards_unverified_change_quotes():
    claims = [
        {"id": 1, "timestamp": "2026-01-01T00:00:00", "quote": "The result was uncertain."},
        {"id": 2, "timestamp": "2026-02-01T00:00:00", "quote": "The result is 42."},
    ]
    output = EvolutionSummaryOutput(
        summary="The view became more certain.",
        changes=[
            {
                "from_quote": "The result was uncertain.",
                "to_quote": "The result is 42.",
                "description": "Moved to a specific answer.",
            },
            {
                "from_quote": "It used to be uncertain.",
                "to_quote": "The result is 42.",
                "description": "Fabricated first quote.",
            },
        ],
    )

    result = verify_evolution_summary(claims, output)

    assert len(result["changes"]) == 1
    assert result["changes"][0]["from_claim_id"] == 1
    assert result["changes"][0]["to_claim_id"] == 2
    assert result["interpretation"] is True


def test_gaps_find_orphans_and_unmentioned_open_questions(opened_client):
    note = create_note(
        opened_client,
        "ideas.md",
        "# Questions\n\nTODO: What should we investigate next?\n\nHow does this unresolved idea work?",
    )
    create_note(
        opened_client,
        "mentions.md",
        "# Mention\n\nWe should ask: How does this unresolved idea work?",
    )
    response = opened_client.get("/api/insights/gaps")
    assert response.status_code == 200
    result = response.json()
    assert note["id"] in {item["note_id"] for item in result["orphans"]}
    questions = [item["text"] for item in result["open_questions"]]
    assert "TODO: What should we investigate next?" in questions
    assert not any("How does this unresolved idea work?" in item for item in questions)


def test_revisit_explains_link_reason_and_persists_dismissal(opened_client):
    anchor = create_note(opened_client, "anchor.md", "# Anchor\n\n[[Candidate]]")
    candidate = create_note(opened_client, "Candidate.md", "# Candidate\n\nA linked idea.")

    response = opened_client.get(f"/api/revisit?current_note_id={anchor['id']}")
    assert response.status_code == 200
    item = next(item for item in response.json()["items"] if item["note_id"] == candidate["id"])
    assert item["reason_code"] == "related_to_current"
    assert "Anchor" in item["reason"]

    saved = opened_client.put(
        f"/api/revisit/{candidate['id']}",
        json={"state": "saved"},
    )
    assert saved.status_code == 200
    for index in range(6):
        create_note(opened_client, f"recent-{index}.md", f"# Recent {index}")
    saved_items = opened_client.get("/api/revisit").json()["items"]
    saved_candidate = next(item for item in saved_items if item["note_id"] == candidate["id"])
    assert saved_candidate["state"] == "saved"

    dismissed = opened_client.put(
        f"/api/revisit/{candidate['id']}",
        json={"state": "dismissed"},
    )
    assert dismissed.status_code == 200
    refreshed = opened_client.get(f"/api/revisit?current_note_id={anchor['id']}")
    assert candidate["id"] not in {item["note_id"] for item in refreshed.json()["items"]}
