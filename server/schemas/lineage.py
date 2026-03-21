"""
Pydantic request/response schemas for the Lineage API.
"""

from pydantic import BaseModel
from typing import Optional, Dict, List, Any


# ── Impact schemas ────────────────────────────────────────────────────────────

class ImpactRequest(BaseModel):
    """Request body for the /lineage/impact endpoint."""
    table: str
    column: str


class ImpactEntry(BaseModel):
    table: str
    column: str


class ImpactResponse(BaseModel):
    column: str
    upstream: List[ImpactEntry]
    downstream: List[ImpactEntry]


# ── Request Schemas ──────────────────────────────────────────────────────────

class LineageRequest(BaseModel):
    """Request body for the /lineage/visualize endpoint."""
    sql: Optional[str] = None
    file_name: Optional[str] = None
    dialect: Optional[str] = None


class ClearFileRequest(BaseModel):
    """Request body for the /lineage/clear-file endpoint."""
    file_name: str


# ── Response Schemas ─────────────────────────────────────────────────────────

class NodeData(BaseModel):
    """Data payload for a graph node (table)."""
    label: str
    columns: List[Dict[str, Any]]
    schema_name: Optional[str] = None
    file_name: Optional[str] = None
    table_node_type: Optional[str] = None
    is_first: bool = False


class GraphNode(BaseModel):
    """A single node in the lineage graph."""
    id: str
    type: str
    data: NodeData
    position: Dict[str, int]


class GraphEdge(BaseModel):
    """A single edge in the lineage graph."""
    id: str
    source: str
    target: str
    edge_type: str
    animated: bool = False
    style: Optional[Dict[str, Any]] = None
    sourceHandle: Optional[str] = None
    targetHandle: Optional[str] = None


class LineageResponse(BaseModel):
    """Response body containing the full lineage graph."""
    nodes: List[GraphNode]
    edges: List[GraphEdge]
