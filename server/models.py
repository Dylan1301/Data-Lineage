from pydantic import BaseModel
from typing import Optional, Dict, List, Any

class LineageRequest(BaseModel):
    sql: Optional[str] = None
    additional_sql: Optional[str] = None
    current_graph: Optional[Dict[str, Any]] = None
    file_name: Optional[str] = None

class NodeData(BaseModel):
    label: str
    columns: List[Dict[str, Any]]
    schema_name: Optional[str] = None
    file_name: Optional[str] = None
    table_node_type: Optional[str] = None
    is_first: bool = False

class GraphNode(BaseModel):
    id: str
    type: str
    data: NodeData
    position: Dict[str, int]

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    edge_type: str
    animated: bool = False
    style: Optional[Dict[str, Any]] = None
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class LineageResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


class ClearFileRequest(BaseModel):
    file_name: str


