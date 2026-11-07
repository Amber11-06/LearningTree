from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .courses import get_builtin_course
from .models import CourseImport, InstalledBuiltin, User, Workspace, utcnow
from .relational import load_workspace_data, replace_workspace_data
from .validation import (
    blank_data,
    merge_course_package,
    validate_course_package,
    validate_data,
)


class RevisionConflict(Exception):
    def __init__(self) -> None:
        super().__init__("数据库中有更新，当前修改未保存。请载入最新数据后重试。")


def iso_z(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace(
        "+00:00", "Z"
    )


def serialize_workspace(db: Session, workspace: Workspace) -> dict[str, Any]:
    return {
        "data": load_workspace_data(db, workspace),
        "revision": workspace.revision,
        "updatedAt": iso_z(workspace.updated_at),
    }


def get_or_create_workspace(db: Session, user: User) -> Workspace:
    workspace = db.scalar(select(Workspace).where(Workspace.user_id == user.id))
    if workspace is not None:
        return workspace
    workspace = Workspace(user_id=user.id, data=None, revision=0)
    db.add(workspace)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        workspace = db.scalar(select(Workspace).where(Workspace.user_id == user.id))
        if workspace is None:
            raise
        return workspace
    db.refresh(workspace)
    return workspace


def read_workspace(db: Session, user: User) -> dict[str, Any]:
    # Hold a shared lock across the table reads to return one consistent revision.
    result = serialize_workspace(db, _lock_workspace(db, user, read=True))
    db.commit()
    return result


def _lock_workspace(db: Session, user: User, read: bool = False) -> Workspace:
    workspace = db.scalar(
        select(Workspace).where(Workspace.user_id == user.id)
        .with_for_update(read=read).execution_options(populate_existing=True)
    )
    if workspace is None:
        workspace = get_or_create_workspace(db, user)
        workspace = db.scalar(
            select(Workspace).where(Workspace.id == workspace.id)
            .with_for_update(read=read).execution_options(populate_existing=True)
        )
    if workspace is None:  # pragma: no cover - defensive
        raise RuntimeError("无法创建工作区")
    return workspace


def _builtin_installed(db: Session, workspace: Workspace) -> bool:
    builtin = get_builtin_course()
    return (
        db.get(InstalledBuiltin, (workspace.id, builtin.id)) is not None
    )


def _install_builtin(db: Session, workspace: Workspace, data: dict) -> tuple[dict, bool]:
    builtin = get_builtin_course()
    if _builtin_installed(db, workspace):
        return data, False
    now = utcnow()
    merged = merge_course_package(data, builtin.package, now)
    builtin_ids = {tree["id"] for tree in builtin.package["trees"]}
    merged["trees"] = [
        tree for tree in merged["trees"] if tree["id"] in builtin_ids
    ] + [tree for tree in merged["trees"] if tree["id"] not in builtin_ids]
    db.add(
        InstalledBuiltin(
            workspace_id=workspace.id,
            package_id=builtin.id,
            release=builtin.release,
            installed_at=now,
        )
    )
    return merged, True


def _persist(
    db: Session,
    workspace: Workspace,
    data: dict,
    expected_revision: int,
    imported: dict | None = None,
) -> dict[str, Any]:
    if workspace.revision != expected_revision:
        raise RevisionConflict()
    now = utcnow()
    data = validate_data(data)
    data, installed = _install_builtin(db, workspace, data)
    replace_workspace_data(db, workspace, data)
    workspace.revision += 1
    workspace.updated_at = now
    revision = workspace.revision
    if imported is not None:
        db.add(
            CourseImport(
                workspace_id=workspace.id,
                name=imported["name"],
                imported_at=now,
                revision=revision,
                tree_count=len(imported["trees"]),
                topic_count=len(imported["nodes"]),
            )
        )
    if installed:
        builtin = get_builtin_course()
        db.add(
            CourseImport(
                workspace_id=workspace.id,
                name=builtin.name,
                imported_at=now,
                revision=revision,
                tree_count=len(builtin.package["trees"]),
                topic_count=len(builtin.package["nodes"]),
            )
        )
    try:
        # Assemble the response while the write lock still protects this revision.
        result = serialize_workspace(db, workspace)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise
    return result


def save_workspace(
    db: Session, user: User, data: Any, expected_revision: int
) -> dict[str, Any]:
    workspace = _lock_workspace(db, user)
    return _persist(db, workspace, data, expected_revision)


def import_course(
    db: Session, user: User, package: Any, expected_revision: int
) -> dict[str, Any]:
    workspace = _lock_workspace(db, user)
    if workspace.revision != expected_revision:
        raise RevisionConflict()
    valid_package = validate_course_package(package)
    now = utcnow()
    current = load_workspace_data(db, workspace)
    if current is None:
        current = blank_data()
    merged = merge_course_package(current, valid_package, now)
    return _persist(db, workspace, merged, expected_revision, imported=valid_package)
