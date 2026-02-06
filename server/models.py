from pydantic import BaseModel
from typing import Optional, Dict, List, Any

class LineageRequest(BaseModel):
    sql: str
    current_graph: Optional[Dict[str, Any]] = None

class NodeData(BaseModel):
    label: str
    columns: List[Dict[str, Any]]
    schema_name: Optional[str] = None

class GraphNode(BaseModel):
    id: str
    type: str
    data: NodeData
    position: Dict[str, int]

class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    animated: bool = False
    style: Optional[Dict[str, Any]] = None
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None

class LineageResponse(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]
