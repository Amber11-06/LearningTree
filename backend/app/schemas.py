from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .security import valid_username


class RegisterIn(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=8, max_length=128)
    display_name: str | None = Field(default=None, max_length=60)

    @field_validator("username")
    @classmethod
    def username_is_valid(cls, value: str) -> str:
        value = value.strip()
        if not valid_username(value):
            raise ValueError("用户名需为 3–32 个字符，只能包含字母、数字、汉字、点、下划线和短横线")
        return value

    @field_validator("display_name")
    @classmethod
    def display_name_is_clean(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        return value


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=32)
    password: str = Field(min_length=1, max_length=128)


class WorkspaceSaveIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    expected_revision: int = Field(alias="expectedRevision", ge=0)
    data: dict[str, Any]


class CourseImportIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    expected_revision: int = Field(alias="expectedRevision", ge=0)
    package: dict[str, Any]
