"""
NetSim API Routes Module
Defines RESTful API endpoints for topology CRUD operations, graph algorithms,
connectivity checks, shortest-path calculation, and import/export.
"""

from datetime import datetime, timezone
from flask import Blueprint, current_app, jsonify, request

from .database import (
    delete_topology,
    get_all_topologies,
    get_topology_by_id,
    save_topology,
    update_topology,
)
from .graph_algorithms import NetworkGraph
from .validators import validate_topology_payload

api_bp = Blueprint("api", __name__)


@api_bp.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify backend server status."""
    return jsonify({
        "status": "healthy",
        "service": "NetSim REST API",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }), 200


@api_bp.route("/topologies", methods=["GET"])
def list_topologies():
    """Retrieve metadata list of all persisted topologies."""
    db_path = current_app.config["DATABASE_PATH"]
    try:
        topologies = get_all_topologies(db_path)
        return jsonify({
            "success": True,
            "count": len(topologies),
            "topologies": topologies,
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": "Failed to retrieve topologies.", "details": str(e)}), 500


@api_bp.route("/topologies", methods=["POST"])
def create_topology():
    """Validate and persist a new network topology to SQLite."""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"success": False, "error": "Invalid or missing JSON payload."}), 400

    is_valid, err_msg, sanitized = validate_topology_payload(payload)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    db_path = current_app.config["DATABASE_PATH"]
    try:
        top_id = save_topology(
            db_path=db_path,
            name=sanitized["name"],
            description=sanitized["description"],
            topology_data={
                "devices": sanitized["devices"],
                "connections": sanitized["connections"],
            },
            device_count=len(sanitized["devices"]),
            connection_count=len(sanitized["connections"]),
        )
        return jsonify({
            "success": True,
            "id": top_id,
            "name": sanitized["name"],
            "message": f"Topology '{sanitized['name']}' saved successfully with ID {top_id}.",
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": "Database error while saving topology.", "details": str(e)}), 500


@api_bp.route("/topologies/<int:top_id>", methods=["GET"])
def get_topology(top_id: int):
    """Retrieve full saved topology by ID."""
    db_path = current_app.config["DATABASE_PATH"]
    topology = get_topology_by_id(db_path, top_id)
    if not topology:
        return jsonify({"success": False, "error": f"Topology with ID {top_id} not found."}), 404

    return jsonify({
        "success": True,
        "topology": topology,
    }), 200


@api_bp.route("/topologies/<int:top_id>", methods=["PUT"])
def update_saved_topology(top_id: int):
    """Update an existing saved topology."""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"success": False, "error": "Invalid or missing JSON payload."}), 400

    is_valid, err_msg, sanitized = validate_topology_payload(payload)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    db_path = current_app.config["DATABASE_PATH"]
    try:
        updated = update_topology(
            db_path=db_path,
            top_id=top_id,
            name=sanitized["name"],
            description=sanitized["description"],
            topology_data={
                "devices": sanitized["devices"],
                "connections": sanitized["connections"],
            },
            device_count=len(sanitized["devices"]),
            connection_count=len(sanitized["connections"]),
        )
        if not updated:
            return jsonify({"success": False, "error": f"Topology with ID {top_id} not found."}), 404

        return jsonify({
            "success": True,
            "message": f"Topology '{sanitized['name']}' (ID: {top_id}) updated successfully.",
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": "Database error while updating topology.", "details": str(e)}), 500


@api_bp.route("/topologies/<int:top_id>", methods=["DELETE"])
def delete_saved_topology(top_id: int):
    """Delete a saved topology by ID."""
    db_path = current_app.config["DATABASE_PATH"]
    try:
        deleted = delete_topology(db_path, top_id)
        if not deleted:
            return jsonify({"success": False, "error": f"Topology with ID {top_id} not found."}), 404

        return jsonify({
            "success": True,
            "message": f"Topology with ID {top_id} was deleted successfully.",
        }), 200
    except Exception as e:
        return jsonify({"success": False, "error": "Database error while deleting topology.", "details": str(e)}), 500


@api_bp.route("/topology/export/<int:top_id>", methods=["GET"])
def export_topology(top_id: int):
    """Export a saved topology as downloadable JSON with schema versioning."""
    db_path = current_app.config["DATABASE_PATH"]
    topology = get_topology_by_id(db_path, top_id)
    if not topology:
        return jsonify({"success": False, "error": f"Topology with ID {top_id} not found."}), 404

    export_data = {
        "schema_version": "1.0",
        "generator": "NetSim - Interactive Computer Network Topology Simulator",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "topology": {
            "name": topology["name"],
            "description": topology.get("description", ""),
            "devices": topology["topology_data"].get("devices", []),
            "connections": topology["topology_data"].get("connections", []),
        },
    }
    return jsonify(export_data), 200


@api_bp.route("/analyze/connectivity", methods=["POST"])
def analyze_connectivity():
    """
    Analyze network connectivity and optionally execute BFS reachability from a start device.
    """
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"success": False, "error": "Invalid JSON payload."}), 400

    is_valid, err_msg, sanitized = validate_topology_payload(payload)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    graph = NetworkGraph(sanitized["devices"], sanitized["connections"])
    conn_status = graph.get_connectivity_status()

    # Optional BFS reachability from a selected starting device
    start_id = payload.get("start_device_id")
    bfs_results = None
    if start_id:
        if start_id not in graph.device_map:
            return jsonify({
                "success": False,
                "error": f"Starting device '{start_id}' does not exist in topology.",
            }), 400
        bfs_results = graph.bfs_reachable(start_id)

    return jsonify({
        "success": True,
        "connectivity": conn_status,
        "bfs": bfs_results,
    }), 200


@api_bp.route("/analyze/shortest-path", methods=["POST"])
def analyze_shortest_path():
    """
    Compute the shortest path between two devices using Breadth-First Search (BFS).
    """
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"success": False, "error": "Invalid JSON payload."}), 400

    is_valid, err_msg, sanitized = validate_topology_payload(payload)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    source_id = payload.get("source_id")
    target_id = payload.get("target_id")

    if not source_id or not isinstance(source_id, str):
        return jsonify({"success": False, "error": "Missing or invalid 'source_id'."}), 400
    if not target_id or not isinstance(target_id, str):
        return jsonify({"success": False, "error": "Missing or invalid 'target_id'."}), 400

    graph = NetworkGraph(sanitized["devices"], sanitized["connections"])

    if source_id not in graph.device_map:
        return jsonify({"success": False, "error": f"Source device '{source_id}' does not exist."}), 400
    if target_id not in graph.device_map:
        return jsonify({"success": False, "error": f"Destination device '{target_id}' does not exist."}), 400

    path_result = graph.shortest_path(source_id, target_id)
    return jsonify({
        "success": True,
        "result": path_result,
    }), 200


@api_bp.route("/analyze/components", methods=["POST"])
def analyze_components():
    """Decompose topology into connected components."""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"success": False, "error": "Invalid JSON payload."}), 400

    is_valid, err_msg, sanitized = validate_topology_payload(payload)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    graph = NetworkGraph(sanitized["devices"], sanitized["connections"])
    conn_status = graph.get_connectivity_status()

    return jsonify({
        "success": True,
        "component_count": conn_status["component_count"],
        "components": conn_status["components"],
        "is_connected": conn_status["is_connected"],
        "status": conn_status["status"],
        "explanation": conn_status["explanation"],
    }), 200


@api_bp.route("/analyze/summary", methods=["POST"])
def analyze_summary():
    """Generate a comprehensive academic topology summary."""
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"success": False, "error": "Invalid JSON payload."}), 400

    is_valid, err_msg, sanitized = validate_topology_payload(payload)
    if not is_valid:
        return jsonify({"success": False, "error": err_msg}), 400

    graph = NetworkGraph(sanitized["devices"], sanitized["connections"])
    summary = graph.get_topology_summary()

    return jsonify({
        "success": True,
        "summary": summary,
    }), 200
