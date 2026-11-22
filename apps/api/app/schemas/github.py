"""Pydantic schemas for GitHub OAuth and repository listing."""

from typing import List, Optional
from pydantic import BaseModel


class GitHubAuthStatusResponse(BaseModel):
    configured: bool
    authenticated: bool
    username: Optional[str] = None
    login_url: Optional[str] = None
    client_id_configured: bool
    message: str


class GitHubRepositoryItem(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    default_branch: str
    html_url: str
    is_private: bool
    description: Optional[str] = None


class GitHubRepositoriesResponse(BaseModel):
    total: int
    repositories: List[GitHubRepositoryItem]

