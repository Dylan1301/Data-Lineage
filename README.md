# SQL Lineage Visualizer

A full-stack tool for parsing SQL and rendering **column-level lineage graphs** interactively. Paste SQL queries across multiple tabs — the backend builds a directed graph showing exactly how each column flows through your data pipeline, and the frontend renders it as an explorable React Flow canvas.

![Graph showing column-level lineage between tables](.github/screenshot.png)

---

## What it does

Given a SQL query, the tool answers:
- Which source columns feed into this output column?
- How does data flow through subqueries, CTEs, and JOINs?
- If I change `orders.customer_id`, what downstream columns are affected?

Supported SQL patterns:
- `SELECT` — including subqueries, CTEs, window functions, JOINs
- `CREATE TABLE ... AS SELECT`
- `INSERT INTO ... SELECT`
- `MERGE INTO ... USING ... WHEN ...`
- `UNION` / `UNION ALL`

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│  ┌──────────────┐        ┌─────────────────────────┐    │
│  │  SQL Editor  │        │    React Flow Canvas    │    │
│  │  (CodeMirror)│        │  Column-level lineage   │    │
│  │  Multi-tab   │        │  Dagre auto-layout      │    │
│  └──────┬───────┘        └────────────▲────────────┘    │
│         │  POST /api/lineage/visualize │                │
└─────────┼───────────────────────────  ┼ ────────────────┘
          │                             │
┌─────────▼─────────────────────────────┴─────────────────┐
│                   FastAPI Backend                       │
│                                                         │
│  ┌──────────────┐   ┌───────────────┐  ┌────────────┐   │
│  │  Rate Limiter│   │  LineageMap   │  │ Serializer │   │
│  │  (per session│   │  (per session)│  │ to_react_  │   │
│  │   fixed win) │   │               │  │ flow()     │   │
│  └──────────────┘   └───────┬───────┘  └────────────┘   │
│                             │                           │
│                    ┌────────▼────────┐                  │
│                    │  sqlglot        │                  │
│                    │  parse + qualify│                  │
│                    │  build_scope    │                  │
│                    └─────────────────┘                  │
└──────────────────────────┬──────────────────────────────┘
                           │  session:{id} → LineageMap (pickle)
                  ┌────────▼────────┐
                  │      Redis      │
                  │  Session store  │
                  │  TTL: 1 hour    │
                  └─────────────────┘
```

Each browser session gets its own `LineageMap` instance stored in Redis. Multiple SQL submissions accumulate into a single graph — submitting a new query for a file replaces only that file's nodes, leaving others intact.

---

## Features

**Graph**
- Column-level lineage edges with source/target handles per column
- Table-level edges as fallback when column definitions are unavailable
- Dagre automatic left-to-right layout
- Hover a column to highlight its full lineage chain (BFS traversal)
- Click a node to focus and centre it
- Transitive edge reduction — when a node is collapsed, edges are redrawn directly between visible endpoints
- Right-click context menu per node

**Editor**
- Multi-tab SQL editor (CodeMirror with SQL syntax highlighting)
- Double-click a tab to rename it
- Run a single tab or all tabs at once
- File-level clear — remove one file's nodes without affecting others

**UI**
- Toggle table-level and column-level edges independently
- Search by table name or column name
- Filter graph by file/tab
- Export graph as PNG or SVG
- Dark / light theme

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| SQL parsing | [sqlglot](https://github.com/tobymao/sqlglot) 28.5 — `parse_one`, `qualify`, `build_scope` |
| Backend | Python 3.12, FastAPI, uvicorn |
| Sessions | Redis 7 (async via `redis-py`) |
| Rate limiting | Fixed-window counter per session/IP in Redis |
| Config | pydantic-settings (env vars / `.env` file) |
| Frontend | React 18, Vite |
| Graph rendering | [@xyflow/react](https://reactflow.dev/) (React Flow v12) |
| Graph layout | [dagre](https://github.com/dagrejs/dagre) |
| SQL editor | CodeMirror 6 with `@codemirror/lang-sql` |
| Styling | Tailwind CSS v3 |

---

## Project Structure

```
lineage/                        # Core lineage engine (pure Python, no HTTP)
  parser/
    lineage_map.py              # LineageMap — main parse + graph class
  models/
    nodes.py                    # TableNode, ColumnNode, bidirectional edges
  serializers.py                # to_react_flow(), to_pickle(), from_pickle()
  exceptions.py                 # LineageException, TableNotFoundException

server/                         # FastAPI application
  main.py                       # App factory — CORS, rate limiter, routers
  config.py                     # Settings via pydantic-settings
  redis.py                      # Async Redis client (lifespan-managed)
  rate_limiter.py               # RateLimitMiddleware (fixed-window, Redis)
  dependencies.py               # Session load/save (Redis + pickle)
  routes/
    lineage.py                  # POST /api/lineage/visualize|clear|clear-file
    health.py                   # GET /health
  schemas/lineage.py            # Pydantic request/response models
  services/lineage_service.py   # Orchestration — no HTTP knowledge

frontend/src/
  App.jsx                       # Root layout — sidebar + graph area
  api/lineageApi.js             # Fetch layer — session header, 429 handling
  hooks/
    useLineageApi.js            # Graph state + API calls
    useFileTabs.js              # Multi-tab state
    useThemeDetector.js         # System dark mode detection
  components/
    LineageGraph.jsx            # React Flow canvas, Dagre layout, edge reduction
    TableNode.jsx               # Custom node renderer (table header + columns)
    SqlEditor.jsx               # CodeMirror SQL editor
    ExportButton.jsx            # PNG / SVG export via html-to-image
    SearchBar.jsx               # Table + column search
    NodeContextMenu.jsx         # Right-click menu
    EdgeTooltip.jsx             # Hover tooltip on edges
  models/
    LineageGraphModel.js        # Maps API response to frontend model
  data/demoQueries.js           # Preset SQL queries loaded on startup
```

---

## Running Locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- Redis (running on `localhost:6379`)

### Backend

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the API server
uvicorn server.main:app --reload --port 8000
```

The API is now available at `http://localhost:8000`.
Interactive docs: `http://localhost:8000/docs`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app is now available at `http://localhost:5173`.
Vite proxies all `/api` requests to `http://localhost:8000`.

### Environment Variables

Create a `.env` file in the project root to override defaults:

```env
REDIS_URL=redis://localhost:6379/0
SESSION_TTL_SECONDS=3600
RATE_LIMIT_PER_MINUTE=30
RATE_LIMIT_CLEAR_PER_MINUTE=10
```

---

## Running with Docker

The included `docker-compose.yml` starts Redis, the backend, and the Nginx-served frontend together.

```bash
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

---

## How the Parser Works

### Scope recursion

The backend uses sqlglot's `qualify()` + `build_scope()` to decompose SQL into nested scopes. Each scope (SELECT, subquery, CTE branch) becomes a `TableNode`. The parser recurses depth-first:

```
parse_sql(sql)
  └── _parse_scope(root_scope)          ← the outer SELECT
        ├── _process_select_columns()   ← builds col_mappings
        ├── _process_sources()
        │     ├── _parse_table()        ← base table reference
        │     └── _parse_scope()        ← subquery / CTE  (recurse)
        └── _connect_column_lineage()   ← wires edges using col_mappings
```

### Two-phase column wiring

Column lineage cannot be wired in a single pass because sources are not yet known when columns are first parsed. The parser uses a deferred approach:

1. **Phase 1 — `_process_select_columns`**: For each output column, record which `(source_table, source_column)` it derives from into `TableNode.col_mappings`.
2. **Phase 2 — `_connect_column_lineage`**: Once all source `TableNode`s exist, resolve `col_mappings` entries into actual `ColumnNode.upstream` edges.

This means `col_mappings` is also retained after parsing — when a base table is later extended with column definitions via `extend_table()`, `_reconnect_column_lineage()` replays the mapping to wire the previously missing edges.

### Multi-file session graph

`LineageMap` accumulates state across multiple `parse_sql()` calls. Each call is tagged with a `file_name`. When the same file is re-submitted, `clear_file()` runs first to remove only that file's nodes — shared base tables referenced by other files are preserved using a fixpoint algorithm over the `file_names` set on each node.

---

## API Reference

### `POST /api/lineage/visualize`

Parse SQL and return the full graph.

```json
// Request
{ "sql": "SELECT ...", "file_name": "query_1" }

// Response — React Flow-compatible
{
  "nodes": [{ "id": "orders", "type": "tableNode", "data": { ... }, "position": { ... } }],
  "edges": [{ "id": "...", "source": "orders", "target": "revenue_cte", "edge_type": "column_edge", ... }]
}
```

### `POST /api/lineage/clear-file`

Remove a specific file's lineage from the session graph.

```json
{ "file_name": "query_1" }
```

### `POST /api/lineage/clear`

Clear all lineage state for the session.

### `GET /health`

Returns `{ "status": "ok" }`. Use for container health checks.

**Session identity** is resolved from the `X-Session-Id` header first, then the `session_id` cookie. A new UUID is issued if neither is present.

**Rate limits:** 30 requests/min on `/visualize`, 10 requests/min on clear endpoints. Keyed per session. Returns `429` with a `Retry-After` header when exceeded.

---

## Known Limitations

- `MERGE` lineage currently traces `WHEN NOT MATCHED THEN INSERT` only; `WHEN MATCHED THEN UPDATE SET` column assignments are not yet wired.
- Base tables without a `CREATE TABLE` definition appear in the graph without columns — column-level edges to them are not drawn until the table is extended.
- Session state is serialized with `pickle`, which ties stored sessions to the current Python class layout. Clearing Redis resolves any deserialization errors after a code change.
