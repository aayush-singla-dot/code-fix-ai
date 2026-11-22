"""Pydantic schemas for static code analysis (Ruff and Semgrep)."""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class SeverityLevel(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFORMATIONAL = "informational"


class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class FindingBase(BaseModel):
    scanner: str = Field(..., description="Name of scanner: 'ruff' or 'semgrep'")
    rule_id: str = Field(..., description="Unique rule code (e.g. F401, python.lang.security.insecure-hash)")
    title: str = Field(..., description="Short summary or message of the issue")
    description: Optional[str] = Field(None, description="Detailed explanation or recommendation")
    severity: SeverityLevel
    confidence: Optional[ConfidenceLevel] = None
    file_path: str = Field(..., description="Relative file path within repository")
    start_line: int
    end_line: int
    start_column: Optional[int] = None
    end_column: Optional[int] = None
    code_snippet: Optional[str] = None
    fingerprint: str = Field(..., description="Deterministic SHA-256 hash for deduplication")


class FindingCreate(FindingBase):
    repository_id: UUID


class FindingResponse(FindingBase):
    id: UUID
    repository_id: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class AnalysisSummary(BaseModel):
    repository_id: UUID
    total_findings: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    info_count: int
    ruff_count: int
    semgrep_count: int
    last_run_at: Optional[datetime] = None


class FindingsListResponse(BaseModel):
    repository_id: UUID
    findings: List[FindingResponse]
    count: int
    summary: AnalysisSummary


class AnalyzeRequest(BaseModel):
    scanners: Optional[List[str]] = Field(default=["ruff", "semgrep"])

