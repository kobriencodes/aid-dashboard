import pytest
from backend.app import app

@pytest.fixture
def client():
    app.testing = True
    with app.test_client() as client:
        yield client

def test_health_endpoint(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert b"ok" in res.data

def test_health_endpoint(client):
    res = client.get("/data/health_centers")
    assert res.status_code == 200
    data = res.get_json()
    assert "features" in data
    assert len(data["features"]) > 0

def test_roads_endpoint(client):
    res = client.get("/data/roads")
    assert res.status_code == 200
    data = res.get_json()
    assert "features" in data
    assert all(f["geometry"]["type"] == "LineString" for f in data["features"]), "Non-LineString geometry found"


def test_checkpoints_endpoint(client):
    res = client.get("/data/checkpoints")
    assert res.status_code == 200
    data = res.get_json()
    assert "features" in data
    assert all(f["geometry"]["type"] == "Point" for f in data["features"]), "Non-Point geometry found"


def test_border_crossings_endpoint(client):
    res = client.get("/data/border_crossings")
    assert res.status_code == 200
    data = res.get_json()
    assert "features" in data
    assert all("name" in f["properties"] for f in data["features"]), "Missing 'name' in border crossing properties"