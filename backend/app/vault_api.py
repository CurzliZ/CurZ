from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api_common import get_db_session
from app.phase13_schemas import (
    SampleVaultLoadResult,
    SampleVaultRemoveRequest,
    SampleVaultRemoveResult,
    SampleVaultStatus,
)
from app.models import Setting
from app.schemas import RescanResult, VaultPathRequest, VaultStatus
from app.services.index import rescan_vault
from app.services.sample_vault import load_sample_vault, remove_sample_vault, sample_status
from app.services.vault import VAULT_SETTING_KEY, get_vault_root, select_vault

router = APIRouter(prefix="/api/vault", tags=["vault"])


@router.get("/status", response_model=VaultStatus)
def vault_status(session: Session = Depends(get_db_session)) -> VaultStatus:
    setting = session.get(Setting, VAULT_SETTING_KEY)
    if setting is None:
        return VaultStatus(open=False, path=None)
    root = get_vault_root(session, required=False)
    return VaultStatus(open=root is not None, path=str(root) if root else setting.value)


@router.post("/open", response_model=VaultStatus)
def open_vault(
    request: VaultPathRequest,
    session: Session = Depends(get_db_session),
) -> VaultStatus:
    root = select_vault(session, request.path, create=False)
    rescan_vault(session, root)
    return VaultStatus(open=True, path=str(root))


@router.post("/create", response_model=VaultStatus, status_code=status.HTTP_201_CREATED)
def create_vault(
    request: VaultPathRequest,
    session: Session = Depends(get_db_session),
) -> VaultStatus:
    root = select_vault(session, request.path, create=True)
    rescan_vault(session, root)
    return VaultStatus(open=True, path=str(root))


@router.post("/rescan", response_model=RescanResult)
def rescan(session: Session = Depends(get_db_session)) -> RescanResult:
    root = get_vault_root(session)
    return RescanResult(**rescan_vault(session, root))


@router.get("/sample/status", response_model=SampleVaultStatus)
def sample_vault_status(session: Session = Depends(get_db_session)) -> SampleVaultStatus:
    return sample_status(session)


@router.post("/sample/load", response_model=SampleVaultLoadResult)
def load_sample(session: Session = Depends(get_db_session)) -> SampleVaultLoadResult:
    return load_sample_vault(session)


@router.post("/sample/remove", response_model=SampleVaultRemoveResult)
def remove_sample(
    payload: SampleVaultRemoveRequest,
    session: Session = Depends(get_db_session),
) -> SampleVaultRemoveResult:
    return remove_sample_vault(session, payload.confirm)
