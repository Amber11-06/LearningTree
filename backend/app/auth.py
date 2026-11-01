from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import LoginSession, User, Workspace
from .schemas import LoginIn, RegisterIn
from .security import (
    hash_password,
    hash_token,
    new_session_token,
    normalize_username,
    session_expiry,
    verify_password,
)
from .workspace import iso_z

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()


def user_payload(user: User) -> dict:
    return {
        "id": str(user.id),
        "username": user.username,
        "displayName": user.display_name,
        "createdAt": iso_z(user.created_at),
    }


def _set_session_cookie(response: Response, raw_token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=raw_token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        samesite="lax",
        secure=settings.cookie_secure,
    )


def _create_session(db: Session, user: User) -> str:
    raw_token, token_hash = new_session_token()
    db.add(
        LoginSession(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=session_expiry(settings.session_ttl_days),
        )
    )
    return raw_token


def get_current_user(
    request: Request, db: Session = Depends(get_db)
) -> User:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if not raw_token:
        raise HTTPException(status_code=401, detail="请先登录")
    login = db.scalar(
        select(LoginSession).where(LoginSession.token_hash == hash_token(raw_token))
    )
    if login is None:
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    expires_at = login.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        db.delete(login)
        db.commit()
        raise HTTPException(status_code=401, detail="登录已过期，请重新登录")
    user = db.get(User, login.user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="账号不存在，请重新登录")
    return user


@router.post("/register", status_code=201)
def register(
    payload: RegisterIn, response: Response, db: Session = Depends(get_db)
) -> dict:
    username = payload.username.strip()
    username_key = normalize_username(username)
    if db.scalar(select(User).where(User.username_key == username_key)) is not None:
        raise HTTPException(status_code=409, detail="用户名已被使用")

    user = User(
        username=username,
        username_key=username_key,
        display_name=payload.display_name or username,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        db.flush()
        db.add(Workspace(user_id=user.id, data=None, revision=0))
        raw_token = _create_session(db, user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名已被使用")
    _set_session_cookie(response, raw_token)
    return {"user": user_payload(user)}


@router.post("/login")
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)) -> dict:
    username_key = normalize_username(payload.username)
    user = db.scalar(select(User).where(User.username_key == username_key))
    if user is None or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="用户名或密码不正确")

    now = datetime.now(timezone.utc)
    db.execute(delete(LoginSession).where(LoginSession.expires_at <= now))
    raw_token = _create_session(db, user)
    db.commit()
    _set_session_cookie(response, raw_token)
    return {"user": user_payload(user)}


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> dict:
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token:
        db.execute(
            delete(LoginSession).where(
                LoginSession.token_hash == hash_token(raw_token)
            )
        )
        db.commit()
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(get_current_user)) -> dict:
    return {"user": user_payload(user)}
