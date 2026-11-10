# Runbook: Auth session troubleshooting

## Symptoms

### Users bounced to login about every hour

**Cause (pre-hardening):** Access JWT 1h + SSO idle 30m + no proactive refresh.  
**Fix:** Apply `session-policy.json` (idle 7d / access 20m) + deploy API/web proactive refresh.

Check:

1. Live Keycloak: `ssoSessionIdleTimeout`, `accessTokenLifespan`, client `access.token.lifespan`
2. Browser Network: periodic `POST /auth/refresh` succeeding
3. `/auth/me` includes `accessTokenExpiresAt`

### Login after temporary offline / Maps / background

Should **not** happen. Look for:

- API clearing cookies on 5xx (should return `AUTH_TEMPORARILY_UNAVAILABLE` / 503)
- Frontend redirecting on `FETCH_ERROR` (should not)

### Multi-tab sudden logout after rotation

Enable single-flight (API + web). With `refreshTokenMaxReuse=0`, concurrent refreshes of the **same** unused token coalesce; reuse of an **old** rotated token is a security event (`AUTH_REFRESH_TOKEN_REUSED`).

### Explicit logout does not stick

Confirm Keycloak end-session redirect runs and cookies clear with matching `path`/`sameSite`/`domain`.

### Password reset still allows old refresh

Keycloak admin password reset may not kill sessions depending on realm actions. Prefer “logout all sessions” in Admin Console / Admin API when revoking access. Document gap until automated.

## Log events (sanitized)

| Event                               | Meaning                                   |
| ----------------------------------- | ----------------------------------------- |
| `AUTH_TOKEN_REFRESH_SUCCEEDED`      | Refresh OK                                |
| `AUTH_TOKEN_REFRESH_FAILED`         | See `reason`: invalid / transient / reuse |
| `AUTH_REFRESH_TOKEN_REUSED`         | Rotation reuse detected                   |
| `AUTH_SESSION_EXPIRED`              | Session ended                             |
| `AUTH_LOGOUT_COMPLETED`             | User logout                               |
| `AUTH_PROACTIVE_REFRESH_TRIGGERED`  | Web scheduled refresh                     |
| `AUTH_REFRESH_SINGLE_FLIGHT_JOINED` | Concurrent join                           |
| `AUTH_OFFLINE_REFRESH_DEFERRED`     | Transient; cookies kept                   |

Never log access/refresh tokens.

## Staff magic-link / consumer

Separate systems — see `docs/features/auth-session-management.md`. Do not debug them as Keycloak cookie sessions.
