"""GitHub OAuth authentication router."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from app.config import settings
from app.schemas.github import GitHubAuthStatusResponse
from app.services.github_service import GitHubService

logger = logging.getLogger("code_fix_ai.routers.auth")

router = APIRouter(prefix="/api/auth/github", tags=["GitHub Authentication"])


@router.get("/status", response_model=GitHubAuthStatusResponse)
async def get_github_auth_status():
    """Check GitHub OAuth configuration and current authentication status."""
    is_configured = GitHubService.is_oauth_configured()
    user = await GitHubService.get_authenticated_user() if is_configured else None
    authenticated = user is not None

    login_url = None
    if is_configured:
        try:
            login_url, _ = GitHubService.get_authorization_url()
        except Exception:
            login_url = None

    if not is_configured:
        msg = (
            "GitHub OAuth is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env "
            "to enable GitHub sign-in."
        )
    elif authenticated:
        msg = f"Authenticated as GitHub user: {user.get('login')}"
    else:
        msg = "GitHub OAuth configured. Ready for developer authorization."

    return GitHubAuthStatusResponse(
        configured=is_configured,
        authenticated=authenticated,
        username=user.get("login") if user else None,
        login_url=login_url,
        client_id_configured=bool(settings.GITHUB_CLIENT_ID),
        message=msg,
    )


@router.get("/login")
async def github_login(redirect_uri: Optional[str] = Query(None)):
    """Initiate GitHub OAuth login flow. Redirects to GitHub authorization page."""
    if not GitHubService.is_oauth_configured():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "GitHub OAuth is not configured. Please register an OAuth App in GitHub Developer Settings "
                "with Authorization callback URL: http://localhost:8000/api/auth/github/callback, "
                "and populate GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in root .env."
            ),
        )

    auth_url, _ = GitHubService.get_authorization_url(redirect_uri=redirect_uri)
    return RedirectResponse(url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/callback")
async def github_callback(
    code: str = Query(..., description="Authorization code returned by GitHub"),
    state: str = Query(..., description="CSRF protection state token"),
):
    """Handle GitHub OAuth callback, exchange code for access token."""
    try:
        await GitHubService.exchange_code_for_token(code=code, state=state)
        # Redirect back to frontend dashboard
        frontend_url = settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else "http://localhost:3000"
        return RedirectResponse(
            url=f"{frontend_url}/?auth=success",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )
    except Exception as exc:
        logger.error("OAuth callback failure: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"GitHub OAuth authorization failed: {str(exc)}",
        )

