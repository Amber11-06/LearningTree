from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from .auth import get_current_user, router as auth_router
from .config import get_settings
from .courses import get_builtin_course
from .db import get_db, init_db
from .models import User
from .schemas import CourseImportIn, WorkspaceSaveIn
from .validation import DataValidationError
from .workspace import (
    RevisionConflict,
    import_course,
    read_workspace,
    save_workspace,
)

logger = logging.getLogger("learningtree")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    get_builtin_course()
    logger.info("LearningTree API ready; PostgreSQL storage enabled")
    yield


app = FastAPI(
    title="LearningTree API",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)


@app.middleware("http")
async def local_guard(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        if origin and origin not in settings.origin_list:
            # Behind an ingress the public Host/X-Forwarded-Host is the
            # authoritative same-origin check. This keeps the public preview
            # URL working without hard-coding it into every deployment.
            forwarded = request.headers.get("x-forwarded-host", "")
            host = forwarded.split(",")[0].strip() or request.headers.get("host", "")
            origin_host = urlsplit(origin).netloc
            if not host or origin_host.lower() != host.lower():
                return JSONResponse(
                    status_code=403,
                    content={
                        "error": "不允许从其他站点修改学习数据。",
                        "code": "forbidden_origin",
                    },
                )
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                length = int(content_length)
            except ValueError:
                return JSONResponse(
                    status_code=400,
                    content={"error": "请求长度无效。", "code": "invalid_request"},
                )
            if length > settings.workspace_max_bytes:
                return JSONResponse(
                    status_code=413,
                    content={"error": "内容超过 32 MB，请拆分课程包。", "code": "too_large"},
                )
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Accept"],
)

app.include_router(auth_router)


@app.exception_handler(RevisionConflict)
async def revision_conflict_handler(_: Request, exc: RevisionConflict):
    return JSONResponse(
        status_code=409,
        content={"error": str(exc), "code": "revision_conflict"},
    )


@app.exception_handler(DataValidationError)
async def validation_handler(_: Request, exc: DataValidationError):
    return JSONResponse(
        status_code=422,
        content={"error": str(exc), "code": "invalid_data"},
    )


@app.exception_handler(RequestValidationError)
async def request_validation_handler(_: Request, exc: RequestValidationError):
    message = "内容格式不完整或字段类型不正确。"
    errors = exc.errors()
    if errors:
        raw = str(errors[0].get("msg", ""))
        if raw.startswith("Value error, "):
            raw = raw[len("Value error, ") :]
        if any("\u3400" <= char <= "\u9fff" for char in raw):
            message = raw
    return JSONResponse(
        status_code=422,
        content={"error": message, "code": "invalid_data"},
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    code = {
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        405: "method_not_allowed",
        409: "conflict",
    }.get(exc.status_code, "http_error")
    headers = getattr(exc, "headers", None)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": str(exc.detail), "code": code},
        headers=headers,
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(_: Request, exc: Exception):
    logger.exception("LearningTree request failed", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": "数据库操作失败，当前修改未确认保存。请重试或查看后端日志。",
            "code": "storage_error",
        },
    )


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "storage": "postgresql", "auth": "cookie"}


@app.get("/api/workspace")
def get_workspace(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> dict:
    return read_workspace(db, user)


@app.put("/api/workspace")
def put_workspace(
    payload: WorkspaceSaveIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return save_workspace(db, user, payload.data, payload.expected_revision)


@app.post("/api/course-packages/import")
def import_course_package(
    payload: CourseImportIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return import_course(db, user, payload.package, payload.expected_revision)


@app.get("/api/course-packages/example")
def example_course(_: User = Depends(get_current_user)) -> dict:
    return get_builtin_course().package


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


@app.get("/", include_in_schema=False)
def index() -> FileResponse:
    target = settings.dist_path / "index.html"
    if not target.is_file():
        raise HTTPException(
            status_code=503,
            detail="前端尚未构建。开发时使用 npm run dev，部署时先运行 npm run build。",
        )
    return FileResponse(target)


@app.get("/{path:path}", include_in_schema=False)
def frontend(path: str) -> FileResponse:
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="接口或请求方法不存在。")
    root = settings.dist_path.resolve()
    candidate = (root / path).resolve()
    if _inside(candidate, root) and candidate.is_file():
        return FileResponse(candidate)
    fallback = root / "index.html"
    if fallback.is_file():
        return FileResponse(fallback)
    raise HTTPException(
        status_code=503,
        detail="前端尚未构建。开发时使用 npm run dev，部署时先运行 npm run build。",
    )
