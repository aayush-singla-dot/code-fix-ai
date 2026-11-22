"""Comprehensive end-to-end verification script for Code-Fix AI."""

import asyncio
import os
import sys
import time
from uuid import UUID

sys.path.insert(0, "apps/api")

from app.config import settings
from app.database import check_db_connection, get_engine
from app.main import app
from app.services.ai_fix_service import AIFixService
from app.services.analysis_service import AnalysisService
from app.services.repository_service import RepositoryService
from app.services.vector_service import VectorService
from sqlalchemy import text


async def run_all_checks():
    results = {}
    print("=" * 60)
    print("CODE-FIX AI: COMPREHENSIVE VERIFICATION SUITE")
    print("=" * 60)

    # 1. Backend startup and imports
    try:
        paths = list(app.openapi()["paths"].keys())
        assert len(paths) >= 10
        results["1. Backend Imports & Routes"] = f"PASS ({len(paths)} routes registered)"
    except Exception as e:
        results["1. Backend Imports & Routes"] = f"FAIL ({e})"

    # 2. Supabase DB connectivity
    try:
        is_conn, msg = await check_db_connection()
        if is_conn:
            results["2. Supabase PostgreSQL Connectivity"] = "PASS (SELECT 1 succeeded)"
        else:
            results["2. Supabase PostgreSQL Connectivity"] = f"FAIL ({msg})"
    except Exception as e:
        results["2. Supabase PostgreSQL Connectivity"] = f"FAIL ({e})"

    # 3. Gemini API Configuration
    try:
        import httpx

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key={settings.GOOGLE_API_KEY}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(
                url,
                json={"contents": [{"parts": [{"text": "Say 'OK'"}]}]},
            )
            if res.status_code == 200:
                results["3. Gemini API Configuration"] = "PASS (HTTP 200 from gemini-flash-lite-latest)"
            else:
                results["3. Gemini API Configuration"] = f"FAIL (HTTP {res.status_code})"
    except Exception as e:
        results["3. Gemini API Configuration"] = f"FAIL ({e})"

    # 4. Repository & Vector Store Check
    repo_id = None
    try:
        repos = await RepositoryService.list_repositories()
        if repos:
            repo = repos[0]
            repo_id = UUID(repo["id"])
            results["4. Repository Ingestion & Chunks"] = (
                f"PASS (Found '{repo['full_name']}' with {repo['chunk_count']} indexed chunks)"
            )
        else:
            results["4. Repository Ingestion & Chunks"] = "WARN (No repositories indexed yet)"
    except Exception as e:
        results["4. Repository Ingestion & Chunks"] = f"FAIL ({e})"

    # 5. Semantic Vector Retrieval
    if repo_id:
        try:
            chunks = await VectorService.semantic_search(
                repository_id=repo_id,
                query="import os sys",
                top_k=2,
            )
            results["5. pgvector Semantic Search"] = f"PASS (Retrieved {len(chunks)} chunks via cosine distance)"
        except Exception as e:
            results["5. pgvector Semantic Search"] = f"FAIL ({e})"
    else:
        results["5. pgvector Semantic Search"] = "SKIPPED"

    # 6. Static Analysis Findings
    finding_id = None
    if repo_id:
        try:
            findings_res = await AnalysisService.get_findings(repo_id)
            findings = findings_res.findings
            if findings:
                finding_id = findings[0].id
                results["6. Static Analysis Findings"] = (
                    f"PASS (Repository has {len(findings)} findings, top rule: {findings[0].rule_id})"
                )
            else:
                results["6. Static Analysis Findings"] = "WARN (Zero findings in repository)"
        except Exception as e:
            results["6. Static Analysis Findings"] = f"FAIL ({e})"
    else:
        results["6. Static Analysis Findings"] = "SKIPPED"

    # 7. AI Fix Generation & Isolated AST Validation
    if repo_id and finding_id:
        try:
            fix = await AIFixService.get_or_generate_fix(
                repository_id=repo_id,
                finding_id=finding_id,
                force_regenerate=False,
            )
            results["7. AI Fix Generation & Sandbox AST Validation"] = (
                f"PASS (Status: {fix.validation_status}, Diff length: {len(fix.diff_patch)} chars)"
            )
        except Exception as e:
            results["7. AI Fix Generation & Sandbox AST Validation"] = f"FAIL ({e})"
    else:
        results["7. AI Fix Generation & Sandbox AST Validation"] = "SKIPPED"

    # 8. Fix Persistence in Supabase
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            res = await conn.execute(text("SELECT count(*)::int FROM finding_fixes;"))
            count = res.scalar()
            results["8. Supabase finding_fixes Storage"] = f"PASS ({count} verified fixes stored)"
    except Exception as e:
        results["8. Supabase finding_fixes Storage"] = f"FAIL ({e})"

    print("\nRESULTS SUMMARY:")
    for check, status in results.items():
        print(f"  {check}: {status}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(run_all_checks())

