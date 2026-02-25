import logging
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sqlglot import exp, parse_one
from sqlglot.optimizer.qualify import qualify
from sqlglot.optimizer.scope import Scope, build_scope

from lineage.exceptions import LineageException, TableNotFoundException
from lineage.models.nodes import ColumnNode, TableNode, TableNodeType

logger = logging.getLogger(__name__)

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
        self._file_node_map: Dict[str, List[TableNode]] = defaultdict(list)
        self._dialect = None

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

    def parse_sql(self, sql: str, name: Optional[str] = None, file_name: Optional[str] = None) -> None:
        """
        Parse SQL query and build lineage graph.

        :param sql: SQL query string to parse
        :param name: Optional name for the root table node — normally the file name.
        :param file_name: Optional file name to associate with the root table node.
        """
        if name is None:
            name = self._generate_temp_name("Query")

        try:
            ast = qualify(parse_one(sql))
        except Exception as e:
            raise LineageException(f"Failed to parse SQL: {e}") from e

        self.original_scope = build_scope(ast)

        if isinstance(ast, exp.Create):
            self.start_node = self.extend_table(sql=sql, file_name=file_name)
        elif isinstance(ast, exp.Select):
            self.start_node = self._parse_scope(self.original_scope, parent_name=name, file_name=file_name)
        else:
            raise LineageException(f"Unsupported query type: {type(ast)}")
        self.start_node.is_first = True

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
        table: TableNode | None = None,
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
        name: Optional[str] = None,
        parent_name: Optional[str] = None,
        file_name: Optional[str] = None
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

        if parent_name:
            name = f"{parent_name}.{name}"

        root = TableNode(name, scope=scope, file_name=file_name)

        logger.debug(f"Parsing scope {name} in _parse_scope: {scope} file_name: {file_name}")

        self.visited_scopes[scope] = root
        self.table_node_map[name] = root
        if file_name:
            self._file_node_map[file_name].append(root)

        if isinstance(scope.expression, exp.Select):
            # Process SELECT columns
            self._process_select_columns(scope, root)
            
            # Process source tables/subqueries
            self._process_sources(scope, root, parent_name=parent_name, file_name=file_name)

            # Connect column lineage
            self._connect_column_lineage(root)

        if isinstance(scope.expression, exp.Union):
            self._process_select_columns(scope, root)
            self._parse_union(scope, root, parent_name=parent_name, file_name=file_name)

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

    def _process_sources(
            self,
            scope: Scope,
            table: TableNode,
            parent_name: Optional[str]=None,
            file_name: Optional[str]=None) -> None:
        """
        Process FROM/JOIN source tables and subqueries

        :param scope: The scope being processed
        :param table: The parent table node
        """
        for source_name, source in scope.sources.items():
            if isinstance(source, exp.Table):
                child_table = self._parse_table(source, file_name=file_name)
                self.visited_scopes[source] = child_table
                self.table_node_map[child_table.name] = child_table
            else:
                child_table = self._parse_scope(source, source_name, parent_name, file_name=file_name)

            table.sources[source_name] = child_table
            table.add_downstream(child_table)

    def _parse_union(
        self,
        scope: Scope,
        table: TableNode,
        parent_name: Optional[str] = None,
        file_name: Optional[str] = None,
    ) -> None:
        """Parse UNION branches and connect them as children of *table*."""
        for union_scope in scope.union_scopes:
            logger.debug(f"Found union scope: {union_scope}")
            child = self._parse_scope(union_scope, parent_name=parent_name, file_name=file_name)

            table.add_downstream(child)
            logger.debug(f"Added union scope {child.name} to {table.name}")
            table.sources[child.name] = child

            self._connect_column_lineage_union(table, child)

    def _parse_table(
        self,
        table: exp.Table,
        file_name: Optional[str] = None,
        overwrite: bool = False,
    ) -> TableNode:
        """
        Parse a table reference into a TableNode (base table without columns).

        :param table: Table expression from sqlglot
        :return: TableNode representing the base table
        """
        if not overwrite and table in self.visited_scopes:
            return self.visited_scopes[table]

        name = table.name
        db = table.db

        if db:
            name = f"{db}.{name}"

        if not overwrite and name in self.table_node_map:
            return self.table_node_map[name]

        return TableNode(name, scope=table, schema=db, file_name=file_name, table_node_type=TableNodeType.table)

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
                    # Columns might not be defined yet (lazy loading)
                    logger.debug(f"Column '{source_col_name}' not found in table {source_table.name}")

        return errors

    def _connect_column_lineage_union(self, table: TableNode, current_node: TableNode) -> None:
        """Match union branch columns to parent columns by ordinal index."""
        for table_column in table.columns.values():
            for child_column in current_node.columns.values():
                if table_column.index == child_column.index:
                    child_column.add_upstream(table_column)

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

    def _parse_create_table(
        self,
        create: exp.Create,
        file_name: Optional[str] = None,
    ) -> Optional[TableNode]:
        """
        Parse CREATE TABLE statement and extract column definitions.

        :param create: CREATE expression from sqlglot
        :return: TableNode with columns, or None if invalid
        """
        if create in self.visited_scopes:
            return self.visited_scopes[create]

        table = create.find(exp.Table)
        if not table:
            return None

        root = self._parse_table(table, file_name=file_name, overwrite=True)

        if not create.find(exp.Select):
            if file_name:
                self._file_node_map[file_name].append(root)
            for column in create.find_all(exp.ColumnDef):
                col = ColumnNode(column.name, alias=column.alias)
                root.add_column(col)

            return root

        new_root = self._parse_scope(build_scope(qualify(create)), parent_name=root.name, file_name=file_name)

        del self.table_node_map[new_root.name]

        new_root.name = root.name
        new_root.schema = root.schema
        new_root.table_node_type = root.table_node_type

        return new_root

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

    def delete_table_node(self, table_node: TableNode, columns_only: bool = False) -> None:
        """
        Delete a table node from the graph and remove all references to it.

        :param table_node: The node to delete
        :param columns_only: If True, only detach columns (keep table-level edges)
        """
        if table_node.name in self.table_node_map:
            self.table_node_map.pop(table_node.name)

        if table_node.scope in self.visited_scopes:
            self.visited_scopes.pop(table_node.scope)

        if not columns_only:
            table_node.detach()

        for column in table_node.columns.values():
            column.detach()

    def clear_file(self, file_name: str) -> None:
        """
        Clear all lineage state associated with a specific file.

        :param file_name: Name of the file whose tables should be removed
        """
        if file_name not in self._file_node_map:
            return

        for table_node in self._file_node_map[file_name]:
            if table_node.file_name == file_name:
                logger.debug(f"Deleting table {table_node.name}")
                if isinstance(table_node.scope, exp.Table):
                    self.delete_table_node(table_node, columns_only=True)
                else:
                    self.delete_table_node(table_node, columns_only=False)

        del self._file_node_map[file_name]


    def extend_table(
        self,
        table_name: Optional[str] = None,
        sql: Optional[str] = None,
        file_name: Optional[str] = None
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

        new_node = self._parse_create_table(create_ast, file_name=file_name)

        if not new_node:
            raise LineageException(f"Failed to parse table definition for '{table_name}'")

        if table_name is None:
            table_name = new_node.name

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
            upstream_node.add_downstream(new_node)

        # Update all downstream references
        for downstream_node in old_node.downstream:
            downstream_node.add_upstream(new_node)

        # Clean up old node
        for old_col in old_node.columns.values():
            old_col.detach()
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

    def _auto_infer_source_columns(self):
        """
        Create temp columns for source node when needed (eg. Select cola from tablea)
        This will assume that tablea got cola -> create it
        :return:
        """
        pass
