import hashlib
import logging
import pickle
from pathlib import Path
from typing import TYPE_CHECKING, Dict, List, Optional, Tuple

from sqlglot import exp

from lineage.exceptions import TableNotFoundException

if TYPE_CHECKING:
    from lineage.models.nodes import TableNode
    from lineage.parser.lineage_map import LineageMap

logger = logging.getLogger(__name__)


class SqlFileLoader:
    """
    Handles SQL file discovery, loading, and incremental lineage updates.

    Separates file-system concerns from LineageMap so that LineageMap remains
    a pure parser/graph class.

    Attributes:
        sql_directory: Root directory to search for .sql files
        _path_cache: Maps table names to the .sql file path that defines them
        _hash_cache: Maps file path strings to their last-known SHA-256 hash
    """

    def __init__(self, sql_directory: str):
        self.sql_directory = Path(sql_directory)
        self._path_cache: Dict[str, Path] = {}
        self._hash_cache: Dict[str, str] = {}

    # ── File resolution ───────────────────────────────────────────────────────

    def resolve(self, table_name: str) -> Optional[Path]:
        """
        Find the .sql file containing the definition for *table_name*.

        Searches the sql_directory (and all subdirectories) using three case
        variants of the base table name (original, lower, upper).

        :param table_name: Fully-qualified or bare table name (e.g. "schema.table")
        :return: Path to the .sql file, or None if not found
        """
        if not self.sql_directory.exists():
            return None

        if table_name in self._path_cache:
            return self._path_cache[table_name]

        base_name = table_name.split(".")[-1]
        patterns = [
            f"{base_name}.sql",
            f"{base_name.lower()}.sql",
            f"{base_name.upper()}.sql",
        ]

        for pattern in patterns:
            candidate = self.sql_directory / pattern
            if candidate.exists():
                self._path_cache[table_name] = candidate
                return candidate

            matches = list(self.sql_directory.rglob(pattern))
            if matches:
                self._path_cache[table_name] = matches[0]
                return matches[0]

        return None

    def load(self, table_name: str) -> str:
        """
        Return the SQL text for *table_name*.

        :param table_name: Fully-qualified or bare table name
        :return: SQL CREATE statement as a string
        :raises TableNotFoundException: If no .sql file is found or cannot be read
        """
        file_path = self.resolve(table_name)

        if not file_path:
            raise TableNotFoundException(
                f"Could not find SQL file for table '{table_name}' in {self.sql_directory}"
            )

        try:
            return file_path.read_text()
        except Exception as e:
            raise TableNotFoundException(
                f"Error reading table definition for '{table_name}': {e}"
            )

    # ── Incremental diff ──────────────────────────────────────────────────────

    @staticmethod
    def _hash_file(path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def changed_files(self) -> List[Path]:
        """
        Return all .sql files under sql_directory whose content has changed
        since the last time this loader recorded their hash.

        New files (not yet in _hash_cache) are also returned.

        :return: List of changed or new .sql file paths
        """
        changed = []
        for path in self.sql_directory.rglob("*.sql"):
            key = str(path)
            current_hash = self._hash_file(path)
            if self._hash_cache.get(key) != current_hash:
                changed.append(path)
        return changed

    def _record_hashes(self) -> None:
        """Update _hash_cache for every .sql file in sql_directory."""
        for path in self.sql_directory.rglob("*.sql"):
            self._hash_cache[str(path)] = self._hash_file(path)

    # ── Auto-extend ───────────────────────────────────────────────────────────

    def auto_extend(self, lm: "LineageMap") -> Dict[str, "TableNode"]:
        """
        For every stub table node in *lm* (no columns, scope is an exp.Table),
        attempt to locate its .sql file and call lm.extend_table(sql=...).

        This mirrors the old LineageMap.auto_extend_missing_tables() behaviour
        but uses this loader for file discovery.

        :param lm: The LineageMap whose stubs should be extended
        :return: Dict mapping table names to the extended TableNodes
        """
        from lineage.exceptions import TableNotFoundException

        extended = {}
        for table_name, table_node in list(lm.table_node_map.items()):
            if not table_node.columns and isinstance(table_node.scope, exp.Table):
                try:
                    sql = self.load(table_name)
                    extended_node = lm.extend_table(table_name, sql=sql)
                    extended[table_name] = extended_node
                    logger.info(f"Auto-extended table: {table_name}")
                except TableNotFoundException as e:
                    logger.warning(f"Could not auto-extend {table_name}: {e}")

        return extended

    # ── Pickle persistence ────────────────────────────────────────────────────

    def save_snapshot(self, lm: "LineageMap", path: str) -> None:
        """
        Persist *lm* and this loader's hash cache to a pickle file.

        LineageMap.__getstate__ strips AST objects (visited_scopes, scope fields)
        before pickling, so the snapshot is compact and version-safe.

        :param lm: The LineageMap to snapshot
        :param path: Destination file path for the pickle
        """
        self._record_hashes()
        data = {"lm": lm, "hash_cache": self._hash_cache}
        with open(path, "wb") as f:
            pickle.dump(data, f)
        logger.info(f"Snapshot saved to {path}")

    @classmethod
    def load_snapshot(
        cls, path: str, sql_directory: str
    ) -> Tuple["LineageMap", "SqlFileLoader"]:
        """
        Restore a LineageMap and SqlFileLoader from a pickle snapshot.

        After loading, call loader.auto_extend(lm) to apply any diffs
        (files added or changed since the snapshot was saved).

        :param path: Path to the pickle file created by save_snapshot()
        :param sql_directory: Directory to use for subsequent file lookups
        :return: (lm, loader) tuple ready to use
        """
        with open(path, "rb") as f:
            data = pickle.load(f)

        loader = cls(sql_directory)
        loader._hash_cache = data["hash_cache"]
        logger.info(f"Snapshot loaded from {path}")
        return data["lm"], loader