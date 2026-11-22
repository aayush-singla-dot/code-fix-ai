"""Ruff static analysis engine integration."""

import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional
from uuid import UUID

from app.schemas.analysis import ConfidenceLevel, FindingCreate, SeverityLevel

logger = logging.getLogger("code_fix_ai.ruff_service")


class RuffAnalysisService:
    @classmethod
    def _get_ruff_executable(cls) -> str:
        """Locate the ruff binary inside the active virtualenv or PATH."""
        venv_scripts = Path(sys.prefix) / "Scripts" / "ruff.exe"
        if venv_scripts.exists():
            return str(venv_scripts)

        venv_bin = Path(sys.prefix) / "bin" / "ruff"
        if venv_bin.exists():
            return str(venv_bin)

        found = shutil.which("ruff")
        if found:
            return found

        return "ruff"

    @classmethod
    def _map_severity(cls, code: str) -> SeverityLevel:
        """Map Ruff rule codes to unified severity categories."""
        code_upper = code.upper()

        # Critical/High Security (flake8-bandit) & Runtime Crash bugs
        if code_upper in {"S102", "S105", "S106", "S107", "S301", "S302", "S307", "S602"}:
            return SeverityLevel.HIGH
        if code_upper.startswith("S"):
            return SeverityLevel.MEDIUM

        # Undefined variables / syntax issues
        if code_upper in {"F821", "F822", "F823", "F831", "F704", "F706"}:
            return SeverityLevel.HIGH

        # General Pyflakes & Bugbear
        if code_upper.startswith("F") or code_upper.startswith("B"):
            return SeverityLevel.MEDIUM

        # Style errors
        if code_upper.startswith("E"):
            return SeverityLevel.LOW

        # Warnings, import sorting, and simplification
        if code_upper.startswith("W") or code_upper.startswith("I") or code_upper.startswith("SIM"):
            return SeverityLevel.INFORMATIONAL

        return SeverityLevel.LOW

    @classmethod
    def _extract_code_snippet(cls, file_path: Path, start_line: int, end_line: int) -> Optional[str]:
        """Extract source code snippet surrounding finding lines."""
        try:
            if not file_path.exists() or not file_path.is_file():
                return None
            lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
            s_idx = max(0, start_line - 1)
            e_idx = min(len(lines), end_line)
            snippet = "\n".join(lines[s_idx:e_idx])
            return snippet.strip() if snippet.strip() else None
        except Exception:
            return None

    @classmethod
    def analyze_directory(
        cls,
        repo_dir: Path,
        repository_id: UUID,
        timeout_seconds: int = 45,
    ) -> List[FindingCreate]:
        """Run Ruff on repo_dir, parse JSON violations, and return normalized FindingCreate records."""
        ruff_bin = cls._get_ruff_executable()
        cmd = [
            ruff_bin,
            "check",
            str(repo_dir),
            "--select",
            "F,E,W,I,B,SIM,S",
            "--output-format",
            "json",
            "--no-fix",
            "--exit-zero",
            "--isolated",
        ]

        logger.info("Running Ruff on %s", repo_dir)
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired:
            logger.error("Ruff execution timed out after %ds on %s", timeout_seconds, repo_dir)
            return []
        except Exception as exc:
            logger.error("Failed to execute Ruff: %s", exc, exc_info=True)
            return []

        if not proc.stdout.strip():
            return []

        try:
            raw_findings = json.loads(proc.stdout)
        except json.JSONDecodeError as err:
            logger.error("Failed to parse Ruff JSON output: %s", err)
            return []

        findings: List[FindingCreate] = []
        for item in raw_findings:
            raw_filename = item.get("filename", "")
            try:
                full_path = Path(raw_filename)
                rel_path = str(full_path.relative_to(repo_dir)).replace("\\", "/")
            except ValueError:
                rel_path = Path(raw_filename).name

            start_loc = item.get("location") or {}
            end_loc = item.get("end_location") or {}
            start_line = start_loc.get("row", 1)
            end_line = end_loc.get("row", start_line)
            start_col = start_loc.get("column", 1)
            end_col = end_loc.get("column", 1)

            rule_code = item.get("code") or "RUFF_ISSUE"
            message = item.get("message") or "Ruff finding"
            severity = cls._map_severity(rule_code)

            code_snippet = cls._extract_code_snippet(Path(raw_filename), start_line, end_line)

            # Deterministic fingerprint
            fp_raw = f"ruff:{rule_code}:{rel_path}:{start_line}:{message}"
            fingerprint = hashlib.sha256(fp_raw.encode("utf-8")).hexdigest()

            rule_url = item.get("url")
            desc = f"Rule code: {rule_code}. {message}"
            if rule_url:
                desc += f"\nDocumentation: {rule_url}"

            findings.append(
                FindingCreate(
                    repository_id=repository_id,
                    scanner="ruff",
                    rule_id=rule_code,
                    title=f"[{rule_code}] {message}",
                    description=desc,
                    severity=severity,
                    confidence=ConfidenceLevel.HIGH,
                    file_path=rel_path,
                    start_line=start_line,
                    end_line=end_line,
                    start_column=start_col,
                    end_column=end_col,
                    code_snippet=code_snippet,
                    fingerprint=fingerprint,
                )
            )

        logger.info("Ruff analysis generated %d findings for repo %s", len(findings), repository_id)
        return findings

