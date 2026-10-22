"""
Integration tests for NetSim REST API endpoints
"""

import os
import tempfile
import pytest
from app import create_app
from backend.database import init_db


@pytest.fixture
def client():
    """Create and configure a test Flask client with an isolated temporary SQLite database."""
    db_fd, db_path = tempfile.mkstemp(suffix=".db")
    app = create_app("testing")
    app.config["DATABASE_PATH"] = db_path
    app.config["TESTING"] = True

    # Re-init isolated test DB
    init_db(db_path)

    with app.test_client() as client:
        yield client

    os.close(db_fd)
    if os.path.exists(db_path):
        os.remove(db_path)


def test_index_page(client):
    res = client.get("/")
    assert res.status_code == 200
    assert b"NetSim" in res.data
    assert b"Interactive Computer Network Topology Simulator" in res.data


def test_health_check(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.get_json()
    assert data["status"] == "healthy"
    assert data["service"] == "NetSim REST API"


def test_empty_topologies_list(client):
    res = client.get("/api/topologies")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["count"] == 0
    assert data["topologies"] == []


def test_create_and_retrieve_topology(client):
    payload = {
        "name": "Classroom Star LAN",
        "description": "Star network for lab room 302",
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "Lab-PC-01", "x": 100, "y": 150},
            {"id": "sw1", "type": "Switch", "name": "Core-Switch", "x": 300, "y": 150},
            {"id": "pc2", "type": "Computer", "name": "Lab-PC-02", "x": 500, "y": 150},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "sw1"},
            {"id": "c2", "from": "sw1", "to": "pc2"},
        ],
    }

    # Create topology
    create_res = client.post("/api/topologies", json=payload)
    assert create_res.status_code == 201
    create_data = create_res.get_json()
    assert create_data["success"] is True
    top_id = create_data["id"]
    assert top_id > 0

    # Retrieve topology
    get_res = client.get(f"/api/topologies/{top_id}")
    assert get_res.status_code == 200
    get_data = get_res.get_json()
    assert get_data["success"] is True
    top = get_data["topology"]
    assert top["name"] == "Classroom Star LAN"
    assert top["device_count"] == 3
    assert top["connection_count"] == 2
    assert len(top["topology_data"]["devices"]) == 3


def test_update_topology(client):
    # First create
    payload = {
        "name": "Initial Name",
        "description": "Initial desc",
        "devices": [{"id": "pc1", "type": "Computer", "name": "PC-1", "x": 50, "y": 50}],
        "connections": [],
    }
    create_res = client.post("/api/topologies", json=payload)
    top_id = create_res.get_json()["id"]

    # Now update
    update_payload = {
        "name": "Updated Name",
        "description": "Updated desc",
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 50, "y": 50},
            {"id": "r1", "type": "Router", "name": "Gateway Router", "x": 200, "y": 50},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "r1"},
        ],
    }
    update_res = client.put(f"/api/topologies/{top_id}", json=update_payload)
    assert update_res.status_code == 200
    assert update_res.get_json()["success"] is True

    # Verify updated
    get_res = client.get(f"/api/topologies/{top_id}")
    top = get_res.get_json()["topology"]
    assert top["name"] == "Updated Name"
    assert top["device_count"] == 2
    assert top["connection_count"] == 1


def test_delete_topology(client):
    payload = {
        "name": "To Delete",
        "devices": [],
        "connections": [],
    }
    create_res = client.post("/api/topologies", json=payload)
    top_id = create_res.get_json()["id"]

    # Delete
    del_res = client.delete(f"/api/topologies/{top_id}")
    assert del_res.status_code == 200
    assert del_res.get_json()["success"] is True

    # Confirm 404
    get_res = client.get(f"/api/topologies/{top_id}")
    assert get_res.status_code == 404


def test_export_topology(client):
    payload = {
        "name": "Campus Backbone",
        "description": "Ring backbone topology",
        "devices": [{"id": "r1", "type": "Router", "name": "Border Router", "x": 100, "y": 100}],
        "connections": [],
    }
    create_res = client.post("/api/topologies", json=payload)
    top_id = create_res.get_json()["id"]

    export_res = client.get(f"/api/topology/export/{top_id}")
    assert export_res.status_code == 200
    export_data = export_res.get_json()
    assert export_data["schema_version"] == "1.0"
    assert export_data["topology"]["name"] == "Campus Backbone"
    assert len(export_data["topology"]["devices"]) == 1


def test_analyze_connectivity_endpoint(client):
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
            {"id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "sw1"},
        ],
        "start_device_id": "pc1",
    }
    res = client.post("/api/analyze/connectivity", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["connectivity"]["is_connected"] is True
    assert data["bfs"]["reachable_count"] == 2


def test_analyze_shortest_path_endpoint(client):
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
            {"id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100},
            {"id": "pc2", "type": "Computer", "name": "PC-2", "x": 300, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "sw1"},
            {"id": "c2", "from": "sw1", "to": "pc2"},
        ],
        "source_id": "pc1",
        "target_id": "pc2",
    }
    res = client.post("/api/analyze/shortest-path", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["result"]["found"] is True
    assert data["result"]["hops"] == 2
    assert data["result"]["path_ids"] == ["pc1", "sw1", "pc2"]


def test_analyze_summary_endpoint(client):
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
            {"id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100},
            {"id": "r1", "type": "Router", "name": "R-1", "x": 300, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "sw1"},
            {"id": "c2", "from": "sw1", "to": "r1"},
        ],
    }
    res = client.post("/api/analyze/summary", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    summary = data["summary"]
    assert summary["computers"] == 1
    assert summary["switches"] == 1
    assert summary["routers"] == 1
    assert summary["total_connections"] == 2


def test_malformed_json(client):
    res = client.post(
        "/api/topologies",
        data="not json at all",
        content_type="application/json",
    )
    assert res.status_code == 400
    data = res.get_json()
    assert data["success"] is False
    assert "Invalid or missing JSON payload" in data["error"]
