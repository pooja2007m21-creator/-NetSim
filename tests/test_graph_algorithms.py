"""
Unit tests for NetSim graph algorithms (NetworkGraph)
"""

import pytest
from backend.graph_algorithms import NetworkGraph


def test_empty_topology():
    graph = NetworkGraph(devices=[], connections=[])
    assert graph.node_count == 0
    assert graph.edge_count == 0

    status = graph.get_connectivity_status()
    assert status["is_connected"] is False
    assert status["status"] == "Empty Topology"
    assert status["component_count"] == 0

    summary = graph.get_topology_summary()
    assert summary["total_devices"] == 0
    assert summary["total_connections"] == 0
    assert summary["isolated_count"] == 0


def test_single_device_topology():
    devices = [{"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100}]
    graph = NetworkGraph(devices=devices, connections=[])

    assert graph.node_count == 1
    assert graph.edge_count == 0

    status = graph.get_connectivity_status()
    assert status["is_connected"] is True
    assert status["status"] == "Trivially Connected"
    assert status["component_count"] == 1

    summary = graph.get_topology_summary()
    assert summary["computers"] == 1
    assert summary["switches"] == 0
    assert summary["routers"] == 0
    assert summary["isolated_count"] == 1


def test_two_connected_devices():
    devices = [
        {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
        {"id": "pc2", "type": "Computer", "name": "PC-2", "x": 300, "y": 100},
    ]
    connections = [{"id": "c1", "from": "pc1", "to": "pc2"}]
    graph = NetworkGraph(devices=devices, connections=connections)

    status = graph.get_connectivity_status()
    assert status["is_connected"] is True
    assert status["component_count"] == 1

    degrees = graph.get_degrees()
    assert degrees["pc1"] == 1
    assert degrees["pc2"] == 1
    assert len(graph.get_isolated_devices()) == 0


def test_two_disconnected_devices():
    devices = [
        {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
        {"id": "pc2", "type": "Computer", "name": "PC-2", "x": 300, "y": 100},
    ]
    graph = NetworkGraph(devices=devices, connections=[])

    status = graph.get_connectivity_status()
    assert status["is_connected"] is False
    assert status["component_count"] == 2
    assert len(graph.get_isolated_devices()) == 2


def test_multiple_connected_components():
    # Component 1: PC1 - SW1 - PC2
    # Component 2: R1 - PC3
    # Component 3: PC4 (isolated)
    devices = [
        {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
        {"id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100},
        {"id": "pc2", "type": "Computer", "name": "PC-2", "x": 300, "y": 100},
        {"id": "r1", "type": "Router", "name": "R-1", "x": 100, "y": 300},
        {"id": "pc3", "type": "Computer", "name": "PC-3", "x": 200, "y": 300},
        {"id": "pc4", "type": "Computer", "name": "PC-4", "x": 400, "y": 400},
    ]
    connections = [
        {"id": "c1", "from": "pc1", "to": "sw1"},
        {"id": "c2", "from": "sw1", "to": "pc2"},
        {"id": "c3", "from": "r1", "to": "pc3"},
    ]
    graph = NetworkGraph(devices=devices, connections=connections)

    components = graph.get_connected_components()
    assert len(components) == 3

    # Sizes: [3, 2, 1]
    sizes = sorted([len(c) for c in components], reverse=True)
    assert sizes == [3, 2, 1]

    status = graph.get_connectivity_status()
    assert status["is_connected"] is False
    assert status["component_count"] == 3


def test_bfs_reachable_results():
    # PC1 - SW1 - R1 - PC2, and isolated PC3
    devices = [
        {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
        {"id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100},
        {"id": "r1", "type": "Router", "name": "R-1", "x": 300, "y": 100},
        {"id": "pc2", "type": "Computer", "name": "PC-2", "x": 400, "y": 100},
        {"id": "pc3", "type": "Computer", "name": "PC-3", "x": 500, "y": 500},
    ]
    connections = [
        {"id": "c1", "from": "pc1", "to": "sw1"},
        {"id": "c2", "from": "sw1", "to": "r1"},
        {"id": "c3", "from": "r1", "to": "pc2"},
    ]
    graph = NetworkGraph(devices=devices, connections=connections)

    bfs = graph.bfs_reachable("pc1")
    assert bfs["start_device_id"] == "pc1"
    assert bfs["reachable_count"] == 4
    assert bfs["unreachable_count"] == 1
    assert "pc3" in bfs["unreachable"]
    assert bfs["distances"]["pc1"] == 0
    assert bfs["distances"]["sw1"] == 1
    assert bfs["distances"]["r1"] == 2
    assert bfs["distances"]["pc2"] == 3


def test_bfs_invalid_start_device():
    graph = NetworkGraph(devices=[], connections=[])
    with pytest.raises(ValueError, match="does not exist"):
        graph.bfs_reachable("non_existent_id")


def test_shortest_path_found():
    # PC1 - SW1 - R1 - PC2
    devices = [
        {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
        {"id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100},
        {"id": "r1", "type": "Router", "name": "R-1", "x": 300, "y": 100},
        {"id": "pc2", "type": "Computer", "name": "PC-2", "x": 400, "y": 100},
    ]
    connections = [
        {"id": "c1", "from": "pc1", "to": "sw1"},
        {"id": "c2", "from": "sw1", "to": "r1"},
        {"id": "c3", "from": "r1", "to": "pc2"},
    ]
    graph = NetworkGraph(devices=devices, connections=connections)

    result = graph.shortest_path("pc1", "pc2")
    assert result["found"] is True
    assert result["hops"] == 3
    assert result["path_ids"] == ["pc1", "sw1", "r1", "pc2"]
    assert result["connection_ids"] == ["c1", "c2", "c3"]


def test_shortest_path_same_node():
    devices = [{"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100}]
    graph = NetworkGraph(devices=devices, connections=[])

    result = graph.shortest_path("pc1", "pc1")
    assert result["found"] is True
    assert result["hops"] == 0
    assert result["path_ids"] == ["pc1"]


def test_shortest_path_no_available_path():
    devices = [
        {"id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100},
        {"id": "pc2", "type": "Computer", "name": "PC-2", "x": 400, "y": 100},
    ]
    graph = NetworkGraph(devices=devices, connections=[])

    result = graph.shortest_path("pc1", "pc2")
    assert result["found"] is False
    assert result["hops"] == -1
    assert result["path_ids"] == []
