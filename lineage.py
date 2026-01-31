import sys
import dataclasses
from typing import Dict, List, Self
from sqlglot.optimizer.qualify import qualify
from sqlglot.optimizer.scope import Scope, build_scope
from sqlglot import parse_one
from sqlglot import Schema, exp, maybe_parse

import logging

logger = logging.getLogger(__name__)

class Node:
    """
    Base Node class for Table and Column
    Storing data related upstream and downstream

    """
    def __init__(self, name: str):
        self.name = name
        self.secondName = None
        self.upstream: List[Node] = []
        self.downstream: List[Node] = []

    def add_downstream(self, node:Self):
        """
        Adding other node into the downstream list
        Static method -> return nothing

        :param node: The downstream node
        :return: None -> static method
        """
        self.downstream.append(node)
        node.upstream.append(self)

    def add_upstream(self, node: Self):
        """
        Adding the node (parent) into upstream
        Add the current node into parent's downstream list

        :param node: parent node
        :return: None -> static method
        """
        self.upstream.append(node)
        node.downstream.append(self)

    def detach_node(self):
        """
        Detatch the current node from its parents' downstream and children' upstream list

        :return:
        """
        for node in self.upstream:
            if self in node.downstream:
                node.downstream.remove(self)

        for node in self.downstream:
            if self in node.upstream:
                node.upstream.remove(self)

        return

class ColumnNode(Node):
    """
    Base Column node based on Node class

    table: The table node that the column belongs to
    type: The column type (if there is any)
    alias: The column alias
    column_sources: List of tuple (table_name, column_name) indicate where the table originated from inside a given query
    table_identifier: The table identifier (if there is any)

    """
    def __init__(self, name: str, table_identifier: str = None, alias: str = None, column_sources = None):
        super().__init__(name)
        self.table: TableNode | None = None
        self.type = None
        self.alias = alias
        self.column_sources = column_sources
        self.table_identifier = table_identifier

    def __str__(self):
        return f"Column {self.name}"

    def get_source_column_name(self):
        if not self.column_sources:
            return [(self.table, self.name)]

        return [tuple(x.split("."))for x in self.column_sources]

    def detach_column(self):
        self.detach_node()

class TableNode(Node):
    """
    Table node for Scope/Table/Create Expression

    columns: Dict of ColumnNode -> name of the column as keys and ColumnNode as values
    schema: The table schema name (if there is any)
    scope: The Scope/Table/Create Expression that the table belongs to
    sources: Dict of TableNode that the current Node derived value from -> name of the table as keys and TableNode as values
    table_column_mapping: Mapping of source table as key and pair of (source column name, ColumnNode) as value -> used mainly for connecting columns connections between parent and child tables
    """
    def __init__(self, name: str, scope: Scope | exp.Expression, schema = None, db = None):
        super().__init__(name)
        self.columns: Dict[str, ColumnNode] = {}
        self.schema = schema
        self.scope: Scope | exp.Expression | None = scope
        self.sources = {}
        self.table_column_mapping = {}


        self.direct_upstream: ColumnNode | None = None

    def __str__(self):
        final = ""

        final += f"Table: {self.name} \n"
        final += f"\t Columns: {self.columns} \n"
        return final

    def add_column(self, column: ColumnNode):
        self.columns[column.name] = column
        column.table = self

    def connect_direct_upstream(self, upstream):
        self.direct_upstream = upstream
        # upstream.direct_downstream = self

    def detach_table(self):
        self.detach_node()
        for column in self.columns.values():
            column.detach_column()

class LineageMap:
    def __init__(self):
        self.originalScope = None
        self.visitedScopes = {}
        self.tableNodeMap = {}
        self.startNode = None
        self.tempCount = 0
        self.dialect = None

    def clear(self):
        self.tableNodeMap.clear()
        self.visitedScopes.clear()
        self.originalScope = None
        self.startNode = None
        self.tempCount = 0

    def parse_sql(self, sql: str):
        self.clear()

        ast = qualify(parse_one(sql))
        self.originalScope = build_scope(ast)
        self.startNode = self._parse_scope(self.originalScope)

    def generate_name(self, start_name: str = "Temp"):
        self.tempCount += 1
        return f"{start_name}_{self.tempCount}"

    def _parse_column(self, col: exp.Expression | exp.Column | exp.Alias, table: TableNode)-> ColumnNode:
        # if not table_identifier -> alias node -> use column_sources
        # else use table_alias
        if isinstance(col, exp.Star):
            column_sources = []

            for source in table.sources.keys():
                column_sources.append(f"{source}.*")

            column = ColumnNode("*", column_sources=column_sources)

        elif isinstance(col, exp.Column):
            column =  ColumnNode(col.name, table_identifier=col.table, alias=col.alias)

        # if col is alias -> extract alias and all the related
        else:
            alias = col.alias
            column_sources = []
            for c in col.find_all(exp.Column):
                table_prefix = f"{c.table}." if c.table else ""
                column_sources.append(f"{table_prefix}{c.name}")

            column = ColumnNode(alias, column_sources=column_sources)

        return column

    def _parse_scope(self, scope: Scope | exp.Table, name = None) -> TableNode:
        if scope in self.visitedScopes:
            return self.visitedScopes[scope]

        if not name:
            name = self.generate_name("Scope")

        root = TableNode(name, scope=scope)
        self._connect_direct_table(root)

        self.visitedScopes[scope] = root
        self.tableNodeMap[name] = root

        if isinstance(scope.expression, exp.Select):
            for col in scope.expression.selects:
                column = self._parse_column(col, root)
                root.add_column(column)

                for t_source, c_source in column.get_source_column_name():
                    if t_source not in root.table_column_mapping:
                        root.table_column_mapping[t_source] = [[c_source, column]]
                    else:
                        root.table_column_mapping[t_source].append([c_source, column])

            for name, source in scope.sources.items():
                if isinstance(source, exp.Table):
                    child_table = self._parse_table(source)
                    self.visitedScopes[source] = child_table
                    self.tableNodeMap[child_table.name] = child_table

                else:
                    child_table = self._parse_scope(source, name)

                root.sources[name] = child_table
                root.add_downstream(child_table)

            self._connect_nodes(root)

        return root

    def _parse_table(self, table: exp.Table)-> TableNode:
        if table in self.visitedScopes:
            return self.visitedScopes[table]

        name = table.name
        db = table.db
        catalog = table.catalog

        if db:
            name = db + "." +  name

        return TableNode(name, scope=table, schema=db, db=catalog)

    def _connect_nodes(self, root: TableNode)-> None:
        for t_source, c_sources in root.table_column_mapping.items():
            for c_source, col in c_sources:
                if t_source not in root.sources:
                    logger.warning(f"Source {t_source} not found in the current table scope {root.name}")

                downstream = root.sources[t_source]

                if c_source in downstream.columns:
                    downstream.columns[c_source].add_upstream(col)
                else:
                    logger.warning(f"Column {c_source} not found in downstream table {downstream.name}")

    def _connect_table_column_mapping(self, root: TableNode, source_table_name: str):
        if source_table_name not in root.sources:
            logger.warning(f"Source {source_table_name} not found in the current table scope {root.name}")
            return

        source_table = root.sources[source_table_name]
        for c_source, col in root.table_column_mapping[source_table_name]:
            if c_source in source_table.columns:
                source_table.columns[c_source].add_upstream(col)
            else:
                logger.warning(f"Column {c_source} not found in downstream table {source_table.name}")

    def _connect_direct_table(self, node: TableNode):

        parent = node.scope.parent
        if not parent:
            return

        if parent not in self.visitedScopes:
            return
        parent_node = self.visitedScopes[parent]
        node.connect_direct_upstream(parent_node)



    def _parse_create_table(self, create: exp.Create):
        """
        Parsing table or create expression create table node with relatives columns

        :param table:
        :return:
        """

        if create in self.visitedScopes:
            return self.visitedScopes[create]

        table = create.find(exp.Table)
        if not table:
            return None

        root = self._parse_table(table)
        for column in create.find_all(exp.ColumnDef):
            col = ColumnNode(column.name, alias=column.alias)
            root.add_column(col)

        return root

    def extend_table(self,  table):
        node = self._parse_create_table(table)
        # find if the table exist in the graph
        # if not record the table add it into the self.visitedScopes
        # if the table exist in the visitedScopes as the table -> delete the current node from existence and sources
            # for each source -> do the matching between soruce _column and

        if node.name not in self.tableNodeMap:
            self.tableNodeMap[node.name] = node
            self.visitedScopes[node.scope] = node
            return

        # self.delete_node(node.name)
        old  = self.tableNodeMap[node.name]

        for upstream in old.upstream:
            # self.connect_node_column(upstream, node)
            # upstream.sources[old.name] = node
            for source_name, table_node in upstream.sources.items():
                if table_node == old:
                    upstream.sources[source_name] = node
                    self._connect_table_column_mapping(upstream, source_name)
        old.detach_table()
        self.tableNodeMap[old.name] = node
        self.visitedScopes[old.scope] = node
        self.visitedScopes[node.scope] = node

    def connect_node_column(self, current_node: TableNode, down_stream_node: TableNode):
        for col in current_node.columns.values():
            if col.name in down_stream_node.columns:
                col.add_downstream(down_stream_node.columns[col.name])
        current_node.add_downstream(down_stream_node)

        return

    def delete_node(self, node_name: str):
        if node_name not in self.tableNodeMap:
            return
        node = self.tableNodeMap[node_name]
        if node.scope in self.visitedScopes:
            del self.visitedScopes[node.scope]
        node.detach_table()
        return

    def visualize(self):
        try:
            from graphviz import Digraph
        except ImportError:
            print("Please install graphviz: pip install graphviz")
            return

        dot = Digraph(comment='SQL Lineage', graph_attr={'rankdir': 'LR', 'nodesep': '0.5', 'ranksep': '1.5'})
        dot.attr('node', shape='none')

        # 1. Create the "Table Boxes" with Columns inside
        for table_name, table_node in self.tableNodeMap.items():
            # Create an HTML-like label for the table
            rows = f'<tr><td bgcolor="lightblue" border="1"><b>{table_name}</b></td></tr>'
            for col_name in table_node.columns:
                # We give each port a unique ID based on column name
                rows += f'<tr><td port="{col_name}" border="1" align="left">{col_name}</td></tr>'

            label = f'<<table border="0" cellborder="1" cellspacing="0">{rows}</table>>'
            dot.node(table_name, label)

        # 2. Create the "Lines" between columns (Lineage)
        for table_name, table_node in self.tableNodeMap.items():
            for source in table_node.sources.values():
                dot.edge(source.name, table_name)
            for col_name, col_node in table_node.columns.items():
                for upstream in col_node.upstream:
                    if upstream.table:
                        # Link from UpstreamTable:ColumnPort -> CurrentTable:ColumnPort
                        dot.edge(f"{upstream.table.name}:{upstream.name}",
                                 f"{table_name}:{col_name}",
                                 color="blue")
                    else:
                        # For source columns without a parsed table node (base tables)
                        # We create a simple node if it doesn't exist
                        dot.node(upstream.name, shape="ellipse")
                        dot.edge(upstream.name, f"{table_name}:{col_name}")

        return dot



if __name__ == "__main__":
    logging.basicConfig(
        stream=sys.stdout,
        level=logging.DEBUG,
        format='%(name)s - %(levelname)s - %(message)s'
    )









