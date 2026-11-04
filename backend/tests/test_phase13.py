import json

from app.trust_api import read_trust_report
import app.services.sample_vault as sample_vault


def test_sample_vault_load_and_remove_preserves_other_files(
    opened_client, tmp_path, monkeypatch
):
    destination = tmp_path / "CurZ Sample Vault"
    monkeypatch.setattr(sample_vault, "DESTINATION", destination)
    monkeypatch.setattr(sample_vault, "LEGACY_DESTINATION", tmp_path / "legacy sample")

    loaded = opened_client.post("/api/vault/sample/load")

    assert loaded.status_code == 200, loaded.text
    result = loaded.json()
    assert result["note_count"] == 43
    assert len(list(destination.rglob("*.md"))) == 43
    (destination / sample_vault.MARKER_NAME).replace(
        destination / sample_vault.LEGACY_MARKER_NAME
    )

    personal = destination / "personal.md"
    personal.write_text(
        "---\nsample: false\n---\n# My note\n\nKeep this file.\n",
        encoding="utf-8",
    )
    unconfirmed = opened_client.post(
        "/api/vault/sample/remove",
        json={"confirm": False},
    )
    assert unconfirmed.status_code == 400
    assert personal.is_file()

    removed = opened_client.post(
        "/api/vault/sample/remove",
        json={"confirm": True},
    )
    assert removed.status_code == 200, removed.text
    assert removed.json() == {"removed": 43, "preserved": 1, "active_vault": True}
    assert personal.read_text(encoding="utf-8").endswith("Keep this file.\n")
    assert len(list(destination.rglob("*.md"))) == 1
    assert not (destination / sample_vault.MARKER_NAME).exists()
    assert not (destination / sample_vault.LEGACY_MARKER_NAME).exists()
    status = opened_client.get("/api/vault/sample/status")
    assert status.json()["loaded"] is False


def test_sample_vault_refuses_to_copy_over_an_unmanaged_directory(
    opened_client, tmp_path, monkeypatch
):
    destination = tmp_path / "CurZ Sample Vault"
    destination.mkdir()
    keep = destination / "keep.md"
    keep.write_text("# Keep\n", encoding="utf-8")
    monkeypatch.setattr(sample_vault, "DESTINATION", destination)
    monkeypatch.setattr(sample_vault, "LEGACY_DESTINATION", tmp_path / "legacy sample")

    response = opened_client.post("/api/vault/sample/load")

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "sample_vault_destination_in_use"
    assert keep.read_text(encoding="utf-8") == "# Keep\n"


def test_trust_report_reads_only_the_latest_report(monkeypatch, tmp_path):
    from app import trust_api

    path = tmp_path / "latest.json"
    monkeypatch.setattr(trust_api, "RESULTS_PATH", path)
    assert read_trust_report().available is False

    expected = {"status": "completed", "metrics": {"example": {"rate": 0.25}}}
    path.write_text(json.dumps(expected), encoding="utf-8")

    result = read_trust_report()

    assert result.available is True
    assert result.report == expected


def test_bundled_sample_vault_has_original_dated_sample_notes():
    paths = sample_vault._sample_paths()

    assert len(paths) == 43
    assert {path.split("/", 1)[0] for path in paths} == {
        "machine-learning",
        "learning",
        "startup",
    }
    for relative in paths:
        content = sample_vault.resolve_note_path(sample_vault.SOURCE_ROOT, relative).read_text(
            encoding="utf-8"
        )
        assert content.startswith("---\n")
        assert "sample: true" in content
        assert "created:" in content
