"""
Unit tests for NetSim input validators
"""

from backend.validators import validate_topology_payload


def test_valid_topology_payload():
    payload = {
        "name": "LAN Topology",
        "description": "Star topology with central switch",
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "Workstation 1", "x": 100, "y": 100},
            {"id": "sw1", "type": "Switch", "name": "Switch Core", "x": 300, "y": 200},
        ],
        "connections": [
            {"id": "conn1", "from": "pc1", "to": "sw1"},
        ],
    }
    is_valid, err, sanitized = validate_topology_payload(payload)
    assert is_valid is True
    assert err is None
    assert len(sanitized["devices"]) == 2
    assert len(sanitized["connections"]) == 1
    assert sanitized["name"] == "LAN Topology"


def test_invalid_device_type():
    payload = {
        "devices": [
            {"id": "s1", "type": "Satellite", "name": "Sat-1", "x": 100, "y": 100},
        ],
        "connections": [],
    }
    is_valid, err, _ = validate_topology_payload(payload)
    assert is_valid is False
    assert "invalid type 'Satellite'" in err


def test_duplicate_device_id():
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC 1", "x": 100, "y": 100},
            {"id": "pc1", "type": "Computer", "name": "Duplicate PC 1", "x": 200, "y": 200},
        ],
        "connections": [],
    }
    is_valid, err, _ = validate_topology_payload(payload)
    assert is_valid is False
    assert "Duplicate device ID found: 'pc1'" in err


def test_invalid_connection_endpoint():
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC 1", "x": 100, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "pc999"},
        ],
    }
    is_valid, err, _ = validate_topology_payload(payload)
    assert is_valid is False
    assert "references non-existent 'to' device 'pc999'" in err


def test_self_connection():
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC 1", "x": 100, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "pc1"},
        ],
    }
    is_valid, err, _ = validate_topology_payload(payload)
    assert is_valid is False
    assert "cannot connect to itself" in err


def test_duplicate_connection():
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC 1", "x": 100, "y": 100},
            {"id": "pc2", "type": "Computer", "name": "PC 2", "x": 200, "y": 100},
        ],
        "connections": [
            {"id": "c1", "from": "pc1", "to": "pc2"},
            {"id": "c2", "from": "pc2", "to": "pc1"},  # Reverse order of same undirected edge
        ],
    }
    is_valid, err, _ = validate_topology_payload(payload)
    assert is_valid is False
    assert "Duplicate connection" in err


def test_non_dict_payload():
    is_valid, err, _ = validate_topology_payload("invalid string payload")
    assert is_valid is False
    assert "must be a JSON object" in err


def test_devices_not_list():
    is_valid, err, _ = validate_topology_payload({"devices": "not-a-list", "connections": []})
    assert is_valid is False
    assert "'devices' field must be a list" in err


def test_coordinate_bounds():
    payload = {
        "devices": [
            {"id": "pc1", "type": "Computer", "name": "PC 1", "x": -50, "y": 100},
        ],
        "connections": [],
    }
    is_valid, err, _ = validate_topology_payload(payload)
    assert is_valid is False
    assert "outside valid canvas bounds" in err
