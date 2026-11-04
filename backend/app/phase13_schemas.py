from pydantic import BaseModel


class SampleVaultStatus(BaseModel):
    available: bool
    loaded: bool
    note_count: int
    path: str | None


class SampleVaultLoadResult(BaseModel):
    open: bool
    path: str
    note_count: int


class SampleVaultRemoveRequest(BaseModel):
    confirm: bool


class SampleVaultRemoveResult(BaseModel):
    removed: int
    preserved: int
    active_vault: bool


class TrustReportResponse(BaseModel):
    available: bool
    report: dict | None
