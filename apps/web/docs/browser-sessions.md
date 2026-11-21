# Browser sessions

The browser uses /api/browser through a Next route handler. Access and refresh credentials are held in HttpOnly, SameSite=Strict, path-scoped cookies. Responses expose user data and an inert compatibility marker, never the actual tokens. Legacy localStorage credentials are removed; users sign in again.

The handler forwards to the existing Nest API with server-side Authorization, preserves multipart/download responses, coalesces refreshes per old token for five seconds within one process and retries only on 401. Mutating requests require exact Origin matching. External Authorization headers are ignored. Logout revokes the refresh token and clears cookies after upstream success; upstream failure is reported rather than silently pretending logout succeeded.

Deployment: set APP_ORIGIN to the exact public HTTPS origin and SESSION_COOKIE_SECURE=true, and API_INTERNAL_URL to the private API. Local HTTP is deliberately supported for LAN testing, without the Secure flag. Do not deploy HTTP publicly. Multi-instance refresh coalescing needs shared coordination; current map is per process. Existing bearer API remains for compatibility; it is not an authentication bypass and does not accept these cookies.

Verification: mocked route tests cover token redaction, cookies, foreign-origin rejection, refresh, restore, logout. Live local and LAN HTTP tests returned 200 for login/session/workspace/logout and 403 for foreign-origin logout. No mobile browser end-to-end UI test yet; no HTTPS deployment yet.
