"""
Lineage API routes.

Thin HTTP layer — unpacks requests, calls the service, packs responses.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse

from lineage import LineageException
from server.dependencies import load_session, save_session
from server.redis import get_redis
from server.schemas.lineage import (
    ClearFileRequest,
    ImpactRequest,
    LineageRequest,
)
from server.services import lineage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lineage", tags=["lineage"])


def _session_response(data: dict, session_id: str) -> JSONResponse:
    """Build a JSON response that also sets the session cookie."""
    response = JSONResponse(content=data)
    response.set_cookie(
        "session_id",
        session_id,
        httponly=True,
        samesite="lax",
        max_age=3600,
    )
    return response


@router.post("/visualize")
async def visualize(
    body: LineageRequest,
    request: Request,
    redis=Depends(get_redis),
):
    """Parse SQL and return the lineage graph as React Flow-compatible JSON."""
    session_id, lineage_map = await load_session(request, redis)

    try:
        result = lineage_service.visualize(
            lineage_map, sql=body.sql, file_name=body.file_name, dialect=body.dialect
        )
    except LineageException as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")

    await save_session(redis, session_id, lineage_map)
    return _session_response(result, session_id)


@router.post("/clear-file")
async def clear_file(
    body: ClearFileRequest,
    request: Request,
    redis=Depends(get_redis),
):
    """Clear lineage state for a specific file."""
    session_id, lineage_map = await load_session(request, redis)
    lineage_service.clear_file(lineage_map, file_name=body.file_name)
    await save_session(redis, session_id, lineage_map)
    return _session_response({"status": "ok"}, session_id)


@router.post("/impact")
async def impact(
    body: ImpactRequest,
    request: Request,
    redis=Depends(get_redis),
):
    """Return upstream and downstream impact for a given column."""
    session_id, lineage_map = await load_session(request, redis)
    try:
        result = lineage_service.get_impact(lineage_map, body.table, body.column)
    except LineageException as e:
        raise HTTPException(status_code=404, detail=str(e))
    return result


@router.post("/clear")
async def clear(
    request: Request,
    redis=Depends(get_redis),
):
    """Clear all lineage state."""
    session_id, lineage_map = await load_session(request, redis)
    lineage_service.clear(lineage_map)
    await save_session(redis, session_id, lineage_map)
    return _session_response({"status": "ok"}, session_id)
