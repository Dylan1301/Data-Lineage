"""
Application settings — loaded from environment variables / .env file.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Centralised configuration read from env vars (or .env)."""

    redis_url: str = "redis://localhost:6379/0"
    session_ttl_seconds: int = 3600  # 1 hour
    rate_limit_per_minute: int = 30
    rate_limit_clear_per_minute: int = 10
    allow_origins: list[str] = ["http://localhost:5173", "http://localhost"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
