import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from sqlglot.optimizer.qualify import qualify
from sqlglot.optimizer.scope import Scope, build_scope
from sqlglot import parse_one
from sqlglot import exp

import logging

logger = logging.getLogger(__name__)


# Custom Exceptions
class LineageException(Exception):
    """Base exception for lineage operations"""
    pass


class TableNotFoundException(LineageException):
    """Raised when a table definition cannot be found"""
    pass


class ColumnMismatchException(LineageException):
    """Raised when column mapping fails between tables"""
    pass

class Node:
    """
    Base Node class for Table and Column
    Stores upstream and downstream relationships for lineage tracking
    """
    def __init__(self, name: str):
        self.name = name
        self.upstream: List['Node'] = []
        self.downstream: List['Node'] = []

    def add_downstream(self, node: 'Node') -> None:
        """
        Add a downstream dependency and update bidirectional relationship

        :param node: The downstream node to add
        """
        if node not in self.downstream:
            self.downstream.append(node)
        if self not in node.upstream:
            node.upstream.append(self)

    def add_upstream(self, node: 'Node') -> None:
        """
        Add an upstream dependency and update bidirectional relationship

        :param node: The upstream node to add
        """
        if node not in self.upstream:
            self.upstream.append(node)
        if self not in node.downstream:
            node.downstream.append(self)

    def detach(self) -> None:
        """
        Remove this node from all upstream and downstream relationships
        """
        for node in self.upstream:
            if self in node.downstream:
                node.downstream.remove(self)

        for node in self.downstream:
            if self in node.upstream:
                node.upstream.remove(self)

        self.upstream.clear()
        self.downstream.clear()

class ColumnNode(Node):
    """
    Column node representing a column in a table

    Attributes:
        name: Column name
        table: The table node this column belongs to
        alias: Column alias (if any)
        column_sources: List of source columns as strings (format: "table.column" or "column")
        table_identifier: Table identifier for this column reference
    """
    def __init__(
        self,
        name: str,
        table_identifier: Optional[str] = None,
        alias: Optional[str] = None,
        column_sources: Optional[List[str]] = None,
        index: Optional[int] = None
    ):
        super().__init__(name)
        self.table: Optional['TableNode'] = None
        self.alias = alias
        self.column_sources = column_sources or []
        self.table_identifier = table_identifier
        self.index = index

    def __str__(self) -> str:
        return f"Column({self.name})"

    def get_source_columns(self) -> List[Tuple[Optional[str], str]]:
        """
        Get list of source (table, column) tuples for this column

        :return: List of tuples (table_name, column_name)
        """
        if not self.column_sources:
            table_name = self.table.name if self.table else None
            return [(table_name, self.name)]

        result = []
        for source in self.column_sources:
            if "." in source:
                table, col = source.split(".", 1)
                result.append((table, col))
            else:
                result.append((None, source))
        return result

class TableNode(Node):
    """
    Table node representing a table or subquery

    Attributes:
        name: Table name
        columns: Dictionary mapping column names to ColumnNode objects
        schema: Schema/database name (if any)
        scope: The Scope or Expression this table represents
        sources: Dictionary mapping source table names to TableNode objects
        col_mappings: Mapping of source table -> list of (source_column, target_column) pairs
    """
    def __init__(
        self,
        name: str,
        scope: Optional[Scope | exp.Expression] = None,
        schema: Optional[str] = None
    ):
        super().__init__(name)
        self.columns: Dict[str, ColumnNode] = {}
        self.schema = schema
        self.scope = scope
        self.sources: Dict[str, 'TableNode'] = {}
        self.col_mappings: Dict[str, List[List]] = {}

    def __str__(self) -> str:
        col_names = ", ".join(self.columns.keys())
        return f"Table({self.name}, columns=[{col_names}])"

    def add_column(self, column: ColumnNode) -> None:
        """
        Add a column to this table

        :param column: ColumnNode to add
        """
        self.columns[column.name] = column
        column.table = self

class LineageMap:
    """
    Main class for parsing SQL and building column-level lineage

    Attributes:
        sql_directory: Optional directory path for lazy-loading table definitions
        original_scope: Root scope from the parsed SQL
        visited_scopes: Cache mapping scopes to their TableNode
        table_node_map: Map of table names to TableNode objects
        start_node: The root table node of the lineage
        table_file_cache: Cache mapping table names to SQL file paths
    """
    def __init__(self, sql_directory: Optional[str] = None):
        self.sql_directory = Path(sql_directory) if sql_directory else None
        self.original_scope: Optional[Scope] = None
        self.visited_scopes: Dict[Scope | exp.Expression, TableNode] = {}
        self.table_node_map: Dict[str, TableNode] = {}
        self.start_node: Optional[TableNode] = None
        self._temp_count = 0
        self._table_file_cache: Dict[str, Path] = {}

    def clear(self) -> None:
        """
        Clear all internal state and break circular references
        """
        # Break circular references to prevent memory leaks
        for node in self.table_node_map.values():
            node.upstream.clear()
            node.downstream.clear()
            for col in node.columns.values():
                col.upstream.clear()
                col.downstream.clear()

        self.table_node_map.clear()
        self.visited_scopes.clear()
        self._table_file_cache.clear()
        self.original_scope = None
        self.start_node = None
        self._temp_count = 0

    def parse_sql(self, sql: str) -> None:
        """
        Parse SQL query and build lineage graph

        :param sql: SQL query string to parse
        """
        self.clear()

        ast = qualify(parse_one(sql))
        self.original_scope = build_scope(ast)
        self.start_node = self._parse_scope(self.original_scope)

    def _generate_temp_name(self, prefix: str = "Temp") -> str:
        """
        Generate a unique temporary name for unnamed scopes

        :param prefix: Prefix for the generated name
        :return: Unique temporary name
        """
        self._temp_count += 1
        return f"{prefix}_{self._temp_count}"

    def _parse_column(
        self,
        col: exp.Expression | exp.Column | exp.Alias,
        table: TableNode,
        index: Optional[int] = None
    ) -> ColumnNode:
        """
        Parse a column expression into a ColumnNode

        :param col: Column expression from sqlglot
        :param table: Parent table this column belongs to
        :return: Parsed ColumnNode
        """
        if isinstance(col, exp.Column):
            return ColumnNode(col.name, table_identifier=col.table, alias=col.alias, index=index)

        # Handle alias expressions (e.g., "col1 + col2 AS result")
        alias = col.alias
        column_sources = []
        for c in col.find_all(exp.Column):
            table_prefix = f"{c.table}." if c.table else ""
            column_sources.append(f"{table_prefix}{c.name}")

        return ColumnNode(alias, column_sources=column_sources, index=index)

    def _parse_scope(
        self,
        scope: Scope | exp.Table,
        name: Optional[str] = None
    ) -> TableNode:
        """
        Parse a scope (subquery/CTE) into a TableNode

        :param scope: Scope object from sqlglot
        :param name: Optional name for the scope
        :return: Parsed TableNode
        """
        if scope in self.visited_scopes:
            return self.visited_scopes[scope]

        if not name:
            name = self._generate_temp_name("Scope")

        root = TableNode(name, scope=scope)

        logger.debug(f"Parsing scope {name} in _parse_scope: {scope}")

        self.visited_scopes[scope] = root
        self.table_node_map[name] = root

        if isinstance(scope.expression, exp.Select):
            # Process SELECT columns
            self._process_select_columns(scope, root)

            # Process source tables/subqueries
            self._process_sources(scope, root)

            # Connect column lineage
            self._connect_column_lineage(root)

        if isinstance(scope.expression, exp.Union):
            self._process_select_columns(scope, root)
            self._parse_union(scope, root)

        return root

    def _process_select_columns(self, scope: Scope, table: TableNode) -> None:
        """
        Process SELECT clause columns and build column mappings

        :param scope: The scope being processed
        :param table: The table node to add columns to
        """
        for index, col in enumerate(scope.expression.selects):
            column = self._parse_column(col, table, index)
            table.add_column(column)

            # Build column mappings for lineage connections
            for t_source, c_source in column.get_source_columns():
                source_name = t_source or column.table_identifier
                if source_name:
                    if source_name not in table.col_mappings:
                        table.col_mappings[source_name] = []
                    table.col_mappings[source_name].append([c_source, column])

    def _process_sources(self, scope: Scope, table: TableNode) -> None:
        """
        Process FROM/JOIN source tables and subqueries

        :param scope: The scope being processed
        :param table: The parent table node
        """
        for source_name, source in scope.sources.items():
            if isinstance(source, exp.Table):
                child_table = self._parse_table(source)
                self.visited_scopes[source] = child_table
                self.table_node_map[child_table.name] = child_table
            else:
                child_table = self._parse_scope(source, source_name)

            table.sources[source_name] = child_table
            table.add_downstream(child_table)

    def _parse_union(self, scope: Scope, table: TableNode) -> None:
        # If union scope been visited -> return the node directly

        for union_scope in scope.union_scopes:
            logger.debug(f"Found union scope: {union_scope}")
            child = self._parse_scope(union_scope)

            table.add_downstream(child)
            logger.debug(f"Added union scope {child.name} to {table.name}")
            table.sources[child.name] = child

            # Connect column lineage between union scope and its children if the children is also union
            self._connect_column_lineage_union(table, child)

        return

    def _parse_table(self, table: exp.Table) -> TableNode:
        """
        Parse a table reference into a TableNode (base table without columns)

        :param table: Table expression from sqlglot
        :return: TableNode representing the base table
        """
        if table in self.visited_scopes:
            return self.visited_scopes[table]

        name = table.name
        db = table.db

        if db:
            name = f"{db}.{name}"

        return TableNode(name, scope=table, schema=db)

    def _connect_column_lineage(self, table: TableNode) -> List[str]:
        """
        Connect column-level lineage between table and its sources

        :param table: The table node to connect
        :return: List of error messages (empty if successful)
        """
        errors = []

        for source_name, col_mappings in table.col_mappings.items():
            if source_name not in table.sources:
                error = f"Source table '{source_name}' not found in {table.name}"
                logger.warning(error)
                errors.append(error)
                continue

            source_table = table.sources[source_name]

            for source_col_name, target_col in col_mappings:
                if source_col_name in source_table.columns:
                    source_table.columns[source_col_name].add_upstream(target_col)
                else:
                    error = f"Column '{source_col_name}' not found in table {source_table.name}"
                    logger.debug(error)
                    # Don't add to errors - columns might not be defined yet (lazy loading)

        return errors

    def _connect_column_lineage_union(self, table: TableNode, current_node: TableNode):

        # Check if the current node is a union scope | parent node is union scope anyway
        # if not isinstance(current_node.scope.expression, exp.Union):
        #     return

        # Stupid brute force approach
        # Since it is union -> all the child columns will result in parent column based on index.
        for table_column in table.columns.values():
            for child_column in current_node.columns.values():
                if table_column.index == child_column.index:
                    child_column.add_upstream(table_column)
        return

    def _reconnect_column_lineage(self, table: TableNode, source_name: str) -> None:
        """
        Reconnect column lineage for a specific source after it's been extended

        :param table: The parent table node
        :param source_name: Name of the source table to reconnect
        """
        if source_name not in table.sources:
            logger.warning(f"Source {source_name} not found in table {table.name}")
            return

        if source_name not in table.col_mappings:
            return

        source_table = table.sources[source_name]
        for source_col_name, target_col in table.col_mappings[source_name]:
            if source_col_name in source_table.columns:
                source_table.columns[source_col_name].add_upstream(target_col)
            else:
                logger.warning(
                    f"Column '{source_col_name}' not found in table {source_table.name}"
                )

    def _parse_create_table(self, create: exp.Create) -> Optional[TableNode]:
        """
        Parse CREATE TABLE statement and extract column definitions

        :param create: CREATE expression from sqlglot
        :return: TableNode with columns, or None if invalid
        """
        if create in self.visited_scopes:
            return self.visited_scopes[create]

        table = create.find(exp.Table)
        if not table:
            return None

        root = self._parse_table(table)
        for column in create.find_all(exp.ColumnDef):
            col = ColumnNode(column.name, alias=column.alias)
            root.add_column(col)

        return root

    def _resolve_table_file(self, table_name: str) -> Optional[Path]:
        """
        Find SQL file containing the table definition

        :param table_name: Name of the table to find
        :return: Path to SQL file, or None if not found
        """
        if not self.sql_directory or not self.sql_directory.exists():
            return None

        # Check cache first
        if table_name in self._table_file_cache:
            return self._table_file_cache[table_name]

        # Extract base table name (remove schema prefix if exists)
        base_name = table_name.split(".")[-1]

        # Search patterns
        patterns = [
            f"{base_name}.sql",
            f"{base_name.lower()}.sql",
            f"{base_name.upper()}.sql",
        ]

        # Search in directory and subdirectories
        for pattern in patterns:
            # Direct match in sql_directory
            candidate = self.sql_directory / pattern
            if candidate.exists():
                self._table_file_cache[table_name] = candidate
                return candidate

            # Recursive search
            matches = list(self.sql_directory.rglob(pattern))
            if matches:
                self._table_file_cache[table_name] = matches[0]
                return matches[0]

        return None

    def _load_table_definition(self, table_name: str) -> str:
        """
        Load SQL CREATE statement from file

        :param table_name: Name of the table
        :return: SQL CREATE statement
        :raises TableNotFoundException: If table file not found
        """
        file_path = self._resolve_table_file(table_name)

        if not file_path:
            raise TableNotFoundException(
                f"Could not find SQL file for table '{table_name}' in {self.sql_directory}"
            )

        try:
            return file_path.read_text()
        except Exception as e:
            raise TableNotFoundException(
                f"Error reading table definition for '{table_name}': {e}"
            )

    def extend_table(
        self,
        table_name: str,
        sql: Optional[str] = None
    ) -> TableNode:
        """
        Load table definition with columns and connect to existing lineage

        This method supports lazy loading - either provide SQL directly or let it
        auto-discover the table definition from the sql_directory.

        :param table_name: Name of the table to extend
        :param sql: Optional SQL CREATE statement (if None, auto-load from files)
        :return: The extended TableNode
        :raises TableNotFoundException: If table definition cannot be found
        """
        # Load SQL if not provided
        if sql is None:
            sql = self._load_table_definition(table_name)

        # Parse the CREATE statement
        create_ast = parse_one(sql)
        if not isinstance(create_ast, exp.Create):
            raise LineageException(
                f"Expected CREATE statement for table '{table_name}', got {type(create_ast)}"
            )

        new_node = self._parse_create_table(create_ast)
        if not new_node:
            raise LineageException(f"Failed to parse table definition for '{table_name}'")

        # If table doesn't exist in graph yet, just add it
        if table_name not in self.table_node_map:
            self.table_node_map[table_name] = new_node
            self.visited_scopes[new_node.scope] = new_node
            return new_node

        # Replace existing table node with the extended version
        old_node = self.table_node_map[table_name]

        # Update all upstream references
        for upstream_node in old_node.upstream:
            # Replace in sources dictionary
            for source_name, source_table in upstream_node.sources.items():
                if source_table == old_node:
                    upstream_node.sources[source_name] = new_node
                    # Reconnect column lineage
                    self._reconnect_column_lineage(upstream_node, source_name)

        # Transfer downstream connections
        new_node.downstream = old_node.downstream.copy()
        for downstream_node in new_node.downstream:
            if old_node in downstream_node.upstream:
                downstream_node.upstream.remove(old_node)
                downstream_node.upstream.append(new_node)

        # Clean up old node
        old_node.detach()

        # Update mappings
        self.table_node_map[table_name] = new_node
        self.visited_scopes[old_node.scope] = new_node
        self.visited_scopes[new_node.scope] = new_node

        return new_node

    def auto_extend_missing_tables(self) -> Dict[str, TableNode]:
        """
        Automatically extend all tables that don't have column definitions

        :return: Dictionary mapping table names to extended TableNodes
        """
        extended = {}

        for table_name, table_node in list(self.table_node_map.items()):
            # Only extend tables without columns (base table references)
            if not table_node.columns and isinstance(table_node.scope, exp.Table):
                try:
                    extended_node = self.extend_table(table_name)
                    extended[table_name] = extended_node
                    logger.info(f"Auto-extended table: {table_name}")
                except TableNotFoundException as e:
                    logger.warning(f"Could not auto-extend {table_name}: {e}")

        return extended

    def visualize(self, show_table_edges: bool = True, show_column_edges: bool = True):
        """
        Generate a Graphviz visualization of the lineage

        :param show_table_edges: Show edges between tables
        :param show_column_edges: Show edges between columns
        :return: Graphviz Digraph object
        """
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
        for table_name, table_node in self.table_node_map.items():
            rows = f'<tr><td bgcolor="lightblue" border="1"><b>{table_name}</b></td></tr>'

            for col_name in table_node.columns:
                rows += f'<tr><td port="{col_name}" border="1" align="left">{col_name}</td></tr>'

            label = f'<<table border="0" cellborder="1" cellspacing="0">{rows}</table>>'
            dot.node(table_name, label)

        # Create lineage edges
        for table_name, table_node in self.table_node_map.items():
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


    def to_json(self) -> Dict:
        """
        Export the lineage graph to a JSON-serializable dictionary format compatible with React Flow.
        
        :return: Dictionary containing 'nodes' and 'edges' lists.
        """
        nodes = []
        edges = []
        
        # Helper to create a consistent ID
        def get_node_id(name):
            return name
        
        # Helper to create column ID
        def get_col_id(table_name, col_name):
            return f"{table_name}::{col_name}"

        # Create nodes (Tables)
        for table_name, table_node in self.table_node_map.items():
            # Format columns for the frontend
            columns = []
            for col_name in table_node.columns:
                columns.append({
                    "id": get_col_id(table_name, col_name),
                    "name": col_name,
                    "type": "column"
                })

            nodes.append({
                "id": get_node_id(table_name),
                "type": "tableNode", # Custom node type we'll define in React Flow
                "data": {
                    "label": table_name,
                    "columns": columns,
                    "schema": table_node.schema
                },
                "position": {"x": 0, "y": 0} # Layout will be handled by the frontend (Dagre)
            })

        # Create edges (Lineage)
        edge_set = set() # To avoid duplicates
        
        for table_name, table_node in self.table_node_map.items():
            target_id = get_node_id(table_name)
            
            # Table-level edges
            for source_name in table_node.sources:
                source_id = get_node_id(source_name)
                edge_key = f"{source_id}->{target_id}"
                
                if edge_key not in edge_set:
                    edges.append({
                        "id": edge_key,
                        "source": source_id,
                        "target": target_id,
                        "animated": True,
                        "style": { "stroke": "#b1b1b7" }
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
                        
                        # Edge ID needs to be unique for column connection
                        edge_key = f"{source_handle_id}->{target_handle_id}"
                        
                        if edge_key not in edge_set:
                            edges.append({
                                "id": edge_key,
                                "source": source_id,
                                "target": target_id,
                                "sourceHandle": source_handle_id,
                                "targetHandle": target_handle_id,
                                "animated": True,
                                "style": { "stroke": "#555555", "strokeWidth": 2 }
                            })
                            edge_set.add(edge_key)

        return {"nodes": nodes, "edges": edges}


if __name__ == "__main__":
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.DEBUG,
        format='%(name)s - %(levelname)s - %(message)s'
    )









