import json
from pathlib import Path

from fastapi import APIRouter

from app.phase13_schemas import TrustReportResponse
from app.services.vault import VaultError

router = APIRouter(prefix="/api/trust-report", tags=["trust report"])
RESULTS_PATH = Path(__file__).resolve().parents[2] / "evals" / "results" / "latest.json"


@router.get("", response_model=TrustReportResponse)
def read_trust_report() -> TrustReportResponse:
    if not RESULTS_PATH.is_file():
        return TrustReportResponse(available=False, report=None)
    try:
        report = json.loads(RESULTS_PATH.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise VaultError(
            "trust_report_unavailable",
            "The latest evaluation report could not be read. Run the evaluation again.",
            503,
        ) from error
    if not isinstance(report, dict):
        raise VaultError("trust_report_invalid", "The latest evaluation report is invalid.", 503)
    return TrustReportResponse(available=True, report=report)
