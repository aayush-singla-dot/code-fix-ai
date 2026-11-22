"""GitHub OAuth, API integration, and repository cloning service."""

import logging
import os
import re
import secrets
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import httpx
from app.config import settings

logger = logging.getLogger("code_fix_ai.github_service")

# In-memory token store for sessions/developer tokens (keyed by session_id/state)
_OAUTH_STATES: Dict[str, dict] = {}
_ACTIVE_TOKENS: Dict[str, str] = {}  # user_id/session_id -> access_token

# Security constants
MAX_REPO_CLONE_DEPTH = 1
MAX_FILE_SIZE_BYTES = 512 * 1024  # 512 KB per file
MAX_TOTAL_FILES = 1000  # Cap on files processed per repo

IGNORED_DIRECTORIES = {
    ".git",
    ".github",
    ".vscode",
    ".idea",
    "node_modules",
    ".next",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".venv",
    "venv",
    "env",
    "build",
    "dist",
    "site-packages",
    "egg-info",
}

IGNORED_FILE_EXTENSIONS = {
    ".pyc",
    ".pyo",
    ".pyd",
    ".so",
    ".dll",
    ".dylib",
    ".exe",
    ".bin",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".mp4",
    ".lock",
}

IGNORED_FILE_NAMES = {
    ".env",
    ".env.local",
    ".env.production",
    "credentials.json",
    "id_rsa",
    "id_rsa.pub",
    "package-lock.json",
    "pnpm-lock.yaml",
    "poetry.lock",
}


class GitHubService:
    @staticmethod
    def is_oauth_configured() -> bool:
        """Check whether GitHub OAuth client credentials are populated in .env."""
        return bool(
            settings.GITHUB_CLIENT_ID
            and settings.GITHUB_CLIENT_SECRET
            and settings.GITHUB_CLIENT_ID.strip()
            and settings.GITHUB_CLIENT_SECRET.strip()
        )

    @classmethod
    def get_authorization_url(cls, redirect_uri: Optional[str] = None) -> Tuple[str, str]:
        """Generate GitHub OAuth authorization URL with state CSRF protection."""
        if not cls.is_oauth_configured():
            raise ValueError(
                "GitHub OAuth is not configured. GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set in .env."
            )

        state = secrets.token_urlsafe(32)
        _OAUTH_STATES[state] = {"created_at": os.times().elapsed}

        callback_url = (
            redirect_uri
            or f"{settings.WORKER_URL.rstrip('/')}/api/auth/github/callback"
        )
        # Least privilege: repo scope allows reading private/public repos and opening pull requests
        scope = "repo read:user user:email"
        auth_url = (
            f"https://github.com/login/oauth/authorize"
            f"?client_id={settings.GITHUB_CLIENT_ID}"
            f"&redirect_uri={callback_url}"
            f"&scope={scope}"
            f"&state={state}"
        )
        return auth_url, state

    @classmethod
    async def exchange_code_for_token(cls, code: str, state: str) -> str:
        """Exchange GitHub OAuth authorization code for an access token."""
        if not cls.is_oauth_configured():
            raise ValueError("GitHub OAuth credentials not configured.")

        if state not in _OAUTH_STATES:
            raise ValueError("Invalid or expired OAuth state token (CSRF check failed).")

        # Invalidate state after one-time use
        del _OAUTH_STATES[state]

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                "https://github.com/login/oauth/access_token",
                headers={"Accept": "application/json"},
                data={
                    "client_id": settings.GITHUB_CLIENT_ID,
                    "client_secret": settings.GITHUB_CLIENT_SECRET,
                    "code": code,
                },
            )

        if response.status_code != 200:
            raise RuntimeError(f"GitHub token exchange failed: {response.text}")

        token_data = response.json()
        if "error" in token_data:
            raise ValueError(
                f"GitHub OAuth error: {token_data.get('error_description', token_data['error'])}"
            )

        access_token = token_data.get("access_token")
        if not access_token:
            raise ValueError("No access_token returned by GitHub.")

        # Store in session store
        _ACTIVE_TOKENS["current_user"] = access_token
        logger.info("Successfully exchanged GitHub OAuth token.")
        return access_token

    @classmethod
    def get_stored_token(cls) -> Optional[str]:
        """Retrieve stored access token or fallback to environment token if available."""
        return _ACTIVE_TOKENS.get("current_user") or os.getenv("GITHUB_TOKEN")

    @classmethod
    async def get_authenticated_user(cls) -> Optional[dict]:
        """Fetch current authenticated GitHub user profile."""
        token = cls.get_stored_token()
        if not token:
            return None

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get("https://api.github.com/user", headers=headers)
            if resp.status_code == 200:
                return resp.json()
            return None

    @classmethod
    async def list_repositories(cls) -> List[dict]:
        """List repositories accessible to the authenticated user."""
        token = cls.get_stored_token()
        if not token:
            return []

        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://api.github.com/user/repos?sort=updated&per_page=50",
                headers=headers,
            )
            if resp.status_code != 200:
                logger.error("Failed to list GitHub repos: %s", resp.text)
                return []

            repos = resp.json()
            return [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "full_name": r["full_name"],
                    "owner": r["owner"]["login"],
                    "default_branch": r.get("default_branch", "main"),
                    "html_url": r["html_url"],
                    "is_private": r.get("private", False),
                    "description": r.get("description"),
                }
                for r in repos
            ]

    @staticmethod
    def parse_repo_url(repo_url: str) -> Tuple[str, str, str]:
        """Extract owner, name, and normalized full_name from repository URL.

        Supports https://github.com/owner/repo or owner/repo format.
        """
        cleaned = repo_url.strip().rstrip("/")
        # Matches https://github.com/owner/name or github.com/owner/name or owner/name
        match = re.search(r"(?:https?://)?(?:www\.)?github\.com/([^/]+)/([^/]+?)(?:\.git)?$", cleaned)
        if match:
            owner, name = match.group(1), match.group(2)
            return owner, name, f"{owner}/{name}"

        # Direct owner/repo string
        parts = cleaned.split("/")
        if len(parts) == 2 and all(p.isalnum() or "-" in p or "_" in p for p in parts):
            return parts[0], parts[1], f"{parts[0]}/{parts[1]}"

        raise ValueError(f"Invalid GitHub repository URL or format: {repo_url}")

    @classmethod
    def clone_repository(
        cls,
        repo_url: str,
        branch: Optional[str] = None,
        target_dir: Optional[Path] = None,
    ) -> Tuple[Path, str]:
        """Shallow clone a public or authenticated repository into an isolated directory.

        Returns (clone_path, commit_sha). Cleans up tokens from any logging.
        """
        owner, name, full_name = cls.parse_repo_url(repo_url)
        dest_dir = target_dir or Path(tempfile.mkdtemp(prefix=f"cfai_{owner}_{name}_"))

        # Build clean clone URL (inject token into URL if authenticated)
        token = cls.get_stored_token()
        if token:
            clone_target = f"https://x-access-token:{token}@github.com/{full_name}.git"
        else:
            clone_target = f"https://github.com/{full_name}.git"

        cmd = ["git", "clone", "--depth", str(MAX_REPO_CLONE_DEPTH)]
        if branch:
            cmd.extend(["--branch", branch])
        cmd.extend([clone_target, str(dest_dir)])

        # Run git clone without echoing token to stdout
        masked_cmd = [
            arg if (not token or token not in arg) else f"https://****@github.com/{full_name}.git"
            for arg in cmd
        ]
        logger.info("Executing clone: %s", " ".join(masked_cmd))

        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=60,
        )

        # Fallback if requested branch is not found on remote (e.g. repo uses master instead of main)
        if res.returncode != 0 and branch and "not found in upstream origin" in res.stderr:
            logger.warning(
                "Branch '%s' not found for %s, falling back to remote HEAD default branch",
                branch,
                full_name,
            )
            shutil.rmtree(dest_dir, ignore_errors=True)
            fallback_cmd = ["git", "clone", "--depth", str(MAX_REPO_CLONE_DEPTH), clone_target, str(dest_dir)]
            res = subprocess.run(
                fallback_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=60,
            )

        if res.returncode != 0:
            # Clean up destination directory on clone failure
            shutil.rmtree(dest_dir, ignore_errors=True)
            # Mask token in error output
            err_msg = res.stderr if not token else res.stderr.replace(token, "****")
            raise RuntimeError(f"Git clone failed: {err_msg.strip()}")

        # Retrieve HEAD commit SHA
        sha_res = subprocess.run(
            ["git", "-C", str(dest_dir), "rev-parse", "HEAD"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10,
        )
        commit_sha = (
            sha_res.stdout.strip()
            if sha_res.returncode == 0
            else "0000000000000000000000000000000000000000"
        )
        logger.info("Repository %s cloned successfully at commit %s", full_name, commit_sha)
        return dest_dir, commit_sha

    @classmethod
    def collect_python_files(cls, repo_dir: Path) -> List[Path]:
        """Walk repository and discover Python (.py) source files obeying exclusion rules."""
        python_files: List[Path] = []

        for root, dirs, files in os.walk(repo_dir):
            current_path = Path(root)

            # Prune ignored directories in-place
            dirs[:] = [
                d
                for d in dirs
                if d not in IGNORED_DIRECTORIES
                and not d.startswith(".")
                and not d.endswith(".egg-info")
            ]

            for file in files:
                if len(python_files) >= MAX_TOTAL_FILES:
                    logger.warning("Reached maximum file ingestion limit (%d files)", MAX_TOTAL_FILES)
                    return python_files

                file_path = current_path / file
                if file.endswith(".py") and file not in IGNORED_FILE_NAMES:
                    # Check file size limit
                    try:
                        if file_path.stat().st_size <= MAX_FILE_SIZE_BYTES:
                            python_files.append(file_path)
                        else:
                            logger.info("Skipping %s (exceeds size limit)", file_path.name)
                    except OSError:
                        continue

        return python_files

