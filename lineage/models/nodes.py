from typing import Dict, List, Optional, Set, Tuple
from enum import Enum
from sqlglot.optimizer.scope import Scope
from sqlglot import exp

class TableNodeType(str, Enum):
    table = "table"
    query = "query"
    insert = "insert"
    merge = "merge"

class Node:
    """
    Base Node class for Table and Column
    Stores upstream and downstream relationships for lineage tracking
    """
    def __init__(self, name: str):
        self.name = name
        self.upstream: List['Node'] = []
        self.downstream: List['Node'] = []
        self.is_deleted = False

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

        self.is_deleted = True
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
        self.table: Optional[TableNode] = None
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
        col_mappings: Mapping of source table -> list of (source_column, target_column) pairs {table_name: [(source_col_name, table_col_node), ...]}
    """
    def __init__(
        self,
        name: str,
        scope: Optional[Scope | exp.Expression] = None,
        schema: Optional[str] = None,
        file_name: Optional[str] = None,
        table_node_type: TableNodeType = TableNodeType.query
    ):
        super().__init__(name)
        self.columns: Dict[str, ColumnNode] = {}
        self.schema = schema
        self.scope = scope
        self.sources: Dict[str, 'TableNode'] = {}
        self.col_mappings: Dict[str, List[List]] = {}
        self.file_names: Set[str] = {file_name} if file_name else set()
        self.is_first: bool = False
        self.table_node_type: TableNodeType = table_node_type

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

    def __getstate__(self) -> dict:
        """
        Strip the sqlglot AST scope before pickling.

        scope holds a live Scope or exp.Expression object from a single parse
        session. It is large, version-sensitive, and meaningless across restarts.
        Setting it to None on restore is safe: table_node_map (string-keyed)
        handles durable lookups, and scope is only needed during active parsing.
        """
        state = self.__dict__.copy()
        state["scope"] = None
        return state
