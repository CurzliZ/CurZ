from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api import router
from app.config import API_TITLE, settings
from app.database import make_engine, make_session_factory
from app.migrations import upgrade_database
from app.schemas import ErrorResponse
from app.services.markdown import MarkdownError
from app.services.vault import VaultError

logger = logging.getLogger(__name__)


def create_app(database_url: str | None = None) -> FastAPI:
    engine = make_engine(database_url)
    session_factory = make_session_factory(engine)

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        upgrade_database(engine)
        yield
        engine.dispose()

    application = FastAPI(
        title=settings.app_name or API_TITLE,
        description="Local-first notes with verified, user-controlled AI insights.",
        version="0.1.0",
        lifespan=lifespan,
    )
    application.state.session_factory = session_factory
    application.state.ai_jobs = {}
    application.include_router(router)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @application.exception_handler(VaultError)
    async def vault_error_handler(_request: Request, error: VaultError) -> JSONResponse:
        body = ErrorResponse(
            error={"code": error.code, "message": error.message}
        ).model_dump()
        return JSONResponse(status_code=error.status_code, content=body)

    @application.exception_handler(MarkdownError)
    async def markdown_error_handler(
        _request: Request, error: MarkdownError
    ) -> JSONResponse:
        body = ErrorResponse(
            error={"code": "invalid_markdown", "message": str(error)}
        ).model_dump()
        return JSONResponse(status_code=422, content=body)

    @application.exception_handler(StarletteHTTPException)
    async def http_error_handler(
        _request: Request, error: StarletteHTTPException
    ) -> JSONResponse:
        message = str(error.detail)
        body = ErrorResponse(
            error={"code": "http_error", "message": message}
        ).model_dump()
        return JSONResponse(status_code=error.status_code, content=body, headers=error.headers)

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        messages = "; ".join(
            f"{'.'.join(str(part) for part in issue['loc'])}: {issue['msg']}"
            for issue in error.errors()
        )
        body = ErrorResponse(
            error={"code": "validation_error", "message": messages}
        ).model_dump()
        return JSONResponse(status_code=422, content=body)

    @application.exception_handler(Exception)
    async def unexpected_error_handler(
        _request: Request, error: Exception
    ) -> JSONResponse:
        logger.error(
            "Unhandled API error",
            exc_info=(type(error), error, error.__traceback__),
        )
        body = ErrorResponse(
            error={"code": "internal_error", "message": "An unexpected server error occurred."}
        ).model_dump()
        return JSONResponse(status_code=500, content=body)

    @application.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
