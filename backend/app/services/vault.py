from pathlib import Path, PurePosixPath, PureWindowsPath
import os
import tempfile

from sqlalchemy.orm import Session

from app.models import Setting

VAULT_SETTING_KEY = "vault_path"


class VaultError(ValueError):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def select_vault(session: Session, path: str, create: bool) -> Path:
    requested = Path(path).expanduser()
    try:
        if create:
            requested.mkdir(parents=True, exist_ok=True)
        root = requested.resolve(strict=True)
    except (OSError, RuntimeError, ValueError) as error:
        raise VaultError("vault_unavailable", f"Vault folder is unavailable: {error}", 400) from error
    if not root.is_dir():
        raise VaultError("invalid_vault", "Vault path must be a directory.")

    setting = session.get(Setting, VAULT_SETTING_KEY)
    if setting is None:
        session.add(Setting(key=VAULT_SETTING_KEY, value=str(root)))
    else:
        setting.value = str(root)
    session.commit()
    return root


def get_vault_root(session: Session, required: bool = True) -> Path | None:
    setting = session.get(Setting, VAULT_SETTING_KEY)
    if setting is None:
        if required:
            raise VaultError("vault_not_open", "Open or create a vault before accessing notes.", 409)
        return None
    root = Path(setting.value).expanduser().resolve()
    if not root.is_dir():
        raise VaultError(
            "vault_unavailable",
            "The selected vault folder is no longer available.",
            409,
        )
    return root


def resolve_note_path(root: Path, relative_path: str) -> Path:
    normalized = relative_path.replace("\\", "/")
    pure_path = PurePosixPath(normalized)
    windows_path = PureWindowsPath(relative_path)
    if (
        not normalized
        or "\x00" in normalized
        or pure_path.is_absolute()
        or windows_path.is_absolute()
        or bool(windows_path.drive)
        or any(part in {"", ".", ".."} for part in pure_path.parts)
        or pure_path.suffix.casefold() != ".md"
    ):
        raise VaultError(
            "invalid_note_path",
            "Note paths must be relative .md paths within the selected vault.",
        )

    vault_root = root.resolve()
    destination = vault_root.joinpath(*pure_path.parts)
    resolved = destination.resolve()
    try:
        resolved.relative_to(vault_root)
    except ValueError as error:
        raise VaultError(
            "path_outside_vault",
            "The requested note path resolves outside the selected vault.",
        ) from error
    return resolved


def atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def relative_vault_path(root: Path, path: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()
