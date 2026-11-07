"""Map the browser's workspace document to workspace-scoped relational rows.

The caller holds the workspace row lock and owns the transaction. Arrays retain
their order through position columns, including prerequisite lists.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone

from sqlalchemy import delete, insert, or_, select
from sqlalchemy.orm import Session

from .models import (
    KnowledgeNode,
    LearningTree,
    NodeNote,
    ReviewEvent,
    StudySession,
    TreePrerequisite,
    Workspace,
)
from .validation import validate_data

COLLECTIONS = ("trees", "nodes", "sessions", "reviews")


def _date(value: str | None) -> datetime | None:
    return datetime.fromisoformat(value.replace("Z", "+00:00")) if value else None


def _iso(value: datetime) -> str:
    # Keep sub-millisecond precision when present in an imported backup.
    precision = "microseconds" if value.microsecond % 1000 else "milliseconds"
    return value.astimezone(timezone.utc).isoformat(timespec=precision).replace("+00:00", "Z")


def _insert_rows(db: Session, model: type, rows: list[dict]) -> None:
    # Bound parameter/memory use for the 20,000-record history limit.
    for offset in range(0, len(rows), 500):
        db.execute(insert(model.__table__), rows[offset:offset + 500])


def replace_workspace_data(db: Session, workspace: Workspace, data: dict | None) -> None:
    """Replace a validated snapshot atomically; do not commit or change revision."""
    if data is not None:
        validate_data(data)

    # Cascades remove nodes, notes, histories and prerequisites. Deferred parent
    # FKs allow arbitrary input ordering and reparenting during snapshot restore.
    db.execute(delete(LearningTree.__table__).where(LearningTree.workspace_id == workspace.id))
    if data is None:
        workspace.data = None
        return

    def row(item: dict, position: int) -> dict:
        return {"workspace_id": workspace.id, "id": item["id"], "position": position}

    _insert_rows(db, LearningTree, [
        {
            **row(item, position),
            "title": item["title"],
            "description": item.get("description", ""),
            "color": item["color"],
            "parent_tree_id": item.get("parentTreeId"),
            "created_at": _date(item["createdAt"]),
        }
        for position, item in enumerate(data["trees"])
    ])
    _insert_rows(db, TreePrerequisite, [
        {
            "workspace_id": workspace.id,
            "tree_id": item["id"],
            "prerequisite_tree_id": prerequisite,
            "position": position,
        }
        for item in data["trees"]
        for position, prerequisite in enumerate(item.get("prerequisiteTreeIds", []))
    ])
    _insert_rows(db, KnowledgeNode, [
        {
            **row(item, position),
            "tree_id": item["treeId"],
            "parent_id": item.get("parentId"),
            "title": item["title"],
            "content": item.get("content", ""),
            "quiz": item.get("quiz", []),
            "question": item.get("question", ""),
            "answer": item.get("answer", ""),
            "resource": item.get("resource", ""),
            "card": item["card"],
            "learned_at": _date(item.get("learnedAt")),
            "created_at": _date(item["createdAt"]),
        }
        for position, item in enumerate(data["nodes"])
    ])
    _insert_rows(db, NodeNote, [
        {"workspace_id": workspace.id, "node_id": item["id"], "content": item.get("note", "")}
        for item in data["nodes"]
    ])
    _insert_rows(db, StudySession, [
        {
            **row(item, position),
            "node_id": item["nodeId"],
            "at": _date(item["at"]),
            "minutes": item["minutes"],
            "confidence": item["confidence"],
            "correct": item.get("correct"),
            "total": item.get("total"),
            "note": item.get("note", ""),
            "quiz_answers": item.get("quizAnswers"),
        }
        for position, item in enumerate(data["sessions"])
    ])
    _insert_rows(db, ReviewEvent, [
        {
            **row(item, position),
            "node_id": item["nodeId"],
            "at": _date(item["at"]),
            "rating": item["rating"],
            "due": _date(item["due"]),
            "response": item.get("response", ""),
        }
        for position, item in enumerate(data["reviews"])
    ])
    workspace.data = {key: deepcopy(value) for key, value in data.items() if key not in COLLECTIONS}


def load_workspace_data(db: Session, workspace: Workspace) -> dict | None:
    if workspace.data is None:
        return None

    def rows(model: type):
        table = model.__table__
        return db.execute(
            select(table).where(table.c.workspace_id == workspace.id)
            .order_by(table.c.position)
        ).mappings().all()

    prerequisites: dict[str, list[str]] = {}
    for item in rows(TreePrerequisite):
        prerequisites.setdefault(item["tree_id"], []).append(item["prerequisite_tree_id"])
    notes = dict(db.execute(
        select(NodeNote.node_id, NodeNote.content).where(NodeNote.workspace_id == workspace.id)
    ).all())

    trees = [
        {
            "id": item["id"],
            "title": item["title"],
            "description": item["description"],
            "color": item["color"],
            "parentTreeId": item["parent_tree_id"],
            "prerequisiteTreeIds": prerequisites.get(item["id"], []),
            "createdAt": _iso(item["created_at"]),
        }
        for item in rows(LearningTree)
    ]
    nodes = [
        {
            "id": item["id"],
            "treeId": item["tree_id"],
            "parentId": item["parent_id"],
            "title": item["title"],
            "content": item["content"],
            "quiz": item["quiz"],
            "question": item["question"],
            "answer": item["answer"],
            "resource": item["resource"],
            "card": item["card"],
            "note": notes.get(item["id"], ""),
            "createdAt": _iso(item["created_at"]),
            **({"learnedAt": _iso(item["learned_at"])} if item["learned_at"] is not None else {}),
        }
        for item in rows(KnowledgeNode)
    ]
    sessions = [
        {
            "id": item["id"],
            "nodeId": item["node_id"],
            "at": _iso(item["at"]),
            "minutes": item["minutes"],
            "confidence": item["confidence"],
            "correct": item["correct"],
            "total": item["total"],
            "note": item["note"],
            **({"quizAnswers": item["quiz_answers"]} if item["quiz_answers"] is not None else {}),
        }
        for item in rows(StudySession)
    ]
    reviews = [
        {
            "id": item["id"],
            "nodeId": item["node_id"],
            "at": _iso(item["at"]),
            "rating": item["rating"],
            "due": _iso(item["due"]),
            "response": item["response"],
        }
        for item in rows(ReviewEvent)
    ]
    return {**deepcopy(workspace.data), "trees": trees, "nodes": nodes, "sessions": sessions, "reviews": reviews}


def migrate_legacy_workspaces(db: Session) -> int:
    """Move old JSONB documents into tables, preserving revision and timestamps.

    Run in one transaction at startup before accepting requests. The metadata
    no longer contains collection keys after success, making reruns harmless.
    Validation or insertion errors roll back both the old document and rows.
    """
    legacy_ids = db.scalars(select(Workspace.id).where(
        or_(*(Workspace.data.has_key(key) for key in COLLECTIONS))
    )).all()
    migrated = 0
    for workspace_id in legacy_ids:
        workspace = db.scalar(select(Workspace).where(
            Workspace.id == workspace_id
        ).with_for_update().execution_options(populate_existing=True))
        if workspace is not None and workspace.data and any(key in workspace.data for key in COLLECTIONS):
            replace_workspace_data(db, workspace, workspace.data)
            migrated += 1
    db.flush()
    return migrated
