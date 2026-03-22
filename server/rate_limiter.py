"""
Redis-based rate-limiting middleware.

Uses a fixed-window counter per (identifier, endpoint) pair.
Identifier = session ID cookie if present, otherwise client IP.
"""

import logging
from typing import Dict

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from server.config import settings
from server.redis import get_redis

logger = logging.getLogger(__name__)

# Endpoint path → max requests per minute
RATE_LIMITS: Dict[str, int] = {
    "/api/lineage/visualize": settings.rate_limit_per_minute,
    "/api/lineage/impact": 60,
    "/api/lineage/clear": settings.rate_limit_clear_per_minute,
    "/api/lineage/clear-file": settings.rate_limit_clear_per_minute,
}

WINDOW_SECONDS = 60


def _get_identifier(request: Request) -> str:
    """Return a rate-limit key: session cookie > X-Forwarded-For > client IP."""
    session_id = request.cookies.get("session_id")
    if session_id:
        return f"session:{session_id}"

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"

    host = request.client.host if request.client else "unknown"
    return f"ip:{host}"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests that exceed the per-endpoint rate limit."""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        limit = RATE_LIMITS.get(path)

        # No limit configured for this path — pass through
        if limit is None:
            return await call_next(request)

        redis = await get_redis()

        # If Redis is down, skip rate limiting (fail-open)
        if redis is None:
            return await call_next(request)

        identifier = _get_identifier(request)
        redis_key = f"rate:{identifier}:{path}"

        try:
            count = await redis.incr(redis_key)
            if count == 1:
                await redis.expire(redis_key, WINDOW_SECONDS)

            if count > limit:
                ttl = await redis.ttl(redis_key)
                retry_after = max(ttl, 1)
                logger.warning(
                    "Rate limit exceeded for %s on %s (%d/%d)",
                    identifier, path, count, limit,
                )
                return JSONResponse(
                    status_code=429,
                    content={"detail": "Rate limit exceeded. Try again later."},
                    headers={"Retry-After": str(retry_after)},
                )
        except Exception:
            logger.exception("Rate limiter error — allowing request")

        return await call_next(request)
