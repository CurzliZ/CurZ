import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(f"sqlite:///{(tmp_path / 'index.db').as_posix()}")
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def opened_client(client, tmp_path):
    response = client.post(
        "/api/vault/create",
        json={"path": str(tmp_path / "vault")},
    )
    assert response.status_code == 201
    return client
