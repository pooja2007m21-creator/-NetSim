"""
NetSim Graph Algorithms Module
Implements graph theoretical algorithms for network topology analysis:
- Breadth-First Search (BFS) reachability
- Shortest-path finding in unweighted graphs
- Connected components decomposition
- Degree calculation and isolated device identification
- Educational explanations and topology verification
"""

from collections import deque
from typing import Any, Dict, List, Optional, Set, Tuple


class NetworkGraph:
    """
    Represents an undirected network topology graph.
    Nodes correspond to network devices (Computers, Switches, Routers)
    and edges correspond to network connections/cables.
    """

    def __init__(self, devices: List[Dict[str, Any]], connections: List[Dict[str, Any]]):
        self.devices = devices
        self.connections = connections
        self.device_map: Dict[str, Dict[str, Any]] = {d["id"]: d for d in devices}
        self.adj: Dict[str, Set[str]] = {d["id"]: set() for d in devices}
        self.edge_map: Dict[Tuple[str, str], Dict[str, Any]] = {}

        # Populate adjacency list and edge map (undirected)
        for conn in connections:
            u = conn.get("from")
            v = conn.get("to")
            if u in self.adj and v in self.adj:
                self.adj[u].add(v)
                self.adj[v].add(u)
                self.edge_map[(u, v)] = conn
                self.edge_map[(v, u)] = conn

    @property
    def node_count(self) -> int:
        return len(self.devices)

    @property
    def edge_count(self) -> int:
        return len(self.connections)

    def get_degrees(self) -> Dict[str, int]:
        """Calculate the degree (number of connected cables) for each device."""
        return {node_id: len(neighbors) for node_id, neighbors in self.adj.items()}

    def get_isolated_devices(self) -> List[Dict[str, Any]]:
        """Identify devices with degree 0 (no cables connected)."""
        isolated_ids = [node_id for node_id, neighbors in self.adj.items() if len(neighbors) == 0]
        return [self.device_map[node_id] for node_id in isolated_ids]

    def bfs_reachable(self, start_id: str) -> Dict[str, Any]:
        """
        Execute Breadth-First Search from a specified starting device.
        Returns:
            - visited: list of device IDs reachable from start_id
            - distances: dict mapping device ID to hop distance
            - unreachable: list of device IDs that cannot be reached
            - traversal_order: list of nodes in order discovered
        """
        if start_id not in self.device_map:
            raise ValueError(f"Starting device '{start_id}' does not exist in topology.")

        visited: Set[str] = {start_id}
        distances: Dict[str, int] = {start_id: 0}
        traversal_order: List[str] = [start_id]
        queue: deque = deque([start_id])

        while queue:
            current = queue.popleft()
            current_dist = distances[current]

            # Sort neighbor IDs for deterministic traversal
            for neighbor in sorted(self.adj.get(current, set())):
                if neighbor not in visited:
                    visited.add(neighbor)
                    distances[neighbor] = current_dist + 1
                    traversal_order.append(neighbor)
                    queue.append(neighbor)

        all_node_ids = set(self.device_map.keys())
        unreachable = sorted(list(all_node_ids - visited))

        return {
            "start_device_id": start_id,
            "start_device_name": self.device_map[start_id].get("name", start_id),
            "reachable_count": len(visited),
            "unreachable_count": len(unreachable),
            "visited": traversal_order,
            "distances": distances,
            "unreachable": unreachable,
        }

    def shortest_path(self, source_id: str, target_id: str) -> Dict[str, Any]:
        """
        Compute the shortest unweighted path between source and target devices using BFS.
        Returns detailed path devices, connection IDs, and hop count.
        """
        if source_id not in self.device_map:
            raise ValueError(f"Source device '{source_id}' does not exist.")
        if target_id not in self.device_map:
            raise ValueError(f"Target device '{target_id}' does not exist.")

        if source_id == target_id:
            src_device = self.device_map[source_id]
            return {
                "found": True,
                "hops": 0,
                "path_ids": [source_id],
                "path_devices": [src_device],
                "connection_ids": [],
                "explanation": f"Source and destination are the same device ({src_device.get('name')}). Hop count is 0.",
            }

        queue: deque = deque([source_id])
        visited: Set[str] = {source_id}
        predecessor: Dict[str, str] = {}

        path_found = False
        while queue:
            curr = queue.popleft()
            if curr == target_id:
                path_found = True
                break

            for nxt in sorted(self.adj.get(curr, set())):
                if nxt not in visited:
                    visited.add(nxt)
                    predecessor[nxt] = curr
                    queue.append(nxt)

        if not path_found:
            src_name = self.device_map[source_id].get("name", source_id)
            tgt_name = self.device_map[target_id].get("name", target_id)
            return {
                "found": False,
                "hops": -1,
                "path_ids": [],
                "path_devices": [],
                "connection_ids": [],
                "explanation": f"No network path exists between {src_name} and {tgt_name}. They belong to disconnected components.",
            }

        # Reconstruct path from target back to source
        path_ids: List[str] = []
        curr = target_id
        while curr != source_id:
            path_ids.append(curr)
            curr = predecessor[curr]
        path_ids.append(source_id)
        path_ids.reverse()

        path_devices = [self.device_map[node_id] for node_id in path_ids]

        # Identify connections traversed
        connection_ids: List[str] = []
        for i in range(len(path_ids) - 1):
            u = path_ids[i]
            v = path_ids[i + 1]
            conn = self.edge_map.get((u, v))
            if conn and "id" in conn:
                connection_ids.append(conn["id"])

        hops = len(path_ids) - 1
        path_names = " -> ".join([d.get("name", d["id"]) for d in path_devices])

        explanation = (
            f"Path found in {hops} hop(s): {path_names}. "
            "Note: This shortest path represents an abstract graph traversal (like minimal hop count in RIP routing) "
            "and does not model packet queueing, link bandwidth, or dynamic routing protocols."
        )

        return {
            "found": True,
            "hops": hops,
            "path_ids": path_ids,
            "path_devices": path_devices,
            "connection_ids": connection_ids,
            "explanation": explanation,
        }

    def get_connected_components(self) -> List[List[str]]:
        """
        Decompose the network into connected components.
        Returns a list of components, where each component is a sorted list of device IDs.
        """
        visited: Set[str] = set()
        components: List[List[str]] = []

        for node_id in sorted(self.device_map.keys()):
            if node_id not in visited:
                comp: List[str] = []
                queue: deque = deque([node_id])
                visited.add(node_id)

                while queue:
                    curr = queue.popleft()
                    comp.append(curr)
                    for nxt in sorted(self.adj.get(curr, set())):
                        if nxt not in visited:
                            visited.add(nxt)
                            queue.append(nxt)

                components.append(sorted(comp))

        # Sort components by size (descending)
        components.sort(key=len, reverse=True)
        return components

    def get_connectivity_status(self) -> Dict[str, Any]:
        """
        Determine overall graph connectivity and provide an educational status report.
        """
        v = self.node_count
        e = self.edge_count

        if v == 0:
            return {
                "is_connected": False,
                "status": "Empty Topology",
                "component_count": 0,
                "components": [],
                "explanation": "The canvas has no network devices. Add devices to begin creating a topology.",
            }

        components = self.get_connected_components()
        comp_count = len(components)

        # Build detailed component data with device names
        detailed_components = []
        for idx, comp in enumerate(components, 1):
            detailed_components.append({
                "component_index": idx,
                "device_ids": comp,
                "device_names": [self.device_map[nid].get("name", nid) for nid in comp],
                "size": len(comp),
            })

        if v == 1:
            return {
                "is_connected": True,
                "status": "Trivially Connected",
                "component_count": 1,
                "components": detailed_components,
                "explanation": "A single standalone device is mathematically connected to itself (1 connected component).",
            }

        if comp_count == 1:
            # Check if network is a tree (spanning tree)
            is_tree = (e == v - 1)
            tree_note = " (Acyclic Tree / Loop-Free)" if is_tree else " (Mesh / Redundant Paths Present)"
            return {
                "is_connected": True,
                "status": "Fully Connected",
                "component_count": 1,
                "components": detailed_components,
                "explanation": f"The network is fully connected. Every device can reach every other device{tree_note}.",
            }

        return {
            "is_connected": False,
            "status": "Partitioned / Disconnected",
            "component_count": comp_count,
            "components": detailed_components,
            "explanation": (
                f"The network is partitioned into {comp_count} separate disconnected sub-networks. "
                "Devices in different components cannot communicate without a bridge, switch, or router connecting them."
            ),
        }

    def get_topology_summary(self) -> Dict[str, Any]:
        """
        Produce a comprehensive academic summary of the network topology.
        """
        device_counts: Dict[str, int] = {"Computer": 0, "Switch": 0, "Router": 0}
        for d in self.devices:
            dtype = d.get("type", "Computer")
            device_counts[dtype] = device_counts.get(dtype, 0) + 1

        degrees = self.get_degrees()
        isolated = self.get_isolated_devices()
        conn_status = self.get_connectivity_status()

        v = self.node_count
        e = self.edge_count
        max_possible_edges = (v * (v - 1)) // 2 if v >= 2 else 0
        density = round(e / max_possible_edges, 4) if max_possible_edges > 0 else 0.0

        avg_degree = round(sum(degrees.values()) / v, 2) if v > 0 else 0.0

        # Educational insight
        insights = []
        if v == 0:
            insights.append("Empty workspace: Start by placing computers and connecting them through a switch or router.")
        else:
            if isolated:
                names = ", ".join([d.get("name", d["id"]) for d in isolated[:3]])
                if len(isolated) > 3:
                    names += f" and {len(isolated) - 3} others"
                insights.append(f"Warning: {len(isolated)} device(s) are isolated ({names}) with no network cabling.")
            if conn_status["is_connected"] and v > 1:
                insights.append("Full connectivity achieved: All hosts have end-to-end communication paths.")
            elif not conn_status["is_connected"] and v > 1:
                insights.append("Network partition: Packets cannot route between isolated components.")
            if device_counts.get("Computer", 0) > 1 and device_counts.get("Switch", 0) == 0 and device_counts.get("Router", 0) == 0:
                insights.append("Notice: Multiple computers connected directly without switches or routers represent point-to-point connections.")

        return {
            "total_devices": v,
            "total_connections": e,
            "computers": device_counts.get("Computer", 0),
            "switches": device_counts.get("Switch", 0),
            "routers": device_counts.get("Router", 0),
            "connectivity": conn_status,
            "degrees": degrees,
            "average_degree": avg_degree,
            "density": density,
            "isolated_devices": isolated,
            "isolated_count": len(isolated),
            "insights": insights,
        }
