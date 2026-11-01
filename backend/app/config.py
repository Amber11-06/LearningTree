from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    """Runtime configuration, loaded from LEARNINGTREE_* environment variables."""

    database_url: str = (
        "postgresql+psycopg://learningtree:learningtree@127.0.0.1:5432/learningtree"
    )
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    session_cookie_name: str = "learningtree_session"
    session_ttl_days: int = 7
    cookie_secure: bool = False
    allowed_origins: str = (
        "http://127.0.0.1:5173,http://localhost:5173,"
        "http://127.0.0.1:8000,http://localhost:8000"
    )
    workspace_max_bytes: int = 33 * 1024 * 1024
    builtin_course_path: Path = ROOT / "courses/builtin/frontend-tech-tree.json"
    dist_path: Path = ROOT / "dist"

    model_config = SettingsConfigDict(
        env_prefix="LEARNINGTREE_",
        env_file=ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def origin_list(self) -> list[str]:
        return [item.strip() for item in self.allowed_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
