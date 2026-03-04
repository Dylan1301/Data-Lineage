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
        elif isinstance(ast, exp.Insert):
            self.start_node = self._parse_insert(ast, file_name=file_name)
        elif isinstance(ast, exp.Merge):
            self.start_node = self._parse_merge(ast, file_name=file_name)
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
            root.file_names.add(file_name)
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
        Turn Overwrite = True to completely replace existing table nodes.
        :param table: Table expression from sqlglot
        :return: TableNode representing the base table
        """
        if not overwrite and table in self.visited_scopes:
            existing = self.visited_scopes[table]
            if file_name:
                existing.file_names.add(file_name)
                if existing not in self._file_node_map[file_name]:
                    self._file_node_map[file_name].append(existing)
            return existing

        name = table.name
        db = table.db

        if db:
            name = f"{db}.{name}"

        if not overwrite and name in self.table_node_map:
            existing = self.table_node_map[name]
            if file_name:
                existing.file_names.add(file_name)
                if existing not in self._file_node_map[file_name]:
                    self._file_node_map[file_name].append(existing)
            return existing

        node = TableNode(name, scope=table, schema=db, file_name=file_name, table_node_type=TableNodeType.table)
        if file_name:
            self._file_node_map[file_name].append(node)
        return node

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
                root.file_names.add(file_name)
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

    def _cleanup_source_refs(self, node: TableNode) -> None:
        """
        Remove node from all parent sources/col_mappings dicts.
        Must be called before delete_table_node since detach() clears upstream.
        """
        for parent in node.upstream:
            keys_to_remove = [k for k, v in parent.sources.items() if v is node]
            for k in keys_to_remove:
                del parent.sources[k]
                parent.col_mappings.pop(k, None)

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

        Strategy:
        1. Delete all non-table (query/scope) nodes first
        2. For table nodes: remove the file ref, delete only if no refs remain
           and no remaining graph dependencies

        :param file_name: Name of the file whose tables should be removed
        """
        if file_name not in self._file_node_map:
            return

        nodes = list(self._file_node_map[file_name])

        # Partition into table nodes vs non-table (query/scope) nodes
        table_nodes = []
        non_table_nodes = []
        for node in nodes:
            if node.table_node_type == TableNodeType.table:
                table_nodes.append(node)
            else:
                non_table_nodes.append(node)

        # Pass 1: Delete all non-table nodes
        for node in non_table_nodes:
            logger.debug(f"Deleting non-table node {node.name}")
            # self._cleanup_source_refs(node)
            self.delete_table_node(node, columns_only=False)

        # Pass 2: Table nodes — remove file ref, delete only if fully orphaned
        #   First discard all file refs, then determine which to delete.
        #   A node is deletable if it has no file_names AND all its remaining
        #   edges point to other deletable nodes (handles mutual references).
        for node in table_nodes:
            node.file_names.discard(file_name)

        # Iteratively find deletable nodes: nodes with no file_names whose
        # remaining edges only point to other deletable nodes.
        deletable = set()
        changed = True
        while changed:
            changed = False
            for node in table_nodes:
                if node in deletable:
                    continue
                if node.file_names:
                    continue
                # Check if all remaining edges point to already-deletable nodes
                external_refs = any(
                    ref not in deletable
                    for ref in node.upstream + node.downstream
                    if ref not in table_nodes
                ) or any(
                    ref not in deletable
                    for ref in node.upstream + node.downstream
                    if ref in table_nodes and ref.file_names
                )
                if not external_refs:
                    deletable.add(node)
                    changed = True

        for node in table_nodes:
            if node in deletable:
                logger.debug(f"Deleting orphaned table node {node.name}")
                self._cleanup_source_refs(node)
                self.delete_table_node(node, columns_only=False)
            else:
                logger.debug(f"Keeping table {node.name} — still referenced")

        # Clean stale start_node
        if self.start_node and self.start_node.is_deleted:
            self.start_node = None

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

    # ── INSERT / MERGE support ────────────────────────────────────────────

    def _ensure_column(
        self, table_node: TableNode, col_name: str, index: int = 0
    ) -> ColumnNode:
        """
        Get a column by name, or create it on the table if it doesn't exist.

        :param table_node: Table to look up / add the column on
        :param col_name: Column name
        :param index: Ordinal position (used for positional mapping)
        :return: The existing or newly created ColumnNode
        """
        if col_name in table_node.columns:
            return table_node.columns[col_name]

        col = ColumnNode(col_name, index=index)
        table_node.add_column(col)
        return col

    def _parse_insert(
        self, insert: exp.Insert, file_name: Optional[str] = None
    ) -> TableNode:
        """
        Parse INSERT INTO target_table [(columns)] SELECT ... FROM source.

        Strategy:
        1. Parse the SELECT subquery using the existing _parse_scope pipeline
        2. Create or retrieve the target table node
        3. Map target columns → SELECT output columns by ordinal position
        4. Connect column-level lineage between source and target

        :param insert: The INSERT expression from sqlglot
        :param file_name: File to associate with the parsed statement
        :return: The target TableNode (marked as start_node)
        """
        # 1. Get target table from exp.Schema
        schema = insert.find(exp.Schema)
        target_table_exp = schema.this



        if not target_table_exp:
            raise LineageException("INSERT statement has no target table")

        target_table_node = self._parse_table(target_table_exp, file_name)
        self.table_node_map[target_table_node.name] = target_table_node
        self.visited_scopes[target_table_exp] = target_table_node

        # Explicit target column list
        target_columns = (
            [col.name for col in schema.expressions]
            if schema.expressions
            else []
        )

        # 2. Parse the SELECT subquery — reuses entire existing pipeline
        select_expr = insert.expression
        if not isinstance(select_expr, exp.Select):
            raise LineageException(
                f"INSERT ... SELECT expected, got INSERT ... {type(select_expr).__name__}"
            )

        select_scope = build_scope(qualify(select_expr))
        select_node = self._parse_scope(
            select_scope, parent_name="Insert" + target_table_node.name, file_name=file_name
        )


        # 4. Map columns: target ← select output, by ordinal position
        select_columns = list(select_node.columns.values())
        select_columns.sort(key=lambda col: col.index)

        target_table_node.sources[select_node.name] = select_node
        target_table_node.col_mappings[select_node.name] = []
        if target_columns:
            # Explicit column list: INSERT INTO t (a, b) SELECT x, y
            for i, (target_col_name, select_col) in enumerate(zip(target_columns, select_columns)):
                target_col = self._ensure_column(target_table_node, target_col_name, index=i)

                    # add new_scope_source into the table_node
                select_col.add_upstream(target_col)
                target_table_node.col_mappings[select_node.name].append((select_col.name, target_col))
        else:
            # No support for this since it should be explicit.
            # No column list: positional mapping using SELECT column names
            raise LineageException(
                "INSERT INTO ... SELECT without column list is not supported"
            )

        for i, select_col in enumerate(select_columns):
            target_col = self._ensure_column(target_table_node, select_col.name, index=i)
            select_col.add_upstream(target_col)

        target_table_node.add_downstream(select_node)

        return target_table_node

    def _parse_merge(
        self, merge: exp.Merge, file_name: Optional[str] = None
    ) -> TableNode:
        """
        Parse MERGE INTO target USING source ON condition WHEN ...

        Strategy:
        1. Create target and source table nodes
        2. Walk WHEN clauses to find column assignments (UPDATE SET, INSERT VALUES)
        3. Connect column-level lineage from source → target

        :param merge: The MERGE expression from sqlglot
        :param file_name: File to associate with the parsed statement
        :return: The target TableNode
        """
        # 1. Target table
        target_table_exp = merge.this
        if not isinstance(target_table_exp, exp.Table):
            raise LineageException("MERGE statement has no target table")

        target_table_node = self._parse_table(target_table_exp, file_name)
        self.table_node_map[target_table_node.name] = target_table_node
        self.visited_scopes[target_table_exp] = target_table_node

        # 2. Source table or subquery (the USING clause)
        using = merge.args.get("using")
        if using is None:
            raise LineageException("MERGE statement has no USING clause")

        using = qualify(using)

        if isinstance(using, exp.Table):
            source_node = self._parse_table(using, file_name=file_name)
            self.table_node_map[source_node.name] = source_node
            self.visited_scopes[using] = source_node
        else:

            source_scope = build_scope(using)
            source_node = self._parse_scope(source_scope, file_name=file_name)

        # Table-level edge
        target_table_node.add_downstream(source_node)

        # 3. Walk WHEN clauses for column assignments
        whens = merge.args.get("whens")
        if whens:
            for when_clause in whens.expressions:
                if isinstance(when_clause, exp.When):
                    self._process_merge_when(when_clause, target_table_node, source_node)

        return target_table_node

    def _process_merge_when(
        self,
        when: exp.When,
        target: TableNode,
        source: TableNode,
    ) -> None:
        """
        Extract column assignments from a single WHEN clause and connect lineage.

        Currently handles:
        - WHEN NOT MATCHED THEN INSERT (cols) VALUES (source_exprs)

        :param when: The WHEN clause expression
        :param target: Target table node
        :param source: Source table node
        """
        # Handle WHEN NOT MATCHED THEN INSERT (cols) VALUES (exprs)
        insert_expr = when.find(exp.Insert)
        if not insert_expr or not insert_expr.this or not insert_expr.expression:
            return

        target_col_exprs = list(insert_expr.this.expressions)
        source_val_exprs = list(insert_expr.expression.expressions)

        for tgt_expr, src_expr in zip(target_col_exprs, source_val_exprs):
            if isinstance(tgt_expr, exp.Column):
                target_col = self._ensure_column(target, tgt_expr.name)
                # Source expression may be a single column or a complex expression
                src_cols = (
                    [src_expr]
                    if isinstance(src_expr, exp.Column)
                    else list(src_expr.find_all(exp.Column))
                )
                for src_col_ref in src_cols:
                    source_col = self._ensure_column(source, src_col_ref.name)
                    source_col.add_upstream(target_col)

    def _auto_infer_source_columns(self):
        """
        Create temp columns for source node when needed (eg. Select cola from tablea)
        This will assume that tablea got cola -> create it
        :return:
        """
        pass
