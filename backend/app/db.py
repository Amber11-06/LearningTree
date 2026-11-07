from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Importing the models registers them on Base.metadata.
    from . import models  # noqa: F401
    from .relational import migrate_legacy_workspaces

    with engine.begin() as connection:
        # Serialize schema creation/migration across API workers and CLI tools.
        connection.execute(text("SELECT pg_advisory_xact_lock(7421936801)"))
        Base.metadata.create_all(bind=connection)
        with Session(bind=connection) as db:
            migrate_legacy_workspaces(db)
            db.commit()
