from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def data(name: str = "学习者") -> dict:
    return {
        "version": 1,
        "demo": False,
        "settings": {"name": name, "dailyMinutes": 30},
        "trees": [],
        "nodes": [],
        "sessions": [],
        "reviews": [],
    }


def register(client: TestClient, prefix: str = "user") -> str:
    username = f"{prefix}_{uuid.uuid4().hex[:8]}"
    response = client.post(
        "/api/auth/register",
        json={
            "username": username,
            "password": "correct-horse-42",
            "display_name": "测试学习者",
        },
    )
    assert response.status_code == 201, response.text
    return username


def test_auth_is_required(client: TestClient):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/workspace").status_code == 401
    assert client.get("/api/health").json()["storage"] == "postgresql"


def test_register_login_logout(client: TestClient):
    username = register(client)
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["user"]["username"] == username

    cookie = me.headers.get("set-cookie")
    assert cookie is None  # only login/register set the cookie

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401

    assert (
        client.post(
            "/api/auth/login",
            json={"username": username, "password": "wrong-password"},
        ).status_code
        == 401
    )
    login = client.post(
        "/api/auth/login",
        json={"username": username.upper(), "password": "correct-horse-42"},
    )
    assert login.status_code == 200
    assert "httponly" in login.headers["set-cookie"].lower()
    assert "samesite=lax" in login.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").status_code == 200


def test_duplicate_username_is_rejected(client: TestClient):
    username = register(client, "dup")
    other = TestClient(client.app)
    response = other.post(
        "/api/auth/register",
        json={"username": username, "password": "another-password-42"},
    )
    assert response.status_code == 409


def test_workspace_isolation_and_revision_conflict(client: TestClient):
    first = register(client, "alice")
    second_username = f"bob_{uuid.uuid4().hex[:8]}"
    with TestClient(client.app) as second:
        assert (
            second.post(
                "/api/auth/register",
                json={"username": second_username, "password": "correct-horse-42"},
            ).status_code
            == 201
        )
        assert client.get("/api/workspace").json()["data"] is None
        assert (
            client.put(
                "/api/workspace",
                json={"expectedRevision": 0, "data": data("Alice")},
            ).status_code
            == 200
        )
        assert second.get("/api/workspace").json()["data"] is None
        assert (
            second.put(
                "/api/workspace",
                json={"expectedRevision": 0, "data": data("Bob")},
            ).status_code
            == 200
        )
        assert client.get("/api/workspace").json()["data"]["settings"]["name"] == "Alice"
        assert (
            second.get("/api/workspace").json()["data"]["settings"]["name"] == "Bob"
        )
        assert (
            client.put(
                "/api/workspace",
                json={"expectedRevision": 0, "data": data("stale")},
            ).status_code
            == 409
        )
    assert client.get("/api/auth/me").json()["user"]["username"] == first


def test_builtin_course_install_and_import(client: TestClient):
    register(client, "course")
    saved = client.put(
        "/api/workspace", json={"expectedRevision": 0, "data": data()}
    )
    assert saved.status_code == 200, saved.text
    workspace = saved.json()
    assert workspace["revision"] == 1
    assert len(workspace["data"]["trees"]) == 9
    assert len(workspace["data"]["nodes"]) == 24

    package = client.get("/api/course-packages/example")
    assert package.status_code == 200
    imported = client.post(
        "/api/course-packages/import",
        json={"expectedRevision": 1, "package": package.json()},
    )
    assert imported.status_code == 200, imported.text
    assert imported.json()["revision"] == 2


def test_invalid_workspace_is_rejected(client: TestClient):
    register(client, "invalid")
    bad = data()
    bad["trees"] = [
        {
            "id": "tree",
            "title": "树",
            "description": "",
            "color": "blue",
            "createdAt": "2026-01-01T00:00:00.000Z",
            "parentTreeId": None,
            "prerequisiteTreeIds": [],
        }
    ]
    bad["nodes"] = [
        {
            "id": "node",
            "treeId": "missing-tree",
            "parentId": None,
            "title": "节点",
            "note": "",
            "content": "",
            "quiz": [],
            "question": "",
            "answer": "",
            "resource": "",
            "card": {
                "due": "2026-01-01T00:00:00.000Z",
                "stability": 0,
                "difficulty": 0,
                "elapsed_days": 0,
                "scheduled_days": 0,
                "learning_steps": 0,
                "reps": 0,
                "lapses": 0,
                "state": 0,
            },
            "createdAt": "2026-01-01T00:00:00.000Z",
        }
    ]
    response = client.put(
        "/api/workspace", json={"expectedRevision": 0, "data": bad}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_data"


def test_invalid_registration(client: TestClient):
    assert (
        client.post(
            "/api/auth/register",
            json={"username": "ab", "password": "correct-horse-42"},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/auth/register",
            json={"username": "valid_name", "password": "short"},
        ).status_code
        == 422
    )
