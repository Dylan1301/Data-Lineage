"""
Custom exceptions for the lineage package.
"""


class LineageException(Exception):
    """Base exception for lineage operations."""
    pass


class TableNotFoundException(LineageException):
    """Raised when a table definition cannot be found."""
    pass


class ColumnMismatchException(LineageException):
    """Raised when column mapping fails between tables."""
    pass
