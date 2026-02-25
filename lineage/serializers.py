import logging
from typing import Dict
from lineage.models.nodes import TableNode
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
                "file_name": table_node.file_name,
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

def to_pickle(table_node_map: Dict[str, TableNode]):
    return pickle.dumps(table_node_map)

def from_pickle(data: bytes):
    return pickle.loads(data)
