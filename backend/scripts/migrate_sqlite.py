"""Import the legacy single-user SQLite workspace into PostgreSQL.

The browser-facing data contract is unchanged, so the SQLite tables are
reconstructed into one JSONB workspace owned by a local account.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from backend.app.config import ROOT
from backend.app.db import SessionLocal, init_db
from backend.app.models import (
    CourseImport,
    InstalledBuiltin,
    User,
    Workspace,
)
from backend.app.security import hash_password, normalize_username
from backend.app.validation import validate_data


def _timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def read_sqlite(path: Path) -> tuple[dict | None, int, datetime | None, list[dict], list[dict]]:
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        meta = connection.execute(
            "SELECT revision, initialized, demo, settings_json, updated_at "
            "FROM workspace_meta WHERE id = 1"
        ).fetchone()
        if meta is None:
            raise SystemExit("SQLite 中没有 workspace_meta，无法迁移。")
        revision = int(meta["revision"])
        updated_at = _timestamp(meta["updated_at"])
        data = None
        if meta["initialized"]:
            trees = [
                json.loads(row["payload_json"])
                for row in connection.execute(
                    "SELECT payload_json FROM courses ORDER BY position"
                )
            ]
            topics = []
            for row in connection.execute(
                "SELECT t.payload_json, p.note, p.card_json, p.learned_at "
                "FROM topics t LEFT JOIN topic_progress p ON p.node_id = t.id "
                "ORDER BY t.position"
            ):
                payload = json.loads(row["payload_json"])
                if row["card_json"] is not None:
                    payload["card"] = json.loads(row["card_json"])
                if row["note"] is not None:
                    payload["note"] = row["note"]
                if row["learned_at"]:
                    payload["learnedAt"] = row["learned_at"]
                topics.append(payload)
            sessions = [
                json.loads(row["payload_json"])
                for row in connection.execute(
                    "SELECT payload_json FROM study_sessions ORDER BY position"
                )
            ]
            reviews = [
                json.loads(row["payload_json"])
                for row in connection.execute(
                    "SELECT payload_json FROM review_events ORDER BY position"
                )
            ]
            data = validate_data(
                {
                    "version": 1,
                    "demo": bool(meta["demo"]),
                    "settings": json.loads(meta["settings_json"]),
                    "trees": trees,
                    "nodes": topics,
                    "sessions": sessions,
                    "reviews": reviews,
                }
            )

        builtins = []
        try:
            builtins = [
                dict(row)
                for row in connection.execute(
                    "SELECT package_id, release, installed_at FROM installed_builtins"
                )
            ]
        except sqlite3.OperationalError:
            pass
        imports = []
        try:
            imports = [
                dict(row)
                for row in connection.execute(
                    "SELECT name, imported_at, revision, tree_count, topic_count "
                    "FROM course_imports ORDER BY id"
                )
            ]
        except sqlite3.OperationalError:
            pass
        return data, revision, updated_at, builtins, imports
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="把旧 SQLite 工作区迁移到 PostgreSQL")
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=ROOT / "data/learningtree.sqlite",
        help="旧 SQLite 文件路径",
    )
    parser.add_argument("--username", required=True, help="接收数据的本地账号")
    parser.add_argument("--password", help="账号不存在时用于创建账号")
    parser.add_argument("--display-name", help="账号显示名称")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="覆盖该账号已有的 PostgreSQL 工作区",
    )
    args = parser.parse_args()

    if not args.sqlite.is_file():
        raise SystemExit(f"SQLite 文件不存在：{args.sqlite}")
    data, revision, updated_at, builtins, imports = read_sqlite(args.sqlite)

    init_db()
    with SessionLocal() as db:
        username = args.username.strip()
        user = db.scalar(
            select(User).where(User.username_key == normalize_username(username))
        )
        if user is None:
            if not args.password or len(args.password) < 8:
                raise SystemExit(
                    "账号不存在；请用 --password 提供一个至少 8 位的密码来创建账号。"
                )
            user = User(
                username=username,
                username_key=normalize_username(username),
                display_name=args.display_name or username,
                password_hash=hash_password(args.password),
            )
            db.add(user)
            db.flush()
            db.add(Workspace(user_id=user.id, data=None, revision=0))
            db.flush()

        workspace = db.scalar(select(Workspace).where(Workspace.user_id == user.id))
        if workspace is None:
            workspace = Workspace(user_id=user.id, data=None, revision=0)
            db.add(workspace)
            db.flush()
        if workspace.data is not None and not args.replace:
            raise SystemExit("目标账号已有学习数据；如需覆盖请加 --replace。")

        workspace.data = data
        workspace.revision = revision
        workspace.updated_at = updated_at or datetime.now(timezone.utc)

        for item in builtins:
            exists = db.get(
                InstalledBuiltin, (workspace.id, item["package_id"])
            )
            if exists is None:
                db.add(
                    InstalledBuiltin(
                        workspace_id=workspace.id,
                        package_id=item["package_id"],
                        release=item["release"],
                        installed_at=_timestamp(item["installed_at"])
                        or datetime.now(timezone.utc),
                    )
                )
        for item in imports:
            db.add(
                CourseImport(
                    workspace_id=workspace.id,
                    name=item["name"],
                    imported_at=_timestamp(item["imported_at"])
                    or datetime.now(timezone.utc),
                    revision=int(item["revision"]),
                    tree_count=int(item["tree_count"]),
                    topic_count=int(item["topic_count"]),
                )
            )
        db.commit()
    print(
        f"已迁移到账号 {username}：{len(data['trees']) if data else 0} 棵树、"
        f"{len(data['nodes']) if data else 0} 个知识点，revision {revision}。"
    )


if __name__ == "__main__":
    main()
