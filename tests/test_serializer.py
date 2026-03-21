"""
Serializer tests — verify to_session_json / from_session_json roundtrips.
"""

import pytest
from lineage.parser.lineage_map import LineageMap
from lineage.serializers import to_session_json, from_session_json


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_roundtrip_simple_graph():
    """Serialize then deserialize — table nodes and structure are identical."""
    lm = LineageMap()
    lm.parse_sql(
        "SELECT customer_id, total FROM orders",
        file_name="q1",
    )

    json_str = to_session_json(lm)
    restored = from_session_json(json_str)

    assert restored is not None
    assert set(restored.table_node_map.keys()) == set(lm.table_node_map.keys())
    assert "orders" in restored.table_node_map
    assert restored._temp_count == lm._temp_count


def test_roundtrip_column_edges():
    """Column wiring (upstream/downstream) survives the JSON roundtrip."""
    lm = LineageMap()
    lm.parse_sql(
        """
        WITH base AS (SELECT customer_id FROM orders)
        SELECT customer_id FROM base
        """,
        file_name="q1",
    )

    json_str = to_session_json(lm)
    restored = from_session_json(json_str)

    assert restored is not None

    # CTE node is named "{scope}.base"
    cte_name = next(
        (name for name in restored.table_node_map if name.endswith(".base")), None
    )
    assert cte_name is not None, f"CTE node not found in {list(restored.table_node_map.keys())}"

    cte = restored.table_node_map[cte_name]
    assert "customer_id" in cte.columns

    # The wiring: cte.customer_id.upstream should contain the outer query's col
    cte_col = cte.columns["customer_id"]
    wired_targets = {(c.table.name, c.name) for c in cte_col.upstream if c.table}
    assert ("Query_1", "customer_id") in wired_targets


def test_roundtrip_multi_file():
    """_file_node_map entries survive the JSON roundtrip."""
    lm = LineageMap()
    lm.parse_sql("SELECT customer_id FROM orders", file_name="file_a")
    lm.parse_sql("SELECT order_id FROM invoices", file_name="file_b")

    json_str = to_session_json(lm)
    restored = from_session_json(json_str)

    assert restored is not None
    assert "file_a" in restored._file_node_map
    assert "file_b" in restored._file_node_map

    file_a_names = {n.name for n in restored._file_node_map["file_a"]}
    file_b_names = {n.name for n in restored._file_node_map["file_b"]}

    assert "orders" in file_a_names
    assert "invoices" in file_b_names
