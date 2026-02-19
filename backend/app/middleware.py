"""
Middleware for capturing request metadata for audit logging.
"""
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class AuditMiddleware(BaseHTTPMiddleware):
    """Middleware to capture IP address and user agent for audit logging"""
    
    async def dispatch(self, request: Request, call_next):
        # Store request metadata for use in route handlers
        request.state.ip_address = request.client.host if request.client else None
        request.state.user_agent = request.headers.get("user-agent")
        
        response = await call_next(request)
        return response


def get_request_metadata(request: Request):
    """Extract IP address and user agent from request"""
    return {
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent")
    }
