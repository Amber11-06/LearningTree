from __future__ import annotations

import argparse
import json
from pathlib import Path

from sqlalchemy import select

from backend.app.db import SessionLocal, init_db
from backend.app.models import User
from backend.app.validation import validate_course_package
from backend.app.workspace import import_course, read_workspace


def main() -> None:
    parser = argparse.ArgumentParser(description="导入 LearningTree 课程包")
    parser.add_argument("file", type=Path, help="课程包 JSON 路径")
    parser.add_argument("--username", help="目标本地账号；仅有一个账号时可省略")
    args = parser.parse_args()

    if not args.file.is_file():
        raise SystemExit(f"文件不存在：{args.file}")
    if args.file.stat().st_size > 32 * 1024 * 1024:
        raise SystemExit("课程包不能超过 32 MB。")
    package = validate_course_package(json.loads(args.file.read_text(encoding="utf-8")))

    init_db()
    with SessionLocal() as db:
        if args.username:
            user = db.scalar(
                select(User).where(User.username_key == args.username.strip().casefold())
            )
        else:
            users = db.scalars(select(User)).all()
            user = users[0] if len(users) == 1 else None
        if user is None:
            raise SystemExit("找不到目标账号；请用 --username 指定（或先注册一个账号）。")
        current = read_workspace(db, user)
        result = import_course(
            db, user, package, current["revision"]
        )
    print(
        f"已导入「{package['name']}」：{len(package['trees'])} 棵学习树、"
        f"{len(package['nodes'])} 个知识点，数据库版本 {result['revision']}。"
    )


if __name__ == "__main__":
    main()
