from pathlib import Path

import pytest

from app.services.markdown import parse_markdown
from app.services.vault import atomic_write


def create_note(client, content, title=None, path=None):
    response = client.post(
        "/api/notes",
        json={"content": content, "title": title, "path": path},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_list_update_and_delete_notes(opened_client, tmp_path):
    client = opened_client
    created = create_note(client, "# First\n\ninitial searchable phrase", "First")
    assert created["title"] == "First"
    assert Path(created["path"]).suffix == ".md"
    assert (tmp_path / "vault" / created["path"]).is_file()

    listed = client.get("/api/notes?limit=1&offset=0")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    updated = client.put(
        f"/api/notes/{created['id']}",
        json={"content": "# First\n\nedited searchable phrase"},
    )
    assert updated.status_code == 200
    assert "edited searchable phrase" in updated.json()["content"]
    assert client.get("/api/search", params={"q": "initial searchable"}).json()["items"] == []
    assert client.get("/api/search", params={"q": "edited searchable"}).json()["items"]

    deleted = client.delete(f"/api/notes/{created['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}
    assert not (tmp_path / "vault" / created["path"]).exists()
    assert client.get("/api/notes").json()["total"] == 0
    assert client.get("/api/search", params={"q": "edited searchable"}).json()["items"] == []


def test_frontmatter_wikilinks_tags_backlinks_and_search(opened_client):
    client = opened_client
    target = create_note(
        client,
        "---\ntags: [Research]\naliases: [The Source]\ncreated: 2026-01-02\n---\n# Source\n\nEvidence appears here.",
        path="source.md",
    )
    source = create_note(
        client,
        "# Reader\n\nSee [[The Source|the paper]] and [[Missing Note]]. #Work/Ideas",
        path="reader.md",
    )

    links = client.get(f"/api/notes/{source['id']}/links").json()
    assert len(links) == 2
    assert next(link for link in links if link["target_id"])["alias"] == "the paper"
    assert client.get(f"/api/notes/{target['id']}/backlinks").json()["items"][0]["id"] == source["id"]
    assert {item["name"] for item in client.get("/api/tags").json()} == {
        "research",
        "work/ideas",
    }

    found = client.get("/api/search", params={"q": "Evidence appears"})
    assert [item["id"] for item in found.json()["items"]] == [target["id"]]
    assert "<mark>" in found.json()["items"][0]["snippet"]


def test_create_respects_title_with_frontmatter(opened_client):
    response = opened_client.post(
        "/api/notes",
        json={
            "title": "Chosen title",
            "path": "chosen-title.md",
            "content": "---\ntags: [Planning]\n---\nBody text.",
        },
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Chosen title"
    assert "# Chosen title" in response.json()["content"]


def test_archive_restore_updates_search_and_filters(opened_client):
    client = opened_client
    note = create_note(client, "# Archive\n\nuniquearchiveword")
    archived = client.post(f"/api/notes/{note['id']}/archive")
    assert archived.status_code == 200
    assert client.get("/api/notes").json()["total"] == 0
    assert client.get("/api/notes?archived=true").json()["total"] == 1
    assert client.get("/api/search", params={"q": "uniquearchiveword"}).json()["items"] == []

    assert client.post(f"/api/notes/{note['id']}/restore").status_code == 200
    assert len(client.get("/api/search", params={"q": "uniquearchiveword"}).json()["items"]) == 1


@pytest.mark.parametrize("path", ["../outside.md", r"..\outside.md", "C:\\outside.md", "/outside.md"])
def test_path_traversal_rejected(opened_client, tmp_path, path):
    outside = tmp_path / "outside.md"
    response = opened_client.post(
        "/api/notes",
        json={"path": path, "content": "not written"},
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_note_path"
    assert not outside.exists()


def test_invalid_frontmatter_returns_consistent_error(opened_client):
    response = opened_client.post(
        "/api/notes",
        json={"path": "invalid.md", "content": "---\ntags: [unterminated\n"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_markdown"


def test_unknown_api_route_uses_consistent_error_shape(opened_client):
    response = opened_client.get("/api/not-a-route")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "http_error"


def test_external_file_change_is_found_by_rescan(opened_client, tmp_path):
    client = opened_client
    vault = tmp_path / "vault"
    note = create_note(client, "# External\n\nbefore external edit", path="external.md")
    (vault / "external.md").write_text("# External\n\nafter external edit", encoding="utf-8")

    result = client.post("/api/vault/rescan")
    assert result.status_code == 200
    assert result.json()["changed"] == 1
    assert client.get("/api/search", params={"q": "before external"}).json()["items"] == []
    assert client.get("/api/search", params={"q": "after external"}).json()["items"][0]["id"] == note["id"]


def test_revision_deduplication_and_forced_snapshot(opened_client):
    client = opened_client
    note = create_note(client, "# Revision\n\nversion zero")
    client.put(f"/api/notes/{note['id']}", json={"content": "# Revision\n\nversion one"})
    client.put(f"/api/notes/{note['id']}", json={"content": "# Revision\n\nversion two"})
    assert len(client.get(f"/api/notes/{note['id']}/revisions").json()["items"]) == 1

    forced = client.put(
        f"/api/notes/{note['id']}",
        json={"content": "# Revision\n\nversion three", "force_revision": True},
    )
    assert forced.status_code == 200
    revisions = client.get(f"/api/notes/{note['id']}/revisions").json()["items"]
    assert len(revisions) == 2
    revision = client.get(f"/api/revisions/{revisions[0]['id']}")
    assert revision.status_code == 200
    assert "version two" in revision.json()["content"]


def test_atomic_write_leaves_only_complete_file(tmp_path):
    destination = tmp_path / "nested" / "note.md"
    atomic_write(destination, "complete content")
    assert destination.read_text(encoding="utf-8") == "complete content"
    assert list(destination.parent.iterdir()) == [destination]


def test_markdown_parser_extracts_frontmatter_tags_and_wikilinks():
    parsed = parse_markdown(
        "---\ntags: [Planning]\naliases: [First idea]\ncreated: 2026-01-01\n---\n"
        "# Notes\n\n[[First idea|an alias]] #inline",
        "notes.md",
    )
    assert parsed.title == "Notes"
    assert parsed.tags == ("inline", "Planning")
    assert parsed.aliases == ("First idea",)
    assert parsed.created == "2026-01-01"
    assert parsed.wikilinks == (("First idea", "an alias"),)
