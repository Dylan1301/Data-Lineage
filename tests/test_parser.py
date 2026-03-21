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


# ── INSERT then CREATE TABLE on the same target table ─────────────────────────
#
# Scenario: a file (or sequential parse calls) first populates a table via
# INSERT ... SELECT, then (re-)defines the same table with CREATE TABLE AS SELECT.
# Both statements share the same target: sales_mart.sales
#
# Two bugs are exposed:
#
# Bug 1 — Spurious table edge
#   extend_table iterates old_node.downstream (= the INSERT scope) and calls
#   insert_scope.add_upstream(create_node), which also appends insert_scope into
#   create_node.downstream.  The CREATE TABLE node ends up listing the INSERT
#   scope as one of its *sources*, which is wrong.
#
# Bug 2 — Column lineage severed
#   extend_table calls old_col.detach() on every column of the old INSERT-target
#   node. detach() removes old_col from insert_scope_col.upstream, breaking the
#   INSERT column chain. extend_table never re-wires those edges to the new node's
#   columns, so all INSERT column lineage silently disappears.

INSERT_SQL = """
    INSERT INTO sales_mart.sales (sale_id, sale_date, store_id, product_id, quantity, amount)
    SELECT
        s.sale_id,
        s.sale_date,
        s.store_id,
        s.product_id,
        s.quantity,
        s.amount
    FROM sales_staging.sales s
    WHERE s.sale_date >= '2025-01-01'
"""

CREATE_SQL = """
    CREATE TABLE sales_mart.sales AS
    SELECT sale_id, sale_date, store_id, product_id, quantity, amount
    FROM sales_staging.sales
    WHERE sale_date >= '2025-01-01'
"""


def _build_insert_then_create(file_name="test") -> LineageMap:
    """Parse INSERT followed by CREATE TABLE on the same target table."""
    lm = LineageMap()
    lm.parse_sql_file(INSERT_SQL + ";\n" + CREATE_SQL, file_name=file_name)
    return lm


def test_insert_then_create_nodes_exist():
    """Both the target and staging table nodes must survive both statements."""
    lm = _build_insert_then_create()

    assert "sales_mart.sales" in lm.table_node_map, "target table missing from graph"
    assert "sales_staging.sales" in lm.table_node_map, "staging table missing from graph"


def test_insert_then_create_target_has_columns():
    """The final sales_mart.sales node must carry all six columns from the CREATE."""
    lm = _build_insert_then_create()

    node = lm.table_node_map["sales_mart.sales"]
    expected = {"sale_id", "sale_date", "store_id", "product_id", "quantity", "amount"}
    assert expected == set(node.columns.keys()), (
        f"Expected columns {expected}, got {set(node.columns.keys())}"
    )


def test_insert_then_create_correct_source():
    """
    BUG 1 (table-level) — the CREATE TABLE node's only source must be
    sales_staging.sales.  Before the fix, the INSERT scope is also listed as a
    source, which is wrong.
    """
    lm = _build_insert_then_create()

    target = lm.table_node_map["sales_mart.sales"]
    downstream_names = {n.name for n in target.downstream}

    assert "sales_staging.sales" in downstream_names, (
        "sales_staging.sales should be a source of the CREATE TABLE node"
    )

    # The INSERT scope must NOT appear as a source of the CREATE TABLE node.
    insert_scopes = [n for n in target.downstream if "Insert" in n.name or "Scope" in n.name]
    assert insert_scopes == [], (
        f"Spurious source(s) attached to sales_mart.sales: {[n.name for n in insert_scopes]}"
    )


def _find_insert_scope(lm: LineageMap):
    """Return the INSERT scope node (its name contains 'Insert')."""
    return next(
        (node for name, node in lm.table_node_map.items() if "Insert" in name),
        None,
    )


def test_insert_then_create_insert_scope_still_in_graph():
    """
    The INSERT scope node must still exist in the graph after the CREATE replaces
    the target — it represents a real data-flow step that should be preserved.
    """
    lm = _build_insert_then_create()

    insert_scope = _find_insert_scope(lm)
    assert insert_scope is not None, "INSERT scope node was removed from the graph"

    # The INSERT scope's only table-level source must be sales_staging.sales
    scope_source_names = {n.name for n in insert_scope.downstream}
    assert "sales_staging.sales" in scope_source_names, (
        "INSERT scope lost its link to sales_staging.sales"
    )


def test_insert_then_create_insert_scope_not_source_of_create():
    """
    BUG 1 (cross-check) — the INSERT scope must not appear in the sources dict
    of the final sales_mart.sales node.
    """
    lm = _build_insert_then_create()

    target = lm.table_node_map["sales_mart.sales"]
    for source_name, source_node in target.sources.items():
        assert "Insert" not in source_name and "Scope" not in source_name, (
            f"INSERT scope '{source_name}' found in sales_mart.sales.sources — spurious edge"
        )


def test_insert_then_create_column_lineage_not_severed():
    """
    BUG 2 (column-level) — INSERT scope columns must retain their upstream wiring
    after extend_table replaces the target node.

    Before the fix, extend_table calls old_col.detach() which removes the edge
    from insert_scope.sale_id.upstream, leaving every INSERT scope column with an
    empty upstream list.  The correct behaviour is that each column retains at
    least one upstream connection (to the corresponding column on sales_mart.sales).
    """
    lm = _build_insert_then_create()

    insert_scope = _find_insert_scope(lm)
    assert insert_scope is not None, "INSERT scope node not found"

    severed = [
        col_name
        for col_name, col in insert_scope.columns.items()
        if not col.upstream
    ]
    assert severed == [], (
        f"Column lineage severed for INSERT scope columns: {severed}. "
        "extend_table must re-wire old-target columns to new-target columns."
    )


def test_insert_then_create_column_lineage_points_to_new_target():
    """
    BUG 2 (column-level, stronger) — each INSERT scope column's upstream must
    point to the *new* sales_mart.sales node (the CREATE TABLE), not a detached
    old node.
    """
    lm = _build_insert_then_create()

    target = lm.table_node_map["sales_mart.sales"]
    insert_scope = _find_insert_scope(lm)
    assert insert_scope is not None, "INSERT scope node not found"

    for col_name, col in insert_scope.columns.items():
        upstream_tables = {u.table for u in col.upstream if u.table}
        assert target in upstream_tables, (
            f"INSERT scope column '{col_name}' does not point to the new "
            f"sales_mart.sales node. Upstream tables: "
            f"{[t.name for t in upstream_tables]}"
        )


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
