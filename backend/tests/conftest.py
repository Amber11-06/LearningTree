import os

os.environ["LEARNINGTREE_DATABASE_URL"] = os.environ.get(
    "LEARNINGTREE_TEST_DATABASE_URL",
    "postgresql+psycopg://learningtree:learningtree@127.0.0.1:5432/learningtree_test",
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.app.db import Base, engine  # noqa: E402
from backend.app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client
