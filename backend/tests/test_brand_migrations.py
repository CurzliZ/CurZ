import json
import logging
from pathlib import Path
import sqlite3

from app import config
from app.database import copy_legacy_database
from app.services.sample_vault import (
    LEGACY_MARKER_NAME,
    MARKER_NAME,
    _marker,
    migrate_legacy_sample_folder,
)


def test_legacy_database_is_copied_without_removing_the_original(tmp_path: Path) -> None:
    legacy = tmp_path / "threadwise.db"
    target = tmp_path / "curz.db"
    with sqlite3.connect(legacy) as connection:
        connection.execute("CREATE TABLE user_data (value TEXT)")
        connection.execute("INSERT INTO user_data VALUES ('preserved')")

    assert copy_legacy_database(legacy, target) is True
    with sqlite3.connect(target) as connection:
        assert connection.execute("SELECT value FROM user_data").fetchone() == ("preserved",)
    assert legacy.is_file()
    assert copy_legacy_database(legacy, target) is False


def test_legacy_sample_folder_is_copied_without_removing_user_files(tmp_path: Path) -> None:
    legacy = tmp_path / "Threadwise Sample Vault"
    target = tmp_path / "CurZ Sample Vault"
    legacy.mkdir()
    (legacy / "sample.md").write_text("# Sample", encoding="utf-8")
    (legacy / "my-note.md").write_text("# User note", encoding="utf-8")

    assert migrate_legacy_sample_folder(legacy, target) is True
    assert (target / "sample.md").read_text(encoding="utf-8") == "# Sample"
    assert (target / "my-note.md").read_text(encoding="utf-8") == "# User note"
    assert (legacy / "my-note.md").read_text(encoding="utf-8") == "# User note"


def test_old_sample_manifest_is_copied_to_the_new_name(tmp_path: Path) -> None:
    root = tmp_path / "vault"
    root.mkdir()
    data = {"version": 1, "files": ["sample.md"]}
    old_manifest = root / LEGACY_MARKER_NAME
    old_manifest.write_text(json.dumps(data), encoding="utf-8")

    assert _marker(root) == data
    assert (root / MARKER_NAME).read_text(encoding="utf-8") == json.dumps(data)
    assert old_manifest.is_file()


def test_legacy_environment_value_is_used_with_one_deprecation_notice(
    monkeypatch, caplog
) -> None:
    monkeypatch.setattr(config, "_legacy_notice_logged", False)
    monkeypatch.delenv("CURZ_TEST_SETTING", raising=False)
    monkeypatch.setenv("THREADWISE_TEST_SETTING", "legacy-value")

    with caplog.at_level(logging.WARNING, logger="app.config"):
        value = config.get_environment_value(
            "CURZ_TEST_SETTING",
            "default-value",
            "THREADWISE_TEST_SETTING",
        )

    assert value == "legacy-value"
    assert "Legacy environment variables are deprecated" in caplog.text
