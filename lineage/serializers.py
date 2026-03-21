import json
import logging
from typing import Dict, Optional
from lineage.models.nodes import ColumnNode, TableNode, TableNodeType
import pickle

logger = logging.getLogger(__name__)

def to_react_flow(table_node_map: Dict[str, TableNode]) -> Dict:
    """
    Export the lineage graph to a JSON-serializable dictionary format
    compatible with React Flow.

    :return: Dictionary containing 'nodes' and 'edges' lists.
    """
    nodes = []
    edges = []

    def get_node_id(name: str) -> str:
        return name

    def get_col_id(table_name: str, col_name: str) -> str:
        return f"{table_name}::{col_name}"

    # ── Build nodes ──────────────────────────────────────────────────
    for table_name, table_node in table_node_map.items():
        columns = [
            {"id": get_col_id(table_name, col_name), "name": col_name, "type": "column"}
            for col_name in table_node.columns
        ]

        nodes.append({
            "id": get_node_id(table_name),
            "type": "tableNode",
            "data": {
                "label": table_name,
                "columns": columns,
                "schema": table_node.schema,
                "file_name": next(iter(table_node.file_names), None),
                "table_node_type": table_node.table_node_type,
                "is_first": table_node.is_first,
            },
            "position": {"x": 0, "y": 0},  # Layout handled by frontend (Dagre)
        })

    # ── Build edges ──────────────────────────────────────────────────
    edge_set: set[str] = set()

    for table_name, table_node in table_node_map.items():
        target_id = get_node_id(table_name)

        # Table-level edges
        for source in table_node.downstream:
            source_id = get_node_id(source.name)
            edge_key = f"{target_id}->{source_id}"
            if edge_key not in edge_set:
                edges.append({
                    "id": edge_key,
                    "source": target_id,
                    "target": source_id,
                    "edge_type": "table_edge",
                    "animated": True,
                    "style": {"stroke": "#b1b1b7"},
                })
                edge_set.add(edge_key)

        # Column-level edges
        for col_name, col_node in table_node.columns.items():
            target_handle_id = get_col_id(table_name, col_name)

            for upstream in col_node.upstream:
                if upstream.table:
                    source_table_name = upstream.table.name
                    source_col_name = upstream.name

                    source_id = get_node_id(source_table_name)
                    source_handle_id = get_col_id(source_table_name, source_col_name)

                    edge_key = f"{source_handle_id}->{target_handle_id}"

                    if edge_key not in edge_set:
                        edges.append({
                            "id": edge_key,
                            "source": source_id,
                            "target": target_id,
                            "edge_type": "column_edge",
                            "sourceHandle": source_handle_id,
                            "targetHandle": target_handle_id,
                            "animated": True,
                            "style": {"stroke": "#555555", "strokeWidth": 2},
                        })
                        edge_set.add(edge_key)

    return {"nodes": nodes, "edges": edges}

def to_graphviz(table_node_map: Dict[str, TableNode], show_table_edges: bool = True, show_column_edges: bool = True):
    try:
        from graphviz import Digraph
    except ImportError:
        logger.error("graphviz not installed. Install with: pip install graphviz")
        return None

    dot = Digraph(
        comment='SQL Lineage',
        graph_attr={'rankdir': 'LR', 'nodesep': '0.5', 'ranksep': '1.5'}
    )
    dot.attr('node', shape='none')

    # Create table nodes with columns
    for table_name, table_node in table_node_map.items():
        rows = f'<tr><td bgcolor="lightblue" border="1"><b>{table_name}</b></td></tr>'

        for col_name in table_node.columns:
            rows += f'<tr><td port="{col_name}" border="1" align="left">{col_name}</td></tr>'

        label = f'<<table border="0" cellborder="1" cellspacing="0">{rows}</table>>'
        dot.node(table_name, label)

    # Create lineage edges
    for table_name, table_node in table_node_map.items():
        # Table-level edges
        if show_table_edges:
            for source in table_node.sources.values():
                dot.edge(source.name, table_name)

        # Column-level edges
        if show_column_edges:
            for col_name, col_node in table_node.columns.items():
                for upstream in col_node.upstream:
                    if upstream.table:
                        dot.edge(
                            f"{upstream.table.name}:{upstream.name}",
                            f"{table_name}:{col_name}",
                            color="blue"
                        )

    return dot

# ── JSON session serialization ────────────────────────────────────────────────
#
# Replaces pickle for Redis session storage. Serializes only the persistent
# graph state (table_node_map, _file_node_map, _temp_count). Circular object
# references (upstream/downstream) are broken down to name strings and
# reconstructed on load via a two-pass deserializer.
#
# Column refs are stored as "table_name::col_name" strings.
# Table upstream/downstream are stored as plain name lists.


def _col_ref(col: ColumnNode) -> Optional[str]:
    """Return a stable string key for a column: 'table_name::col_name'."""
    if col.table is None:
        return None
    return f"{col.table.name}::{col.name}"


def to_session_json(lineage_map) -> str:
    """
    Serialise a LineageMap to a JSON string suitable for Redis storage.

    Only persistent graph state is serialised:
      - table_node_map
      - _file_node_map  (as {file_name: [node_name, ...]})
      - _temp_count

    Circular object references are replaced with name strings so the
    result is safe to store and is not coupled to the Python class layout.
    """
    nodes_data = {}

    for name, node in lineage_map.table_node_map.items():
        columns_data = {}
        for col_name, col in node.columns.items():
            columns_data[col_name] = {
                "name": col.name,
                "alias": col.alias,
                "index": col.index,
                "column_sources": col.column_sources,
                "table_identifier": col.table_identifier,
                # upstream/downstream stored as "table::col" refs
                "upstream_refs": [r for r in (_col_ref(c) for c in col.upstream) if r],
                "downstream_refs": [r for r in (_col_ref(c) for c in col.downstream) if r],
            }

        # col_mappings: {source_alias: [[src_col_name, target_col_name], ...]}
        # The ColumnNode reference is replaced with just the column name string.
        col_mappings_data = {}
        for source_alias, mappings in node.col_mappings.items():
            col_mappings_data[source_alias] = [
                [src_col_name, target_col.name]
                for src_col_name, target_col in mappings
            ]

        nodes_data[name] = {
            "name": node.name,
            "schema": node.schema,
            "table_node_type": node.table_node_type.value,
            "file_names": list(node.file_names),
            "is_first": node.is_first,
            # sources: {alias: node_name}
            "sources": {alias: src.name for alias, src in node.sources.items()},
            "col_mappings": col_mappings_data,
            # edges as name lists
            "upstream_names": [n.name for n in node.upstream],
            "downstream_names": [n.name for n in node.downstream],
            "columns": columns_data,
        }

    file_node_map_data = {
        file_name: [n.name for n in nodes]
        for file_name, nodes in lineage_map._file_node_map.items()
    }

    payload = {
        "table_node_map": nodes_data,
        "_file_node_map": file_node_map_data,
        "_temp_count": lineage_map._temp_count,
    }

    return json.dumps(payload)


def from_session_json(data: str):
    """
    Deserialise a LineageMap from a JSON string produced by ``to_session_json``.

    Uses a two-pass approach:
      Pass 1 — instantiate all TableNode and ColumnNode objects (no edges yet).
      Pass 2 — resolve name/ref strings back into object references.

    Returns ``None`` if the data is malformed, so the caller can create a
    fresh session rather than crashing.
    """
    from lineage.parser.lineage_map import LineageMap  # local import to avoid circular

    try:
        payload = json.loads(data)
    except (json.JSONDecodeError, TypeError) as e:
        logger.warning("Failed to parse session JSON: %s", e)
        return None

    try:
        nodes_raw = payload["table_node_map"]
        file_node_map_raw = payload["_file_node_map"]
        temp_count = payload["_temp_count"]
    except KeyError as e:
        logger.warning("Session JSON missing key: %s", e)
        return None

    lineage_map = LineageMap()
    lineage_map._temp_count = temp_count

    # ── Pass 1: Build all TableNode and ColumnNode objects ────────────────────
    for name, node_data in nodes_raw.items():
        try:
            node_type = TableNodeType(node_data["table_node_type"])
        except ValueError:
            node_type = TableNodeType.query

        node = TableNode(
            name=node_data["name"],
            schema=node_data.get("schema"),
            table_node_type=node_type,
        )
        node.file_names = set(node_data.get("file_names", []))
        node.is_first = node_data.get("is_first", False)

        for col_name, col_data in node_data.get("columns", {}).items():
            col = ColumnNode(
                name=col_data["name"],
                alias=col_data.get("alias"),
                index=col_data.get("index"),
                column_sources=col_data.get("column_sources", []),
                table_identifier=col_data.get("table_identifier"),
            )
            node.add_column(col)

        lineage_map.table_node_map[name] = node

    # ── Pass 2: Wire all edges ────────────────────────────────────────────────
    for name, node_data in nodes_raw.items():
        node = lineage_map.table_node_map[name]

        # Table-level upstream / downstream
        for upstream_name in node_data.get("upstream_names", []):
            if upstream_name in lineage_map.table_node_map:
                upstream_node = lineage_map.table_node_map[upstream_name]
                if upstream_node not in node.upstream:
                    node.upstream.append(upstream_node)

        for downstream_name in node_data.get("downstream_names", []):
            if downstream_name in lineage_map.table_node_map:
                downstream_node = lineage_map.table_node_map[downstream_name]
                if downstream_node not in node.downstream:
                    node.downstream.append(downstream_node)

        # sources dict
        for alias, src_name in node_data.get("sources", {}).items():
            if src_name in lineage_map.table_node_map:
                node.sources[alias] = lineage_map.table_node_map[src_name]

        # col_mappings: rebuild with ColumnNode references
        for source_alias, mappings in node_data.get("col_mappings", {}).items():
            node.col_mappings[source_alias] = []
            for src_col_name, target_col_name in mappings:
                if target_col_name in node.columns:
                    node.col_mappings[source_alias].append(
                        (src_col_name, node.columns[target_col_name])
                    )

        # Column-level upstream / downstream via "table::col" refs
        for col_name, col_data in node_data.get("columns", {}).items():
            col = node.columns.get(col_name)
            if col is None:
                continue

            for ref in col_data.get("upstream_refs", []):
                parts = ref.split("::", 1)
                if len(parts) == 2:
                    ref_table = lineage_map.table_node_map.get(parts[0])
                    if ref_table and parts[1] in ref_table.columns:
                        upstream_col = ref_table.columns[parts[1]]
                        if upstream_col not in col.upstream:
                            col.upstream.append(upstream_col)

            for ref in col_data.get("downstream_refs", []):
                parts = ref.split("::", 1)
                if len(parts) == 2:
                    ref_table = lineage_map.table_node_map.get(parts[0])
                    if ref_table and parts[1] in ref_table.columns:
                        downstream_col = ref_table.columns[parts[1]]
                        if downstream_col not in col.downstream:
                            col.downstream.append(downstream_col)

    # ── Rebuild _file_node_map ────────────────────────────────────────────────
    for file_name, node_names in file_node_map_raw.items():
        for node_name in node_names:
            if node_name in lineage_map.table_node_map:
                lineage_map._file_node_map[file_name].append(
                    lineage_map.table_node_map[node_name]
                )

    return lineage_map


def to_pickle(obj) -> bytes:
    """
    Serialise an object (typically a LineageMap or table_node_map) to bytes.

    .. warning:: Pickle is not safe for untrusted data. Only use in trusted
       environments where Redis is secured.
    """
    return pickle.dumps(obj)


def from_pickle(data: bytes):
    """
    Deserialise bytes produced by ``to_pickle``.

    Returns ``None`` if the data is corrupted or incompatible, rather than
    raising — the caller should create a fresh session in that case.
    """
    try:
        return pickle.loads(data)
    except (pickle.UnpicklingError, EOFError, AttributeError, ImportError) as e:
        logger.warning("Failed to unpickle session data: %s", e)
        return None
