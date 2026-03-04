"""
SQL Lineage API — Application entry point.

Start with:
    uvicorn server.main:app --reload --port 8000
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.redis import redis_lifespan
from server.rate_limiter import RateLimitMiddleware
from server.routes.lineage import router as lineage_router
from server.routes.health import router as health_router


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""

    application = FastAPI(
        title="SQL Lineage API",
        description="Parse SQL and build column-level lineage graphs.",
        version="0.2.0",
        lifespan=redis_lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────────
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Restrict to frontend URL in production
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Rate Limiting ────────────────────────────────────────────────────
    application.add_middleware(RateLimitMiddleware)

    # ── Routers ──────────────────────────────────────────────────────────
    application.include_router(lineage_router)
    application.include_router(health_router)

    return application


app = create_app()
