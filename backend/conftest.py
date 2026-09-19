"""All API tests use their own database, including the existing demo-user tests."""
import os
import tempfile
import pytest

_test_database = tempfile.TemporaryDirectory(prefix="labhub-pytest-")
os.environ["LABHUB_DB_PATH"] = os.path.join(_test_database.name, "test.db")


@pytest.fixture(scope="session", autouse=True)
def isolated_database():
    from backend.seed import init_db
    from backend.database import engine
    init_db()
    yield
    engine.dispose()
    _test_database.cleanup()
