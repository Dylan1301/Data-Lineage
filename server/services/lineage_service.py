"""
Lineage service layer.

Orchestrates lineage parsing and serialisation.
No HTTP or request-object knowledge — takes and returns plain Python values.
"""

import logging
from typing import Optional

from lineage import LineageMap, LineageException
from lineage.serializers import to_react_flow

logger = logging.getLogger(__name__)


def visualize(
    lineage_map: LineageMap,
    sql: Optional[str] = None,
    file_name: Optional[str] = None,
) -> dict:
    """
    Parse SQL (if provided) and return the current lineage graph
    in React Flow format.

    When both *sql* and *file_name* are supplied the file's previous
    lineage is cleared first so the graph always reflects the latest
    SQL for that file.  This is done atomically (single call) to avoid
    orphaning shared table nodes.

    :param lineage_map: The lineage graph instance
    :param sql: SQL to parse, or None to return current state
    :param file_name: File to associate with the parsed SQL
    :return: React Flow-compatible dict with 'nodes' and 'edges'
    """
    if sql:
        # Clear the file's old data before re-parsing so we always
        # reflect the latest SQL without duplicating nodes.
        if file_name:
            lineage_map.clear_file(file_name)
        lineage_map.parse_sql(sql, file_name=file_name)

    return to_react_flow(lineage_map.table_node_map)


def clear(lineage_map: LineageMap) -> None:
    """Clear all lineage state."""
    lineage_map.clear()


def clear_file(lineage_map: LineageMap, file_name: str) -> None:
    """Clear lineage state for a specific file."""
    lineage_map.clear_file(file_name)
