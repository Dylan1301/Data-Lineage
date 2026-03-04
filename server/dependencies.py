"""
Dependency injection for the FastAPI server.

Provides session-aware LineageMap loading via Redis.
Each user gets their own LineageMap, identified by a session token.
"""

import logging
import uuid
from typing import Optional, Tuple

import redis.asyncio as aioredis
from fastapi import Request

from lineage import LineageMap
from lineage.serializers import to_pickle, from_pickle
from server.config import settings

logger = logging.getLogger(__name__)


def get_session_id(request: Request) -> Optional[str]:
    """
    Extract session ID from the request.
    Checks X-Session-Id header first, then session_id cookie.
    """
    session_id = request.headers.get("x-session-id")
    if session_id:
        return session_id
    return request.cookies.get("session_id")


async def load_session(
    request: Request,
    redis_client: Optional[aioredis.Redis],
) -> Tuple[str, LineageMap]:
    """
    Load a LineageMap for the current user session.

    - If a session ID is present and found in Redis, deserialise and return it.
    - Otherwise, create a fresh LineageMap and a new session ID.

    :returns: (session_id, lineage_map)
    """
    session_id = get_session_id(request)

    if session_id and redis_client:
        try:
            data = await redis_client.get(f"session:{session_id}")
            if data is not None:
                lineage_map = from_pickle(data)
                if lineage_map is not None:
                    logger.debug("Loaded session %s from Redis", session_id)
                    return session_id, lineage_map
                logger.warning("Corrupted session %s — creating new", session_id)
        except Exception:
            logger.exception("Failed to load session %s", session_id)

    # New session
    if not session_id:
        session_id = str(uuid.uuid4())
    return session_id, LineageMap()


async def save_session(
    redis_client: Optional[aioredis.Redis],
    session_id: str,
    lineage_map: LineageMap,
) -> None:
    """Serialise the LineageMap and persist it in Redis with a TTL."""
    if redis_client is None:
        return

    try:
        data = to_pickle(lineage_map)
        await redis_client.setex(
            f"session:{session_id}",
            settings.session_ttl_seconds,
            data,
        )
        logger.debug("Saved session %s to Redis", session_id)
    except Exception:
        logger.exception("Failed to save session %s", session_id)
