import json
from dataclasses import dataclass
from functools import lru_cache

from .config import get_settings
from .validation import validate_course_package


@dataclass(frozen=True)
class BuiltinCourse:
    id: str
    name: str
    release: str
    package: dict


@lru_cache
def get_builtin_course() -> BuiltinCourse:
    settings = get_settings()
    raw = json.loads(settings.builtin_course_path.read_text(encoding="utf-8"))
    package = validate_course_package(raw)
    return BuiltinCourse(
        id="builtin-frontend-tech-tree",
        name=package["name"],
        release=package.get("release") or "1",
        package=package,
    )
