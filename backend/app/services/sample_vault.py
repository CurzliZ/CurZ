import json
from pathlib import Path
from pathlib import PurePosixPath
import re
import shutil

import yaml
from sqlalchemy.orm import Session

from app.config import APP_NAME
from app.models import Setting
from app.phase13_schemas import (
    SampleVaultLoadResult,
    SampleVaultRemoveResult,
    SampleVaultStatus,
)
from app.services.index import rescan_vault
from app.services.vault import (
    VAULT_SETTING_KEY,
    VaultError,
    atomic_write,
    get_vault_root,
    resolve_note_path,
    select_vault,
)

SAMPLE_SETTING_KEY = "sample_vault_path"
MARKER_NAME = ".curz-sample.json"
LEGACY_MARKER_NAME = ".threadwise-sample.json"
PROJECT_ROOT = Path(__file__).resolve().parents[3]
SOURCE_ROOT = PROJECT_ROOT / "sample-vault"
DESTINATION = Path.home() / f"{APP_NAME} Sample Vault"
LEGACY_DESTINATION = Path.home() / "Threadwise Sample Vault"


def migrate_legacy_sample_folder(
    legacy_path: Path,
    new_path: Path,
    session: Session | None = None,
) -> bool:
    if new_path.exists() or not legacy_path.exists():
        return False
    if legacy_path.is_symlink() or not legacy_path.is_dir():
        raise VaultError(
            "sample_vault_path_invalid",
            "The previous sample-vault path is not a regular folder.",
            409,
        )
    shutil.copytree(legacy_path, new_path, symlinks=True)
    if session is not None:
        for key in (VAULT_SETTING_KEY, SAMPLE_SETTING_KEY):
            setting = session.get(Setting, key)
            if setting and Path(setting.value).expanduser().resolve() == legacy_path.resolve():
                setting.value = str(new_path.resolve())
        session.commit()
    return True


def _sample_paths() -> list[str]:
    if not SOURCE_ROOT.is_dir():
        raise VaultError("sample_vault_missing", "The bundled sample vault is unavailable.", 503)
    return sorted(
        path.relative_to(SOURCE_ROOT).as_posix()
        for path in SOURCE_ROOT.rglob("*.md")
        if path.is_file() and not path.is_symlink()
    )


def _marker(root: Path) -> dict:
    marker_path = root / MARKER_NAME
    legacy_marker = root / LEGACY_MARKER_NAME
    if not marker_path.exists() and legacy_marker.exists():
        if legacy_marker.is_symlink():
            raise VaultError(
                "sample_vault_marker_invalid",
                "The sample-vault manifest must not be a symbolic link.",
                409,
            )
        atomic_write(marker_path, legacy_marker.read_text(encoding="utf-8"))
    if marker_path.is_symlink():
        raise VaultError(
            "sample_vault_marker_invalid",
            "The sample-vault manifest must not be a symbolic link.",
            409,
        )
    if not marker_path.is_file():
        raise VaultError("sample_vault_not_loaded", "No managed sample vault is available to remove.", 404)
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise VaultError("sample_vault_marker_invalid", "The sample-vault manifest could not be read.", 409) from error
    paths = marker.get("files") if isinstance(marker, dict) else None
    if not isinstance(paths, list) or not all(isinstance(item, str) for item in paths):
        raise VaultError("sample_vault_marker_invalid", "The sample-vault manifest is invalid.", 409)
    return marker


def _marked_sample_file(root: Path, relative_path: str) -> Path | None:
    candidate = root
    for part in PurePosixPath(relative_path.replace("\\", "/")).parts:
        candidate = candidate / part
        if candidate.is_symlink():
            return None
    path = resolve_note_path(root, relative_path)
    if not path.is_file():
        return None
    try:
        content = path.read_text(encoding="utf-8")
        match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|\Z)", content, re.DOTALL)
        if match is None:
            return None
        frontmatter = yaml.safe_load(match.group(1))
    except (OSError, UnicodeError, yaml.YAMLError):
        return None
    return path if isinstance(frontmatter, dict) and frontmatter.get("sample") is True else None


def sample_status(session: Session) -> SampleVaultStatus:
    migrate_legacy_sample_folder(LEGACY_DESTINATION, DESTINATION, session)
    source_exists = SOURCE_ROOT.is_dir()
    configured = session.get(Setting, SAMPLE_SETTING_KEY)
    if configured is None:
        return SampleVaultStatus(available=source_exists, loaded=False, note_count=0, path=None)
    root = Path(configured.value).expanduser().resolve()
    if not root.is_dir():
        return SampleVaultStatus(available=source_exists, loaded=False, note_count=0, path=None)
    marker = _marker(root)
    remaining = sum(_marked_sample_file(root, item) is not None for item in marker["files"])
    return SampleVaultStatus(
        available=source_exists,
        loaded=True,
        note_count=remaining,
        path=str(root),
    )


def load_sample_vault(session: Session) -> SampleVaultLoadResult:
    migrate_legacy_sample_folder(LEGACY_DESTINATION, DESTINATION, session)
    paths = _sample_paths()
    if DESTINATION.is_symlink():
        raise VaultError(
            "sample_vault_destination_in_use",
            "The dedicated sample-vault path is a symbolic link; choose another location before loading.",
            409,
        )
    destination = DESTINATION.resolve()
    if destination.exists():
        marker_path = destination / MARKER_NAME
        if not marker_path.is_file():
            if any(destination.iterdir()):
                raise VaultError(
                    "sample_vault_destination_in_use",
                    f"{destination} already contains files and is not a {APP_NAME} sample vault.",
                    409,
                )
        else:
            marker = _marker(destination)
            if marker["files"] != paths:
                raise VaultError(
                    "sample_vault_version_mismatch",
                    "The existing sample vault was created from a different sample set; remove it before loading this version.",
                    409,
                )
    destination.mkdir(parents=True, exist_ok=True)
    if not (destination / MARKER_NAME).exists():
        for relative in paths:
            source = resolve_note_path(SOURCE_ROOT, relative)
            target = resolve_note_path(destination, relative)
            atomic_write(target, source.read_text(encoding="utf-8"))
        atomic_write(
            destination / MARKER_NAME,
            json.dumps({"version": 1, "files": paths}, indent=2) + "\n",
        )
    select_vault(session, str(destination), create=False)
    setting = session.get(Setting, SAMPLE_SETTING_KEY)
    if setting is None:
        session.add(Setting(key=SAMPLE_SETTING_KEY, value=str(destination)))
    else:
        setting.value = str(destination)
    rescan_vault(session, destination)
    remaining = sum(_marked_sample_file(destination, item) is not None for item in paths)
    return SampleVaultLoadResult(open=True, path=str(destination), note_count=remaining)


def remove_sample_vault(
    session: Session, confirm: bool
) -> SampleVaultRemoveResult:
    migrate_legacy_sample_folder(LEGACY_DESTINATION, DESTINATION, session)
    if not confirm:
        raise VaultError("confirmation_required", "Confirm removal of sample files.", 400)
    setting = session.get(Setting, SAMPLE_SETTING_KEY)
    if setting is None:
        raise VaultError("sample_vault_not_loaded", "No managed sample vault is available to remove.", 404)
    if DESTINATION.is_symlink():
        raise VaultError("sample_vault_path_invalid", "The sample-vault location is a symbolic link.", 409)
    root = Path(setting.value).expanduser().resolve()
    if root not in {DESTINATION.resolve(), LEGACY_DESTINATION.resolve()} or not root.is_dir():
        raise VaultError("sample_vault_path_invalid", "The managed sample-vault path is unavailable.", 409)
    marker = _marker(root)
    removed = 0
    for relative in marker["files"]:
        path = _marked_sample_file(root, relative)
        if path is not None:
            path.unlink()
            removed += 1
    (root / MARKER_NAME).unlink()
    legacy_marker = root / LEGACY_MARKER_NAME
    if legacy_marker.exists():
        legacy_marker.unlink()
    session.delete(setting)
    active_root = get_vault_root(session, required=False)
    is_active = active_root == root
    if is_active:
        rescan_vault(session, root)
    else:
        session.commit()
    remaining_files = [
        path for path in root.rglob("*.md")
        if path.is_file() and not path.is_symlink()
    ]
    return SampleVaultRemoveResult(
        removed=removed,
        preserved=len(remaining_files),
        active_vault=is_active,
    )
