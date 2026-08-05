"""Rate limiting middleware and utilities."""

import time
import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from threading import Lock
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware




@dataclass
class RateLimitConfig:
    """Configuration for rate limiting."""
    requests: int  # Number of requests allowed
    window: int  # Time window in seconds
    
    
@dataclass
class TokenBucket:
    """Token bucket for rate limiting."""
    tokens: float
    last_update: float = field(default_factory=time.time)


class RateLimiter:
    """
    In-memory rate limiter using token bucket algorithm.
    
    For production, consider using Redis for distributed rate limiting.
    """
    
    def __init__(self):
        # Store buckets per key (IP or user ID)
        self._buckets: dict[str, dict[str, TokenBucket]] = defaultdict(dict)
        self._lock = Lock()
        self._cleanup_task_started = False
        
    def start_cleanup_task(self) -> None:
        if not self._cleanup_task_started:
            self._cleanup_task_started = True
            asyncio.create_task(self._cleanup_loop())
            
    async def _cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(3600)
            self.cleanup_old_buckets()
    
    def _get_bucket(self, key: str, endpoint: str, config: RateLimitConfig) -> TokenBucket:
        """Get or create a token bucket for the given key and endpoint."""
        if endpoint not in self._buckets[key]:
            self._buckets[key][endpoint] = TokenBucket(tokens=float(config.requests))
        return self._buckets[key][endpoint]
    
    def _refill_tokens(self, bucket: TokenBucket, config: RateLimitConfig) -> None:
        """Refill tokens based on time elapsed."""
        now = time.time()
        elapsed = now - bucket.last_update
        
        # Calculate tokens to add (requests per second * elapsed time)
        rate = config.requests / config.window
        tokens_to_add = elapsed * rate
        
        bucket.tokens = min(config.requests, bucket.tokens + tokens_to_add)
        bucket.last_update = now
    
    def is_allowed(self, key: str, endpoint: str, config: RateLimitConfig) -> tuple[bool, dict]:
        """
        Check if a request is allowed under the rate limit.
        
        Returns:
            tuple of (is_allowed, headers_dict)
        """
        with self._lock:
            bucket = self._get_bucket(key, endpoint, config)
            self._refill_tokens(bucket, config)
            
            headers = {
                "X-RateLimit-Limit": str(config.requests),
                "X-RateLimit-Remaining": str(max(0, int(bucket.tokens) - 1)),
                "X-RateLimit-Reset": str(int(bucket.last_update + config.window)),
            }
            
            if bucket.tokens >= 1:
                bucket.tokens -= 1
                return True, headers
            
            # Calculate retry after
            rate = config.requests / config.window
            retry_after = int((1 - bucket.tokens) / rate) + 1
            headers["Retry-After"] = str(retry_after)
            
            return False, headers
    
    def cleanup_old_buckets(self, max_age: int = 3600) -> None:
        """Remove buckets that haven't been used in a while."""
        now = time.time()
        keys_to_remove = []
        
        with self._lock:
            for key, endpoints in self._buckets.items():
                endpoints_to_remove = []
                for endpoint, bucket in endpoints.items():
                    if now - bucket.last_update > max_age:
                        endpoints_to_remove.append(endpoint)
                
                for endpoint in endpoints_to_remove:
                    del endpoints[endpoint]
                
                if not endpoints:
                    keys_to_remove.append(key)
            
            for key in keys_to_remove:
                del self._buckets[key]


# Global rate limiter instance
rate_limiter = RateLimiter()


# Rate limit configurations for different endpoints
RATE_LIMITS = {
    # Auth endpoints - stricter limits to prevent brute force
    "auth_login": RateLimitConfig(requests=5, window=60),  # 5 per minute
    "auth_signup": RateLimitConfig(requests=3, window=60),  # 3 per minute
    
    # Chat endpoints - moderate limits
    "chat": RateLimitConfig(requests=20, window=60),  # 20 per minute
    "chat_stream": RateLimitConfig(requests=20, window=60),  # 20 per minute
    
    # Conversation endpoints - generous limits
    "conversations": RateLimitConfig(requests=60, window=60),  # 60 per minute
    
    # Default for other endpoints
    "default": RateLimitConfig(requests=100, window=60),  # 100 per minute
}


def get_client_ip(request: Request) -> str:
    """Extract client IP from request, considering proxies."""
    # Check for forwarded header (when behind proxy/load balancer)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # Take the first IP in the chain
        return forwarded.split(",")[0].strip()
    
    # Fall back to direct client IP
    return request.client.host if request.client else "unknown"


def get_rate_limit_key(request: Request) -> str:
    """
    Get the key for rate limiting.
    
    Uses user ID if authenticated, otherwise falls back to IP.
    """
    # Try to get user from request state (set by auth middleware)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    
    # Fall back to IP
    return f"ip:{get_client_ip(request)}"


def get_endpoint_config(path: str, method: str) -> tuple[str, RateLimitConfig]:
    """Get rate limit config for an endpoint."""
    # Match specific endpoints
    if "/auth/login" in path:
        return "auth_login", RATE_LIMITS["auth_login"]
    elif "/auth/signup" in path:
        return "auth_signup", RATE_LIMITS["auth_signup"]
    elif "/chat/stream" in path:
        return "chat_stream", RATE_LIMITS["chat_stream"]
    elif "/chat" in path and method == "POST":
        return "chat", RATE_LIMITS["chat"]
    elif "/conversations" in path:
        return "conversations", RATE_LIMITS["conversations"]
    
    return "default", RATE_LIMITS["default"]


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Middleware to apply rate limiting to all requests."""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Start cleanup task if not already running
        rate_limiter.start_cleanup_task()
        
        # Skip rate limiting for health checks and docs
        if request.url.path in ["/", "/health", "/docs", "/openapi.json", "/redoc"]:
            return await call_next(request)
        
        # Get rate limit key and config
        key = get_rate_limit_key(request)
        endpoint, config = get_endpoint_config(request.url.path, request.method)
        
        # Check rate limit
        is_allowed, headers = rate_limiter.is_allowed(key, endpoint, config)
        
        if not is_allowed:
            # Return JSONResponse directly instead of raising HTTPException
            # because BaseHTTPMiddleware doesn't handle HTTPException properly
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Try again in {headers.get('Retry-After', '60')} seconds.",
                    "type": "rate_limit_exceeded",
                },
                headers=headers,
            )
        
        # Process request
        response = await call_next(request)
        
        # Add rate limit headers to response
        for header, value in headers.items():
            response.headers[header] = value
        
        return response


