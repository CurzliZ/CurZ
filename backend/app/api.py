from fastapi import APIRouter

from app.ask_api import router as ask_router
from app.ai.api import claims_router, router as ai_router
from app.evolution_api import router as evolution_router
from app.graph_api import router as graph_router
from app.insights_api import router as insights_router
from app.notes_api import router as notes_router
from app.relationships_api import router as relationships_router
from app.search_api import router as search_router
from app.trust_api import router as trust_router
from app.vault_api import router as vault_router

router = APIRouter()
router.include_router(ask_router)
router.include_router(evolution_router)
router.include_router(insights_router)
router.include_router(vault_router)
router.include_router(trust_router)
router.include_router(notes_router)
router.include_router(search_router)
router.include_router(graph_router)
router.include_router(ai_router)
router.include_router(claims_router)
router.include_router(relationships_router)
