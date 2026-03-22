"""
Lineage package — SQL column-level lineage analysis.

Public API:
    from lineage import LineageMap
    from lineage import LineageException, TableNotFoundException
"""

from lineage.parser.lineage_map import LineageMap
from lineage.parser.sql_file_loader import SqlFileLoader
from lineage.exceptions import (
    LineageException,
    TableNotFoundException,
    ColumnMismatchException,
)

__all__ = [
    "LineageMap",
    "SqlFileLoader",
    "LineageException",
    "TableNotFoundException",
    "ColumnMismatchException",
]
