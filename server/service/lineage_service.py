# from lineage.parser.lineage_map import LineageMap
from server.dependencies import get_lineage_map
from lineage.serializers import to_react_flow

def get_lineage_graph():
    return to_react_flow(get_lineage_map().table_node_map)

def clear_lineage_state():
    get_lineage_map().clear()

def clear_file_lineage_state(file_name: str):
    get_lineage_map().clear_file(file_name)

def parse_sql(sql: str):
    get_lineage_map().parse_sql(sql)