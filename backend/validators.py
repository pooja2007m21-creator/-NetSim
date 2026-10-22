"""
NetSim Validators Module
Provides robust validation functions for network topology payloads, devices, and connections.
Guards against invalid inputs, duplicate IDs, self-loops, and duplicate edges.
"""

from typing import Any, Dict, List, Optional, Set, Tuple

ALLOWED_DEVICE_TYPES = {"Computer", "Switch", "Router"}
MAX_DEVICES = 50
MAX_CONNECTIONS = 200
CANVAS_BOUNDS = {"min_x": 0, "max_x": 5000, "min_y": 0, "max_y": 5000}


def validate_device(device: Any, index: int) -> Tuple[bool, Optional[str]]:
    """Validate a single device object."""
    if not isinstance(device, dict):
        return False, f"Device at index {index} must be a JSON object."

    device_id = device.get("id")
    if not device_id or not isinstance(device_id, str):
        return False, f"Device at index {index} must have a non-empty string 'id'."
    if len(device_id) > 64:
        return False, f"Device '{device_id}' ID exceeds maximum allowed length of 64 characters."

    dev_type = device.get("type")
    if dev_type not in ALLOWED_DEVICE_TYPES:
        return False, f"Device '{device_id}' has invalid type '{dev_type}'. Allowed types: {sorted(list(ALLOWED_DEVICE_TYPES))}."

    name = device.get("name")
    if name is not None:
        if not isinstance(name, str):
            return False, f"Device '{device_id}' name must be a string."
        if len(name) > 64:
            return False, f"Device '{device_id}' name exceeds 64 characters."

    x = device.get("x")
    y = device.get("y")
    if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        return False, f"Device '{device_id}' coordinates ('x', 'y') must be numbers."

    if not (CANVAS_BOUNDS["min_x"] <= x <= CANVAS_BOUNDS["max_x"]) or not (
        CANVAS_BOUNDS["min_y"] <= y <= CANVAS_BOUNDS["max_y"]
    ):
        return False, f"Device '{device_id}' coordinates ({x}, {y}) are outside valid canvas bounds."

    return True, None


def validate_connection(
    connection: Any,
    index: int,
    valid_device_ids: Set[str],
    seen_edges: Set[Tuple[str, str]],
) -> Tuple[bool, Optional[str]]:
    """Validate a single connection object."""
    if not isinstance(connection, dict):
        return False, f"Connection at index {index} must be a JSON object."

    conn_id = connection.get("id")
    if not conn_id or not isinstance(conn_id, str):
        return False, f"Connection at index {index} must have a non-empty string 'id'."

    u = connection.get("from")
    v = connection.get("to")

    if not u or not isinstance(u, str):
        return False, f"Connection '{conn_id}' has missing or invalid 'from' device reference."
    if not v or not isinstance(v, str):
        return False, f"Connection '{conn_id}' has missing or invalid 'to' device reference."

    if u not in valid_device_ids:
        return False, f"Connection '{conn_id}' references non-existent 'from' device '{u}'."
    if v not in valid_device_ids:
        return False, f"Connection '{conn_id}' references non-existent 'to' device '{v}'."

    if u == v:
        return False, f"Invalid self-connection '{conn_id}': Device '{u}' cannot connect to itself."

    # Check for duplicate undirected edge
    edge = tuple(sorted([u, v]))
    if edge in seen_edges:
        return False, f"Duplicate connection '{conn_id}': A link already exists between '{u}' and '{v}'."
    seen_edges.add(edge)

    return True, None


def validate_topology_payload(payload: Any) -> Tuple[bool, Optional[str], Optional[Dict[str, Any]]]:
    """
    Validate an entire topology payload containing devices and connections.
    Returns (is_valid, error_message, sanitized_payload).
    """
    if not isinstance(payload, dict):
        return False, "Payload must be a JSON object.", None

    devices = payload.get("devices")
    if not isinstance(devices, list):
        return False, "'devices' field must be a list.", None

    connections = payload.get("connections")
    if not isinstance(connections, list):
        return False, "'connections' field must be a list.", None

    if len(devices) > MAX_DEVICES:
        return False, f"Topology exceeds maximum allowed device limit of {MAX_DEVICES} devices.", None

    if len(connections) > MAX_CONNECTIONS:
        return False, f"Topology exceeds maximum allowed connection limit of {MAX_CONNECTIONS} connections.", None

    # Validate devices and collect IDs
    device_ids: Set[str] = set()
    sanitized_devices: List[Dict[str, Any]] = []

    for idx, dev in enumerate(devices):
        is_dev_valid, dev_err = validate_device(dev, idx)
        if not is_dev_valid:
            return False, dev_err, None

        dev_id = dev["id"]
        if dev_id in device_ids:
            return False, f"Duplicate device ID found: '{dev_id}'. All device IDs must be unique.", None
        device_ids.add(dev_id)

        sanitized_devices.append({
            "id": dev_id,
            "type": dev["type"],
            "name": dev.get("name", dev_id).strip(),
            "x": round(float(dev["x"]), 2),
            "y": round(float(dev["y"]), 2),
            "created_at": dev.get("created_at"),
        })

    # Validate connections
    seen_edges: Set[Tuple[str, str]] = set()
    conn_ids: Set[str] = set()
    sanitized_connections: List[Dict[str, Any]] = []

    for idx, conn in enumerate(connections):
        is_conn_valid, conn_err = validate_connection(conn, idx, device_ids, seen_edges)
        if not is_conn_valid:
            return False, conn_err, None

        conn_id = conn["id"]
        if conn_id in conn_ids:
            return False, f"Duplicate connection ID found: '{conn_id}'.", None
        conn_ids.add(conn_id)

        sanitized_connections.append({
            "id": conn_id,
            "from": conn["from"],
            "to": conn["to"],
            "status": conn.get("status", "active"),
        })

    sanitized = {
        "name": str(payload.get("name", "Untitled Topology"))[:100].strip() or "Untitled Topology",
        "description": str(payload.get("description", ""))[:500].strip(),
        "devices": sanitized_devices,
        "connections": sanitized_connections,
    }

    return True, None, sanitized
