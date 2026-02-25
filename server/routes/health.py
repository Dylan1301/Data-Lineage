"""
Health check route.
"""

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health():
    """Basic liveness check."""
    return {"status": "ok"}
