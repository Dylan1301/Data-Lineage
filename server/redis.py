"""
Async Redis connection management.

Provides a module-level client that is initialised/closed via the FastAPI lifespan,
and a ``get_redis`` dependency for injection into routes.
"""

import logging
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI

from server.config import settings

logger = logging.getLogger(__name__)

# Module-level client — set during lifespan startup
_redis_client: aioredis.Redis | None = None


@asynccontextmanager
async def redis_lifespan(app: FastAPI):
    """FastAPI lifespan: open and close the Redis connection pool."""
    global _redis_client
    logger.info("Connecting to Redis at %s", settings.redis_url)
    _redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=False,  # we store raw bytes (pickle)
    )
    try:
        await _redis_client.ping()
        logger.info("Redis connection established")
    except Exception:
        logger.warning("Redis is not available — sessions will be in-memory only")
        _redis_client = None

    yield  # app runs here

    if _redis_client is not None:
        await _redis_client.aclose()
        logger.info("Redis connection closed")
        _redis_client = None


async def get_redis() -> aioredis.Redis | None:
    """FastAPI dependency — returns the shared Redis client (or None)."""
    return _redis_client
