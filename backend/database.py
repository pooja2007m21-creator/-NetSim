"""
NetSim Database Module
Provides SQLite persistence for saved network topologies using parameterized SQL.
"""

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def get_connection(db_path: str) -> sqlite3.Connection:
    """Create and return a configured SQLite connection."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_db_cursor(db_path: str):
    """Context manager for SQLite database operations with automatic commit/rollback."""
    conn = get_connection(db_path)
    cursor = conn.cursor()
    try:
        yield cursor
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db(db_path: str) -> None:
    """Initialize database tables if they do not already exist."""
    schema = """
    CREATE TABLE IF NOT EXISTS topologies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        device_count INTEGER NOT NULL DEFAULT 0,
        connection_count INTEGER NOT NULL DEFAULT 0,
        topology_data TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_topologies_updated_at ON topologies (updated_at);
    """
    with get_db_cursor(db_path) as cursor:
        cursor.executescript(schema)


def save_topology(
    db_path: str,
    name: str,
    description: str,
    topology_data: Dict[str, Any],
    device_count: int,
    connection_count: int,
) -> int:
    """
    Persist a new topology to the database.
    Returns the newly created topology ID.
    """
    now = datetime.now(timezone.utc).isoformat()
    serialized_data = json.dumps(topology_data)

    query = """
    INSERT INTO topologies (name, description, device_count, connection_count, topology_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """
    with get_db_cursor(db_path) as cursor:
        cursor.execute(
            query,
            (name, description, device_count, connection_count, serialized_data, now, now),
        )
        return cursor.lastrowid


def get_all_topologies(db_path: str) -> List[Dict[str, Any]]:
    """Retrieve metadata for all saved topologies, sorted by most recently updated."""
    query = """
    SELECT id, name, description, device_count, connection_count, created_at, updated_at
    FROM topologies
    ORDER BY updated_at DESC
    """
    with get_db_cursor(db_path) as cursor:
        cursor.execute(query)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]


def get_topology_by_id(db_path: str, top_id: int) -> Optional[Dict[str, Any]]:
    """Retrieve a single saved topology by ID, including its parsed topology data."""
    query = """
    SELECT id, name, description, device_count, connection_count, topology_data, created_at, updated_at
    FROM topologies
    WHERE id = ?
    """
    with get_db_cursor(db_path) as cursor:
        cursor.execute(query, (top_id,))
        row = cursor.fetchone()
        if not row:
            return None

        result = dict(row)
        try:
            result["topology_data"] = json.loads(result["topology_data"])
        except (json.JSONDecodeError, TypeError):
            result["topology_data"] = {"devices": [], "connections": []}
        return result


def update_topology(
    db_path: str,
    top_id: int,
    name: str,
    description: str,
    topology_data: Dict[str, Any],
    device_count: int,
    connection_count: int,
) -> bool:
    """Update an existing topology by ID. Returns True if updated, False if not found."""
    now = datetime.now(timezone.utc).isoformat()
    serialized_data = json.dumps(topology_data)

    query = """
    UPDATE topologies
    SET name = ?, description = ?, device_count = ?, connection_count = ?, topology_data = ?, updated_at = ?
    WHERE id = ?
    """
    with get_db_cursor(db_path) as cursor:
        cursor.execute(
            query,
            (name, description, device_count, connection_count, serialized_data, now, top_id),
        )
        return cursor.rowcount > 0


def delete_topology(db_path: str, top_id: int) -> bool:
    """Delete a topology by ID. Returns True if deleted, False if not found."""
    query = "DELETE FROM topologies WHERE id = ?"
    with get_db_cursor(db_path) as cursor:
        cursor.execute(query, (top_id,))
        return cursor.rowcount > 0
