"""
Parser tests — verify column-level lineage wiring for core SQL patterns.
"""

import pytest
from lineage.parser.lineage_map import LineageMap
from lineage.models.nodes import TableNodeType


# ── Helpers ──────────────────────────────────────────────────────────────────

def find_node_ending_with(lm: LineageMap, suffix: str):
    """Return the first table node whose name ends with the given suffix."""
    return next(
        (node for name, node in lm.table_node_map.items() if name.endswith(suffix)),
        None,
    )


def col_wired_targets(lm: LineageMap, table_name: str, col_name: str):
    """
    Return set of (table_name, col_name) tuples that the given source column
    is wired to. In this codebase, source_col.upstream holds the output columns
    that were derived from it, so this captures the wiring direction stored
    by _connect_column_lineage.
    """
    node = lm.table_node_map[table_name]
    c = node.columns[col_name]
    return {(u.table.name, u.name) for u in c.upstream if u.table}


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_select_simple_column_lineage():
    """SELECT col FROM CTE — column edge wired from CTE to output scope."""
    lm = LineageMap()
    lm.parse_sql(
        "WITH src AS (SELECT customer_id FROM raw) SELECT customer_id FROM src",
        file_name="test",
    )

    # Outer query node
    outer = lm.table_node_map.get("Query_1")
    assert outer is not None
    assert "customer_id" in outer.columns

    # CTE node is named "{parent_scope}.src"
    cte = find_node_ending_with(lm, ".src")
    assert cte is not None
    assert "customer_id" in cte.columns

    # Column edge: CTE's customer_id is wired to the outer query's customer_id
    wired = col_wired_targets(lm, cte.name, "customer_id")
    assert ("Query_1", "customer_id") in wired


def test_select_join_columns():
    """JOIN — columns from each joined CTE are wired to the output."""
    lm = LineageMap()
    lm.parse_sql(
        """
        WITH ord AS (SELECT customer_id, order_id FROM raw_orders),
             inv AS (SELECT order_id, amount FROM raw_invoices)
        SELECT o.customer_id, i.amount
        FROM ord AS o
        JOIN inv AS i ON o.order_id = i.order_id
        """,
        file_name="test",
    )

    outer = lm.table_node_map.get("Query_1")
    assert outer is not None
    assert "customer_id" in outer.columns
    assert "amount" in outer.columns

    ord_node = find_node_ending_with(lm, ".ord")
    inv_node = find_node_ending_with(lm, ".inv")
    assert ord_node is not None
    assert inv_node is not None

    # customer_id flows from ord CTE to the outer query
    assert ("Query_1", "customer_id") in col_wired_targets(lm, ord_node.name, "customer_id")
    # amount flows from inv CTE to the outer query
    assert ("Query_1", "amount") in col_wired_targets(lm, inv_node.name, "amount")


def test_select_subquery():
    """Subquery scope becomes an intermediate node under the parent scope name."""
    lm = LineageMap()
    lm.parse_sql(
        """
        SELECT customer_id
        FROM (SELECT customer_id FROM orders) AS sub
        """,
        file_name="test",
    )

    # Subquery is registered as "{parent}.sub", not just "sub"
    sub_node = find_node_ending_with(lm, ".sub")
    assert sub_node is not None
    assert "customer_id" in sub_node.columns

    # orders base table is also present
    assert "orders" in lm.table_node_map


def test_select_cte():
    """CTE creates a named intermediate node with parent-scoped name."""
    lm = LineageMap()
    lm.parse_sql(
        """
        WITH base AS (
            SELECT customer_id FROM orders
        )
        SELECT customer_id FROM base
        """,
        file_name="test",
    )

    assert "orders" in lm.table_node_map

    # CTE is named "{parent_scope}.base", not just "base"
    base_node = find_node_ending_with(lm, ".base")
    assert base_node is not None
    assert "customer_id" in base_node.columns

    # Outer query node has customer_id column
    outer = lm.table_node_map.get("Query_1")
    assert outer is not None
    assert "customer_id" in outer.columns

    # Column edge: base.customer_id is wired to the outer query
    wired = col_wired_targets(lm, base_node.name, "customer_id")
    assert ("Query_1", "customer_id") in wired


def test_union_column_index_mapping():
    """UNION inside a scope maps columns by ordinal index to the parent node."""
    lm = LineageMap()
    lm.parse_sql(
        """
        WITH combined AS (
            SELECT order_id, total FROM orders_2023
            UNION ALL
            SELECT order_id, total FROM orders_2024
        )
        SELECT order_id, total FROM combined
        """,
        file_name="test",
    )

    # Both union branch source tables must exist
    assert "orders_2023" in lm.table_node_map
    assert "orders_2024" in lm.table_node_map

    # The combined CTE node exists and has the unioned columns
    combined = find_node_ending_with(lm, ".combined")
    assert combined is not None
    assert len(combined.columns) == 2


def test_insert_select_explicit_columns():
    """INSERT INTO t (a, b) SELECT x, y — no duplicate column edges."""
    lm = LineageMap()
    lm.parse_sql(
        """
        INSERT INTO target (customer_id, total)
        SELECT customer_id, amount FROM source
        """,
        file_name="test",
    )

    assert "target" in lm.table_node_map
    assert "source" in lm.table_node_map

    target = lm.table_node_map["target"]
    assert "customer_id" in target.columns
    assert "total" in target.columns

    # No duplicate upstream edges on customer_id
    col = target.columns["customer_id"]
    upstream_keys = [(u.table.name, u.name) for u in col.upstream if u.table]
    assert len(upstream_keys) == len(set(upstream_keys)), "Duplicate upstream edges found"


def test_create_table_as_select():
    """CTAS — target node is created with columns from the SELECT output."""
    lm = LineageMap()
    lm.parse_sql(
        "CREATE TABLE summary AS SELECT customer_id, total FROM orders",
        file_name="test",
    )

    assert "summary" in lm.table_node_map
    summary = lm.table_node_map["summary"]

    # CTAS inherits table_node_type=table from the CREATE TABLE parser
    assert summary.table_node_type == TableNodeType.table

    # Columns are populated from the SELECT projection
    assert "customer_id" in summary.columns
    assert "total" in summary.columns


def test_clear_file_preserves_shared_table():
    """Two files share a base table; clearing one file leaves the table intact."""
    lm = LineageMap()
    lm.parse_sql("SELECT customer_id FROM orders", file_name="file_a")
    lm.parse_sql("SELECT order_id FROM orders", file_name="file_b")

    # orders is referenced by both files
    assert "orders" in lm.table_node_map

    lm.clear_file("file_a")

    # orders must still exist because file_b references it
    assert "orders" in lm.table_node_map
