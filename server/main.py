import sys
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging

# Add parent directory to sys.path to import lineage.py
sys.path.append(str(Path(__file__).parent.parent))

from lineage import LineageMap
from server.models import LineageRequest, LineageResponse

app = FastAPI(title="SQL Lineage API")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For MVP, allow all. In prod, restrict to frontend URL.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger = logging.getLogger("uvicorn")

@app.post("/api/visualize", response_model=LineageResponse)
async def visualize(request: LineageRequest):
    try:
        # Initialize LineageMap (assuming root dir as SQL dir for now)
        # In a real app, this might be configurable
        sql_dir = Path(__file__).parent.parent
        l = LineageMap(sql_directory=str(sql_dir))
        
        # Parse the SQL
        l.parse_sql(request.sql)
        
        # Auto-extend tables if possible (optional, but good for MVP)
        l.auto_extend_missing_tables()
        
        # Convert to JSON for React Flow
        graph_data = l.to_json()
        
        print(graph_data)

        return graph_data
        
    except Exception as e:
        logger.error(f"Error parsing SQL: {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health")
async def health():
    return {"status": "ok"}
