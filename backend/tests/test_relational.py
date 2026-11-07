from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import json
import sqlite3
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError, OperationalError

from backend.app import relational, workspace as workspace_service
from backend.app.db import SessionLocal, init_db
from backend.app.models import (
    CourseImport, InstalledBuiltin, KnowledgeNode, LearningTree, NodeNote,
    ReviewEvent, StudySession, TreePrerequisite, User, Workspace,
)
from backend.app.relational import load_workspace_data, migrate_legacy_workspaces, replace_workspace_data
from backend.app.validation import DataValidationError, empty_card
from backend.scripts import migrate_sqlite
from backend.tests.test_api import data, register

STAMP = "2026-01-01T00:00:00.123456Z"


def rich_data() -> dict:
    result = data()
    result["trees"] = [
        {
            "id": tree_id, "title": tree_id, "description": "课程说明", "color": "blue",
            "createdAt": STAMP, "parentTreeId": parent, "prerequisiteTreeIds": prerequisites,
        }
        for tree_id, parent, prerequisites in [
            ("child", "root", ["prior-b", "prior-a"]),
            ("root", None, []), ("prior-a", None, []), ("prior-b", None, []),
        ]
    ]
    result["nodes"] = [
        {
            "id": node_id, "treeId": "child", "parentId": parent, "title": node_id,
            "note": f"{node_id} 的个人笔记", "content": "# 讲义\n示例",
            "quiz": [{"id": "q", "type": "single", "prompt": "答案？", "options": ["A", "B"],
                      "correctIndex": 0, "explanation": "解析"}],
            "question": "回忆题", "answer": "参考答案", "resource": "https://example.com",
            "card": {**empty_card(datetime(2026, 1, 1, tzinfo=timezone.utc)), "last_review": STAMP},
            "createdAt": STAMP, "learnedAt": STAMP,
        }
        for node_id, parent in [("leaf", "parent"), ("parent", None)]
    ]
    result["sessions"] = [
        {
            "id": "study-b", "nodeId": "leaf", "at": STAMP, "minutes": 25, "confidence": 4,
            "correct": 1, "total": 1, "note": "学习心得",
            "quizAnswers": [{"question": "答案？", "selected": "A", "correct": "A",
                             "explanation": "解析", "isCorrect": True}],
        },
        {"id": "study-a", "nodeId": "parent", "at": STAMP, "minutes": 10, "confidence": 2,
         "correct": None, "total": None, "note": "无测验"},
    ]
    result["reviews"] = [
        {"id": "review", "nodeId": "leaf", "at": STAMP, "rating": 3,
         "due": "2026-01-03T00:00:00.000Z", "response": "回忆内容"},
    ]
    return result


def workspace_for(db, username: str) -> Workspace:
    return db.scalar(select(Workspace).join(User).where(User.username == username))


def save(client, value, revision=0):
    response = client.put("/api/workspace", json={"data": value, "expectedRevision": revision})
    assert response.status_code == 200, response.text
    return response.json()


def count(db, model, workspace_id) -> int:
    return db.scalar(select(func.count()).select_from(model).where(model.workspace_id == workspace_id))


def test_api_round_trip_uses_relational_rows(client):
    username = register(client, "rows")
    original = rich_data()
    saved = save(client, original)
    assert client.get("/api/workspace").json() == saved
    assert saved["data"]["nodes"][:2] == original["nodes"]
    assert saved["data"]["trees"][-4:] == original["trees"]
    assert saved["data"]["sessions"] == original["sessions"]
    assert saved["data"]["reviews"] == original["reviews"]
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        assert workspace.data == {key: original[key] for key in ("version", "demo", "settings")}
        assert count(db, LearningTree, workspace.id) == len(saved["data"]["trees"])
        assert count(db, KnowledgeNode, workspace.id) == len(saved["data"]["nodes"])
        assert count(db, NodeNote, workspace.id) == len(saved["data"]["nodes"])
        assert count(db, StudySession, workspace.id) == 2
        assert count(db, ReviewEvent, workspace.id) == 1
        note = db.get(NodeNote, (workspace.id, "leaf"))
        note.content = "直接从笔记表读取"
        db.commit()
    assert client.get("/api/workspace").json()["data"]["nodes"][0]["note"] == "直接从笔记表读取"


def test_repeated_ids_are_isolated_and_deletions_cascade(client):
    first = register(client, "first")
    save(client, rich_data())
    with TestClient(client.app) as other:
        second = register(other, "second")
        second_saved = save(other, rich_data())
        with SessionLocal() as db:
            workspace = workspace_for(db, first)
            db.execute(delete(KnowledgeNode).where(
                KnowledgeNode.workspace_id == workspace.id, KnowledgeNode.id == "leaf"
            ))
            db.commit()
            assert db.get(NodeNote, (workspace.id, "leaf")) is None
            assert count(db, StudySession, workspace.id) == 1
            assert count(db, ReviewEvent, workspace.id) == 0
            # Whole-workspace deletion removes all its dependent rows.
            db.execute(delete(Workspace).where(Workspace.id == workspace.id))
            db.commit()
            for model in (LearningTree, KnowledgeNode, NodeNote, TreePrerequisite, StudySession, ReviewEvent):
                assert count(db, model, workspace.id) == 0
            assert workspace_for(db, second) is not None
        assert other.get("/api/workspace").json() == second_saved


def test_save_replaces_removed_records_and_retains_array_order(client):
    username = register(client, "replace")
    saved = save(client, rich_data())
    changed = deepcopy(saved["data"])
    changed["nodes"] = [node for node in changed["nodes"] if node["id"] != "leaf"][::-1]
    changed["sessions"] = [session for session in changed["sessions"] if session["nodeId"] != "leaf"]
    changed["reviews"] = []
    changed["trees"].reverse()
    changed["nodes"][-1]["note"] = "更新笔记"
    changed["nodes"][-1].pop("learnedAt")
    changed["nodes"][-1]["card"].pop("last_review")
    updated = save(client, changed, saved["revision"])
    assert updated["data"] == changed
    assert client.get("/api/workspace").json() == updated
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        assert db.get(NodeNote, (workspace.id, "leaf")) is None
        assert count(db, StudySession, workspace.id) == 1
        assert count(db, ReviewEvent, workspace.id) == 0
    empty = save(client, data(), updated["revision"])
    assert empty["data"] == data()  # Builtin installation is not repeated.


def test_course_update_preserves_personal_rows(client):
    register(client, "update")
    saved = save(client, rich_data())
    package = {
        "format": "learning-tree-course", "version": 1, "name": "更新",
        "trees": [{"id": "child", "title": "新标题", "color": "blue"}],
        "nodes": [{"id": "leaf", "treeId": "child", "parentId": "parent", "title": "新讲义",
                   "question": "回忆题", "answer": "参考答案", "content": "更新后的内容"}],
    }
    response = client.post("/api/course-packages/import", json={
        "package": package, "expectedRevision": saved["revision"],
    })
    assert response.status_code == 200, response.text
    updated = response.json()["data"]
    old_node, new_node = saved["data"]["nodes"][0], updated["nodes"][0]
    assert new_node["content"] == "更新后的内容"
    for key in ("note", "card", "learnedAt", "createdAt"):
        assert new_node[key] == old_node[key]
    for key in ("sessions", "reviews"):
        assert updated[key] == saved["data"][key]


def test_failed_write_and_stale_revision_preserve_entire_snapshot(client, monkeypatch):
    username = register(client, "atomic")
    saved = save(client, rich_data())
    changed = deepcopy(saved["data"])
    changed["nodes"][0]["note"] = "不应保存"
    original_insert = relational._insert_rows

    def fail_late(db, model, rows):
        if model is StudySession:
            raise RuntimeError("simulated storage failure after writing trees, nodes and notes")
        return original_insert(db, model, rows)

    with monkeypatch.context() as patch:
        patch.setattr(relational, "_insert_rows", fail_late)
        with pytest.raises(RuntimeError, match="simulated storage failure"):
            save(client, changed, saved["revision"])
    assert client.get("/api/workspace").json() == saved
    assert client.put("/api/workspace", json={"data": changed, "expectedRevision": 0}).status_code == 409
    invalid = deepcopy(changed)
    invalid["sessions"][0]["nodeId"] = "missing"
    assert client.put("/api/workspace", json={
        "data": invalid, "expectedRevision": saved["revision"],
    }).status_code == 422
    assert client.get("/api/workspace").json() == saved
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        assert count(db, CourseImport, workspace.id) == 1
        assert count(db, InstalledBuiltin, workspace.id) == 1


def test_database_rejects_cross_workspace_and_cross_tree_references(client):
    first = register(client, "fkfirst")
    save(client, rich_data())
    second = register(client, "fksecond")
    with SessionLocal() as db:
        first_id = workspace_for(db, first).id
        second_id = workspace_for(db, second).id
        db.add(NodeNote(workspace_id=second_id, node_id="leaf", content="跨账号引用"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        node = db.get(KnowledgeNode, (first_id, "leaf"))
        node.tree_id = "prior-a"  # Its parent belongs to "child".
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


@pytest.mark.parametrize("initialized", [True, False])
def test_startup_migrates_legacy_json_once(client, initialized):
    username = register(client, "legacy")
    original = rich_data() if initialized else data()
    timestamp = datetime(2026, 1, 1, tzinfo=timezone.utc)
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        workspace.data = original
        workspace.revision = 7
        workspace.updated_at = timestamp
        workspace_id = workspace.id
        db.add(InstalledBuiltin(workspace_id=workspace.id, package_id="legacy", release="v1"))
        db.add(CourseImport(workspace_id=workspace.id, name="legacy", revision=7, tree_count=4, topic_count=2))
        db.commit()
    init_db()
    init_db()
    migrated = client.get("/api/workspace").json()
    assert migrated == {"data": original, "revision": 7, "updatedAt": "2026-01-01T00:00:00.000Z"}
    with SessionLocal() as db:
        workspace = db.get(Workspace, workspace_id)
        assert not any(key in workspace.data for key in relational.COLLECTIONS)
        assert count(db, KnowledgeNode, workspace.id) == len(original["nodes"])
        assert count(db, InstalledBuiltin, workspace.id) == 1
        assert count(db, CourseImport, workspace.id) == 1
        assert migrate_legacy_workspaces(db) == 0


def test_invalid_legacy_data_is_not_destroyed(client):
    username = register(client, "badlegacy")
    invalid = rich_data()
    invalid["nodes"][0]["treeId"] = "missing"
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        workspace.data = invalid
        db.commit()
        with pytest.raises(DataValidationError):
            migrate_legacy_workspaces(db)
        db.rollback()
        db.refresh(workspace)
        assert workspace.data == invalid
        assert count(db, KnowledgeNode, workspace.id) == 0
        # Remove the invalid fixture so later API startups can migrate normally.
        db.delete(workspace)
        db.commit()


def test_migration_failure_rolls_back_legacy_and_partial_rows(client, monkeypatch):
    username = register(client, "migrationfail")
    original = rich_data()
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        workspace.data = original
        db.commit()
    original_insert = relational._insert_rows

    def fail_late(db, model, rows):
        if model is ReviewEvent:
            raise RuntimeError("migration interrupted")
        return original_insert(db, model, rows)

    with monkeypatch.context() as patch:
        patch.setattr(relational, "_insert_rows", fail_late)
        with pytest.raises(RuntimeError, match="migration interrupted"):
            init_db()
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        assert workspace.data == original
        for model in (LearningTree, KnowledgeNode, NodeNote, StudySession, ReviewEvent):
            assert count(db, model, workspace.id) == 0
    init_db()
    assert client.get("/api/workspace").json()["data"] == original


def test_nullable_workspace_and_offset_timestamps(client):
    username = register(client, "null")
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        assert load_workspace_data(db, workspace) is None
        original = rich_data()
        original["reviews"][0]["at"] = "2026-01-01T08:00:00.123456+08:00"
        replace_workspace_data(db, workspace, original)
        db.commit()
        assert load_workspace_data(db, workspace)["reviews"][0]["at"] == STAMP
        replace_workspace_data(db, workspace, None)
        db.commit()
        assert load_workspace_data(db, workspace) is None
        assert count(db, LearningTree, workspace.id) == 0


def test_read_holds_shared_lock_until_snapshot_is_assembled(client, monkeypatch):
    username = register(client, "readlock")
    saved = save(client, rich_data())
    original_load = workspace_service.load_workspace_data

    def check_lock(db, workspace):
        with SessionLocal() as writer:
            with pytest.raises(OperationalError) as caught:
                writer.scalar(select(Workspace).where(
                    Workspace.id == workspace.id
                ).with_for_update(nowait=True))
            assert caught.value.orig.sqlstate == "55P03"  # lock_not_available
        return original_load(db, workspace)

    monkeypatch.setattr(workspace_service, "load_workspace_data", check_lock)
    assert client.get("/api/workspace").json() == saved
    with SessionLocal() as writer:
        workspace = workspace_for(writer, username)
        assert writer.scalar(select(Workspace).where(
            Workspace.id == workspace.id
        ).with_for_update(nowait=True)) is not None


def test_sqlite_cli_import_writes_relational_tables(client, tmp_path, monkeypatch):
    username = register(client, "sqlite")
    original = rich_data()
    source = tmp_path / "legacy.sqlite"
    with sqlite3.connect(source) as connection:
        connection.executescript("""
            CREATE TABLE workspace_meta (
                id INTEGER, revision INTEGER, initialized INTEGER,
                demo INTEGER, settings_json TEXT, updated_at TEXT
            );
            CREATE TABLE courses (position INTEGER, payload_json TEXT);
            CREATE TABLE topics (id TEXT, position INTEGER, payload_json TEXT);
            CREATE TABLE topic_progress (node_id TEXT, note TEXT, card_json TEXT, learned_at TEXT);
            CREATE TABLE study_sessions (position INTEGER, payload_json TEXT);
            CREATE TABLE review_events (position INTEGER, payload_json TEXT);
        """)
        connection.execute("INSERT INTO workspace_meta VALUES (1, 9, 1, 0, ?, ?)",
                           (json.dumps(original["settings"]), STAMP))
        for table, key in [("courses", "trees"), ("study_sessions", "sessions"), ("review_events", "reviews")]:
            connection.executemany(f"INSERT INTO {table} VALUES (?, ?)",
                                   [(i, json.dumps(item)) for i, item in enumerate(original[key])])
        for position, node in enumerate(original["nodes"]):
            content = {key: value for key, value in node.items() if key not in ("note", "card", "learnedAt")}
            connection.execute("INSERT INTO topics VALUES (?, ?, ?)",
                               (node["id"], position, json.dumps(content)))
            connection.execute("INSERT INTO topic_progress VALUES (?, ?, ?, ?)",
                               (node["id"], node["note"], json.dumps(node["card"]), node["learnedAt"]))
    original_bytes = source.read_bytes()
    arguments = ["migrate_sqlite", "--sqlite", str(source), "--username", username]
    monkeypatch.setattr(sys, "argv", arguments)
    migrate_sqlite.main()
    response = client.get("/api/workspace").json()
    assert response["data"] == original
    assert response["revision"] == 9
    with SessionLocal() as db:
        workspace = workspace_for(db, username)
        assert "nodes" not in workspace.data
        assert count(db, NodeNote, workspace.id) == 2
    with pytest.raises(SystemExit, match="--replace"):
        migrate_sqlite.main()
    monkeypatch.setattr(sys, "argv", arguments + ["--replace"])
    migrate_sqlite.main()
    assert client.get("/api/workspace").json() == response
    assert source.read_bytes() == original_bytes
