"""
Lineage package — SQL column-level lineage analysis.

Public API:
    from lineage import LineageMap
    from lineage import LineageException, TableNotFoundException
"""

from lineage.parser.lineage_map import LineageMap
from lineage.exceptions import (
    LineageException,
    TableNotFoundException,
    ColumnMismatchException,
)

__all__ = [
    "LineageMap",
    "LineageException",
    "TableNotFoundException",
    "ColumnMismatchException",
]
