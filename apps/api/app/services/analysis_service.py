"""Static analysis orchestration service (Ruff + Semgrep) with database persistence."""

import asyncio
import logging
import shutil
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import text
from app.database import get_engine
from app.schemas.analysis import (
    AnalysisSummary,
    FindingCreate,
    FindingResponse,
    FindingsListResponse,
    SeverityLevel,
)
from app.services.github_service import GitHubService
from app.services.repository_service import RepositoryService
from app.services.ruff_service import RuffAnalysisService
from app.services.semgrep_service import SemgrepAnalysisService

logger = logging.getLogger("code_fix_ai.analysis_service")


class AnalysisService:
    @classmethod
    async def run_analysis(
        cls,
        repository_id: UUID,
        scanners: Optional[List[str]] = None,
    ) -> FindingsListResponse:
        """Execute full static code analysis on repository source code."""
        selected_scanners = [s.lower() for s in (scanners or ["ruff", "semgrep"])]

        # 1. Fetch repository record
        repo = await RepositoryService.get_repository_by_id(repository_id)
        if not repo:
            raise ValueError(f"Repository {repository_id} not found.")

        repo_url = repo["repository_url"]
        branch = repo.get("default_branch")

        clone_path = None
        all_findings: List[FindingCreate] = []

        try:
            # 2. Shallow clone repository for isolated static analysis
            logger.info("Cloning %s for static analysis...", repo["full_name"])
            clone_path, _ = await asyncio.to_thread(
                GitHubService.clone_repository,
                repo_url=repo_url,
                branch=branch,
            )

            # 3. Execute scanners in non-blocking worker threads
            tasks = []
            if "ruff" in selected_scanners:
                tasks.append(
                    asyncio.to_thread(
                        RuffAnalysisService.analyze_directory,
                        repo_dir=clone_path,
                        repository_id=repository_id,
                    )
                )
            if "semgrep" in selected_scanners:
                tasks.append(
                    asyncio.to_thread(
                        SemgrepAnalysisService.analyze_directory,
                        repo_dir=clone_path,
                        repository_id=repository_id,
                    )
                )

            scanner_results = await asyncio.gather(*tasks, return_exceptions=True)
            for res in scanner_results:
                if isinstance(res, Exception):
                    logger.error("A static analysis scanner raised an exception: %s", res)
                elif isinstance(res, list):
                    all_findings.extend(res)

        finally:
            # 4. Clean up scratch clone directory
            if clone_path and clone_path.exists():
                logger.info("Cleaning up analysis clone directory: %s", clone_path)
                shutil.rmtree(clone_path, ignore_errors=True)

        # 5. Persist findings to Supabase
        engine = get_engine()
        async with engine.begin() as conn:
            for f in all_findings:
                await conn.execute(
                    text("""
                        INSERT INTO analysis_findings (
                            repository_id,
                            scanner,
                            rule_id,
                            title,
                            description,
                            severity,
                            confidence,
                            file_path,
                            start_line,
                            end_line,
                            start_column,
                            end_column,
                            code_snippet,
                            fingerprint
                        ) VALUES (
                            CAST(:repo_id AS uuid),
                            :scanner,
                            :rule_id,
                            :title,
                            :description,
                            :severity,
                            :confidence,
                            :file_path,
                            :start_line,
                            :end_line,
                            :start_column,
                            :end_column,
                            :code_snippet,
                            :fingerprint
                        )
                        ON CONFLICT (repository_id, scanner, fingerprint) DO UPDATE
                        SET title = EXCLUDED.title,
                            description = EXCLUDED.description,
                            severity = EXCLUDED.severity,
                            confidence = EXCLUDED.confidence,
                            start_line = EXCLUDED.start_line,
                            end_line = EXCLUDED.end_line,
                            code_snippet = EXCLUDED.code_snippet;
                    """),
                    {
                        "repo_id": str(f.repository_id),
                        "scanner": f.scanner,
                        "rule_id": f.rule_id,
                        "title": f.title,
                        "description": f.description,
                        "severity": f.severity.value,
                        "confidence": f.confidence.value if f.confidence else None,
                        "file_path": f.file_path,
                        "start_line": f.start_line,
                        "end_line": f.end_line,
                        "start_column": f.start_column,
                        "end_column": f.end_column,
                        "code_snippet": f.code_snippet,
                        "fingerprint": f.fingerprint,
                    },
                )

        # 6. Retrieve summary and findings
        return await cls.get_findings(repository_id)

    @classmethod
    async def get_summary(cls, repository_id: UUID) -> AnalysisSummary:
        """Compute summary counts for a repository's static analysis findings."""
        engine = get_engine()
        async with engine.connect() as conn:
            res = await conn.execute(
                text("""
                    SELECT
                        COUNT(*)::int AS total,
                        COUNT(CASE WHEN severity = 'critical' THEN 1 END)::int AS critical_count,
                        COUNT(CASE WHEN severity = 'high' THEN 1 END)::int AS high_count,
                        COUNT(CASE WHEN severity = 'medium' THEN 1 END)::int AS medium_count,
                        COUNT(CASE WHEN severity = 'low' THEN 1 END)::int AS low_count,
                        COUNT(CASE WHEN severity = 'informational' THEN 1 END)::int AS info_count,
                        COUNT(CASE WHEN scanner = 'ruff' THEN 1 END)::int AS ruff_count,
                        COUNT(CASE WHEN scanner = 'semgrep' THEN 1 END)::int AS semgrep_count,
                        MAX(created_at) AS last_run_at
                    FROM analysis_findings
                    WHERE repository_id = CAST(:repo_id AS uuid);
                """),
                {"repo_id": str(repository_id)},
            )
            row = res.fetchone()

        return AnalysisSummary(
            repository_id=repository_id,
            total_findings=row.total if row else 0,
            critical_count=row.critical_count if row else 0,
            high_count=row.high_count if row else 0,
            medium_count=row.medium_count if row else 0,
            low_count=row.low_count if row else 0,
            info_count=row.info_count if row else 0,
            ruff_count=row.ruff_count if row else 0,
            semgrep_count=row.semgrep_count if row else 0,
            last_run_at=row.last_run_at if row else None,
        )

    @classmethod
    async def get_findings(
        cls,
        repository_id: UUID,
        scanner: Optional[str] = None,
        severity: Optional[str] = None,
    ) -> FindingsListResponse:
        """Fetch list of findings for a repository with optional filters."""
        engine = get_engine()
        query_str = """
            SELECT
                id,
                repository_id,
                scanner,
                rule_id,
                title,
                description,
                severity,
                confidence,
                file_path,
                start_line,
                end_line,
                start_column,
                end_column,
                code_snippet,
                fingerprint,
                created_at
            FROM analysis_findings
            WHERE repository_id = CAST(:repo_id AS uuid)
        """
        params = {"repo_id": str(repository_id)}

        if scanner:
            query_str += " AND scanner = :scanner"
            params["scanner"] = scanner.lower()

        if severity:
            query_str += " AND severity = :severity"
            params["severity"] = severity.lower()

        query_str += " ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 ELSE 5 END, file_path, start_line;"

        async with engine.connect() as conn:
            res = await conn.execute(text(query_str), params)
            rows = res.fetchall()

        findings = [
            FindingResponse(
                id=r.id,
                repository_id=r.repository_id,
                scanner=r.scanner,
                rule_id=r.rule_id,
                title=r.title,
                description=r.description,
                severity=SeverityLevel(r.severity),
                confidence=r.confidence,
                file_path=r.file_path,
                start_line=r.start_line,
                end_line=r.end_line,
                start_column=r.start_column,
                end_column=r.end_column,
                code_snippet=r.code_snippet,
                fingerprint=r.fingerprint,
                created_at=r.created_at,
            )
            for r in rows
        ]

        summary = await cls.get_summary(repository_id)

        return FindingsListResponse(
            repository_id=repository_id,
            findings=findings,
            count=len(findings),
            summary=summary,
        )

    @classmethod
    async def get_finding_by_id(cls, finding_id: UUID) -> Optional[FindingResponse]:
        """Fetch a single finding by UUID."""
        engine = get_engine()
        async with engine.connect() as conn:
            res = await conn.execute(
                text("""
                    SELECT
                        id,
                        repository_id,
                        scanner,
                        rule_id,
                        title,
                        description,
                        severity,
                        confidence,
                        file_path,
                        start_line,
                        end_line,
                        start_column,
                        end_column,
                        code_snippet,
                        fingerprint,
                        created_at
                    FROM analysis_findings
                    WHERE id = CAST(:id AS uuid);
                """),
                {"id": str(finding_id)},
            )
            r = res.fetchone()
            if not r:
                return None

        return FindingResponse(
            id=r.id,
            repository_id=r.repository_id,
            scanner=r.scanner,
            rule_id=r.rule_id,
            title=r.title,
            description=r.description,
            severity=SeverityLevel(r.severity),
            confidence=r.confidence,
            file_path=r.file_path,
            start_line=r.start_line,
            end_line=r.end_line,
            start_column=r.start_column,
            end_column=r.end_column,
            code_snippet=r.code_snippet,
            fingerprint=r.fingerprint,
            created_at=r.created_at,
        )

