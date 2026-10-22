# NetSim – REST API Documentation

This document provides complete reference documentation for all RESTful API endpoints exposed by the NetSim Flask backend.

All endpoints communicate using standard JSON payloads over HTTP.

---

## Base URL
When running locally:
```
http://127.0.0.1:5000/api
```

---

## Common Headers
- `Content-Type: application/json` (Required for POST/PUT requests with bodies)
- `Accept: application/json`

---

## 1. Health Check
### `GET /api/health`
Verifies backend service availability, version, and server time.

**Request:**
- Method: `GET`
- Query Parameters: None
- Body: None

**Response `200 OK`:**
```json
{
  "status": "healthy",
  "service": "NetSim REST API",
  "version": "1.0.0",
  "timestamp": "2026-10-22T11:45:00.000000Z"
}
```

---

## 2. Topologies CRUD Endpoints

### `GET /api/topologies`
Retrieves a list of all saved topologies metadata (ordered by most recently updated).

**Request:**
- Method: `GET`
- Body: None

**Response `200 OK`:**
```json
{
  "success": true,
  "count": 2,
  "topologies": [
    {
      "id": 1,
      "name": "Campus Core Star",
      "description": "Star LAN for lab 101",
      "device_count": 6,
      "connection_count": 5,
      "created_at": "2026-10-22T11:30:00Z",
      "updated_at": "2026-10-22T11:35:00Z"
    }
  ]
}
```

---

### `POST /api/topologies`
Validates and persists a new network topology into the SQLite database.

**Request:**
- Method: `POST`
- Body:
```json
{
  "name": "Classroom Star LAN",
  "description": "Lab LAN layout",
  "devices": [
    { "id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 150 },
    { "id": "sw1", "type": "Switch", "name": "Core-Switch", "x": 300, "y": 150 }
  ],
  "connections": [
    { "id": "c1", "from": "pc1", "to": "sw1" }
  ]
}
```

**Response `201 Created`:**
```json
{
  "success": true,
  "id": 1,
  "name": "Classroom Star LAN",
  "message": "Topology 'Classroom Star LAN' saved successfully with ID 1."
}
```

**Error Response `400 Bad Request`:**
```json
{
  "success": false,
  "error": "Device 'pc1' ID exceeds maximum allowed length of 64 characters."
}
```

---

### `GET /api/topologies/<id>`
Retrieves a single saved topology by ID, including its full device and connection lists.

**Request:**
- Method: `GET`
- URL Parameter: `id` (integer)

**Response `200 OK`:**
```json
{
  "success": true,
  "topology": {
    "id": 1,
    "name": "Classroom Star LAN",
    "description": "Lab LAN layout",
    "device_count": 2,
    "connection_count": 1,
    "topology_data": {
      "devices": [
        { "id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 150 },
        { "id": "sw1", "type": "Switch", "name": "Core-Switch", "x": 300, "y": 150 }
      ],
      "connections": [
        { "id": "c1", "from": "pc1", "to": "sw1", "status": "active" }
      ]
    },
    "created_at": "2026-10-22T11:30:00Z",
    "updated_at": "2026-10-22T11:35:00Z"
  }
}
```

**Error Response `404 Not Found`:**
```json
{
  "success": false,
  "error": "Topology with ID 999 not found."
}
```

---

### `PUT /api/topologies/<id>`
Updates an existing saved topology in SQLite.

**Request:**
- Method: `PUT`
- URL Parameter: `id` (integer)
- Body: Same JSON structure as `POST /api/topologies`

**Response `200 OK`:**
```json
{
  "success": true,
  "message": "Topology 'Classroom Star LAN' (ID: 1) updated successfully."
}
```

---

### `DELETE /api/topologies/<id>`
Deletes a saved topology by its ID.

**Request:**
- Method: `DELETE`
- URL Parameter: `id` (integer)

**Response `200 OK`:**
```json
{
  "success": true,
  "message": "Topology with ID 1 was deleted successfully."
}
```

---

### `GET /api/topology/export/<id>`
Exports a saved topology as an exchangeable JSON payload with schema version metadata.

**Request:**
- Method: `GET`
- URL Parameter: `id` (integer)

**Response `200 OK`:**
```json
{
  "schema_version": "1.0",
  "generator": "NetSim - Interactive Computer Network Topology Simulator",
  "exported_at": "2026-10-22T11:50:00.000000Z",
  "topology": {
    "name": "Classroom Star LAN",
    "description": "Lab LAN layout",
    "devices": [...],
    "connections": [...]
  }
}
```

---

## 3. Network Graph Algorithms Endpoints

### `POST /api/analyze/connectivity`
Analyzes overall network connectivity and optionally performs Breadth-First Search (BFS) from a specified root device.

**Request:**
- Method: `POST`
- Body:
```json
{
  "devices": [
    { "id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100 },
    { "id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100 },
    { "id": "pc2", "type": "Computer", "name": "PC-2", "x": 300, "y": 100 }
  ],
  "connections": [
    { "id": "c1", "from": "pc1", "to": "sw1" },
    { "id": "c2", "from": "sw1", "to": "pc2" }
  ],
  "start_device_id": "pc1"
}
```

**Response `200 OK`:**
```json
{
  "success": true,
  "connectivity": {
    "is_connected": true,
    "status": "Fully Connected",
    "component_count": 1,
    "components": [
      {
        "component_index": 1,
        "device_ids": ["pc1", "pc2", "sw1"],
        "device_names": ["PC-1", "PC-2", "SW-1"],
        "size": 3
      }
    ],
    "explanation": "The network is fully connected. Every device can reach every other device (Acyclic Tree / Loop-Free)."
  },
  "bfs": {
    "start_device_id": "pc1",
    "start_device_name": "PC-1",
    "reachable_count": 3,
    "unreachable_count": 0,
    "visited": ["pc1", "sw1", "pc2"],
    "distances": {
      "pc1": 0,
      "sw1": 1,
      "pc2": 2
    },
    "unreachable": []
  }
}
```

---

### `POST /api/analyze/shortest-path`
Computes the minimal-hop unweighted path between source and destination devices using BFS.

**Request:**
- Method: `POST`
- Body:
```json
{
  "devices": [...],
  "connections": [...],
  "source_id": "pc1",
  "target_id": "pc2"
}
```

**Response `200 OK` (Path Found):**
```json
{
  "success": true,
  "result": {
    "found": true,
    "hops": 2,
    "path_ids": ["pc1", "sw1", "pc2"],
    "path_devices": [
      { "id": "pc1", "type": "Computer", "name": "PC-1", "x": 100, "y": 100 },
      { "id": "sw1", "type": "Switch", "name": "SW-1", "x": 200, "y": 100 },
      { "id": "pc2", "type": "Computer", "name": "PC-2", "x": 300, "y": 100 }
    ],
    "connection_ids": ["c1", "c2"],
    "explanation": "Path found in 2 hop(s): PC-1 -> SW-1 -> PC-2. Note: This shortest path represents an abstract graph traversal and does not model packet queueing, link bandwidth, or dynamic routing protocols."
  }
}
```

**Response `200 OK` (No Path Exists):**
```json
{
  "success": true,
  "result": {
    "found": false,
    "hops": -1,
    "path_ids": [],
    "path_devices": [],
    "connection_ids": [],
    "explanation": "No network path exists between PC-1 and Host-X. They belong to disconnected components."
  }
}
```

---

### `POST /api/analyze/summary`
Calculates comprehensive academic statistics for the network topology.

**Request:**
- Method: `POST`
- Body: `{ "devices": [...], "connections": [...] }`

**Response `200 OK`:**
```json
{
  "success": true,
  "summary": {
    "total_devices": 6,
    "total_connections": 5,
    "computers": 5,
    "switches": 1,
    "routers": 0,
    "connectivity": {
      "is_connected": true,
      "status": "Fully Connected",
      "component_count": 1,
      "explanation": "..."
    },
    "degrees": {
      "sw_center": 5,
      "pc_1": 1,
      "pc_2": 1,
      "pc_3": 1,
      "pc_4": 1,
      "pc_5": 1
    },
    "average_degree": 1.67,
    "density": 0.3333,
    "isolated_devices": [],
    "isolated_count": 0,
    "insights": [
      "Full connectivity achieved: All hosts have end-to-end communication paths."
    ]
  }
}
```
