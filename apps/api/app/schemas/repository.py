"""Pydantic schemas for repository metadata management."""

from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class RepositoryBase(BaseModel):
    name: str
    owner: str
    full_name: str
    default_branch: str = "main"
    repository_url: str


class RepositoryCreate(RepositoryBase):
    github_repo_id: Optional[int] = None
    indexed_commit_sha: Optional[str] = None


class RepositoryResponse(RepositoryBase):
    id: UUID
    user_id: Optional[str] = None
    github_repo_id: Optional[int] = None
    indexed_commit_sha: Optional[str] = None
    indexing_status: str
    chunk_count: Optional[int] = 0
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

