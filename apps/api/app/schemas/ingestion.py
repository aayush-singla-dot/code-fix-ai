"""Pydantic schemas for repository ingestion and vector search."""

from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    repository_url: str = Field(
        ...,
        description="Public or authorized GitHub repository URL (e.g. https://github.com/owner/repo)",
        examples=["https://github.com/pallets/click"],
    )
    branch: Optional[str] = Field(
        None,
        description="Optional Git branch name (defaults to repository default branch)",
    )


class IngestResponse(BaseModel):
    repository_id: UUID
    full_name: str
    commit_sha: str
    files_scanned: int
    chunks_extracted: int
    chunks_embedded: int
    status: str
    elapsed_seconds: float
    message: str


class SearchRequest(BaseModel):
    query: str = Field(
        ...,
        description="Natural language or code query to search for",
        examples=["database connection pool", "parse command line arguments"],
    )
    top_k: int = Field(5, ge=1, le=50, description="Maximum number of matches to return")
    threshold: float = Field(0.0, ge=0.0, le=1.0, description="Minimum cosine similarity")


class SearchResultItem(BaseModel):
    id: UUID
    repository_id: UUID
    file_path: str
    chunk_type: str
    symbol_name: Optional[str] = None
    start_line: int
    end_line: int
    content: str
    similarity: float


class SearchResponse(BaseModel):
    repository_id: UUID
    query: str
    matches: List[SearchResultItem]
    count: int

