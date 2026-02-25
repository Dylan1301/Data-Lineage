"""
Lineage API routes.

Thin HTTP layer — unpacks requests, calls the service, packs responses.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from lineage import LineageException
from server.dependencies import get_lineage_map
from server.schemas.lineage import (
    ClearFileRequest,
    LineageRequest,
    LineageResponse,
)
from server.services import lineage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lineage", tags=["lineage"])


@router.post("/visualize", response_model=LineageResponse)
async def visualize(
    request: LineageRequest,
    lineage_map=Depends(get_lineage_map),
):
    """Parse SQL and return the lineage graph as React Flow-compatible JSON."""
    try:
        return lineage_service.visualize(
            lineage_map, sql=request.sql, file_name=request.file_name
        )
    except LineageException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/clear-file")
async def clear_file(
    request: ClearFileRequest,
    lineage_map=Depends(get_lineage_map),
):
    """Clear lineage state for a specific file."""
    lineage_service.clear_file(lineage_map, file_name=request.file_name)
    return {"status": "ok"}


@router.post("/clear")
async def clear(lineage_map=Depends(get_lineage_map)):
    """Clear all lineage state."""
    lineage_service.clear(lineage_map)
    return {"status": "ok"}
