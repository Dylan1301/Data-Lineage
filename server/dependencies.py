"""
Dependency injection for the FastAPI server.

Provides singleton instances of core services via FastAPI's Depends() mechanism.
"""

from functools import lru_cache

from lineage import LineageMap


@lru_cache()
def get_lineage_map() -> LineageMap:
    """
    Singleton LineageMap instance, injected via FastAPI Depends().

    Using @lru_cache ensures the same instance is reused across requests.
    """
    return LineageMap()
