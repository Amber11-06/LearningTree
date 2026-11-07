import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    username: Mapped[str] = mapped_column(String(32), nullable=False)
    # Case-folded lookup key; unique so "Amber" and "amber" are one account.
    username_key: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(60), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )

    workspace: Mapped["Workspace"] = relationship(
        back_populates="user", cascade="all, delete-orphan", uselist=False
    )


class LoginSession(Base):
    __tablename__ = "login_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )

    user: Mapped[User] = relationship()


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    # Only version/demo/settings after migration; NULL means uninitialized.
    data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    user: Mapped[User] = relationship(back_populates="workspace")


class InstalledBuiltin(Base):
    __tablename__ = "installed_builtins"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    package_id: Mapped[str] = mapped_column(String(120), primary_key=True)
    release: Mapped[str] = mapped_column(String(60), nullable=False)
    installed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )


class CourseImport(Base):
    __tablename__ = "course_imports"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    tree_count: Mapped[int] = mapped_column(Integer, nullable=False)
    topic_count: Mapped[int] = mapped_column(Integer, nullable=False)


class WorkspaceRecord:
    """Client IDs are unique within a workspace, never across users."""

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id", ondelete="CASCADE"),
        primary_key=True,
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class LearningTree(WorkspaceRecord, Base):
    __tablename__ = "learning_trees"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "parent_tree_id"],
            ["learning_trees.workspace_id", "learning_trees.id"],
            name="fk_tree_parent", deferrable=True, initially="DEFERRED",
        ),
        CheckConstraint("color IN ('green', 'blue', 'amber')", name="ck_tree_color"),
        Index("ix_tree_parent", "workspace_id", "parent_tree_id"),
    )

    title: Mapped[str] = mapped_column(String(60), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str] = mapped_column(String(10), nullable=False)
    parent_tree_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class TreePrerequisite(Base):
    __tablename__ = "tree_prerequisites"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "tree_id"],
            ["learning_trees.workspace_id", "learning_trees.id"],
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["workspace_id", "prerequisite_tree_id"],
            ["learning_trees.workspace_id", "learning_trees.id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("tree_id <> prerequisite_tree_id", name="ck_tree_prerequisite_self"),
        Index("ix_tree_prerequisite_target", "workspace_id", "prerequisite_tree_id"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    tree_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    prerequisite_tree_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class KnowledgeNode(WorkspaceRecord, Base):
    __tablename__ = "knowledge_nodes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "tree_id"],
            ["learning_trees.workspace_id", "learning_trees.id"],
            ondelete="CASCADE",
        ),
        UniqueConstraint("workspace_id", "tree_id", "id", name="uq_node_tree_id"),
        ForeignKeyConstraint(
            ["workspace_id", "tree_id", "parent_id"],
            ["knowledge_nodes.workspace_id", "knowledge_nodes.tree_id", "knowledge_nodes.id"],
            name="fk_node_parent", deferrable=True, initially="DEFERRED",
        ),
        Index("ix_node_parent", "workspace_id", "tree_id", "parent_id"),
    )

    tree_id: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    title: Mapped[str] = mapped_column(String(80), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    quiz: Mapped[list] = mapped_column(JSONB, nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    resource: Mapped[str] = mapped_column(String(1000), nullable=False)
    card: Mapped[dict] = mapped_column(JSONB, nullable=False)
    learned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class NodeNote(Base):
    __tablename__ = "node_notes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "node_id"],
            ["knowledge_nodes.workspace_id", "knowledge_nodes.id"],
            ondelete="CASCADE",
        ),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)


class StudySession(WorkspaceRecord, Base):
    __tablename__ = "study_sessions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "node_id"],
            ["knowledge_nodes.workspace_id", "knowledge_nodes.id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("minutes BETWEEN 1 AND 720", name="ck_session_minutes"),
        CheckConstraint("confidence BETWEEN 1 AND 5", name="ck_session_confidence"),
        CheckConstraint(
            "(correct IS NULL AND total IS NULL) OR "
            "(correct IS NOT NULL AND total IS NOT NULL AND "
            "total BETWEEN 1 AND 1000 AND correct BETWEEN 0 AND total)",
            name="ck_session_score",
        ),
        Index("ix_session_node_at", "workspace_id", "node_id", "at"),
    )

    node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    correct: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    quiz_answers: Mapped[list | None] = mapped_column(JSONB(none_as_null=True), nullable=True)


class ReviewEvent(WorkspaceRecord, Base):
    __tablename__ = "review_events"
    __table_args__ = (
        ForeignKeyConstraint(
            ["workspace_id", "node_id"],
            ["knowledge_nodes.workspace_id", "knowledge_nodes.id"],
            ondelete="CASCADE",
        ),
        CheckConstraint("rating BETWEEN 1 AND 4", name="ck_review_rating"),
        Index("ix_review_node_at", "workspace_id", "node_id", "at"),
    )

    node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    due: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    response: Mapped[str] = mapped_column(Text, nullable=False)
