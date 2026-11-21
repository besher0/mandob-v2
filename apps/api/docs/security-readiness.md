# Security and capacity readiness — 2026-10-11

Implemented in the current single API process:
- 3,000 requests/minute aggregate, checked before authentication lookup.
- 300 login requests/minute aggregate; 10 per exact trimmed username/minute.
- 240 requests/minute per verified account before current grants are loaded.
- 20 heavy requests/minute per account; import/export/reports have 4 concurrent slots.
- 100 execution slots shared by authentication checks and handlers; released between phases. Request-body parsing is still outside this cap.
- Rejections return 429, an Arabic message and Retry-After. No request is queued or silently recorded.
- In-memory fixed-window buckets capped at 10,000 entries; expired entries reclaimed. Limits reset on process restart. They are provisional, not load-tested capacity guarantees.
- Round serialization conflicts retry twice with jitter and the same clientRef. Uniqueness/replay and atomic writes retained.
- Pool configurable via DB_POOL_MAX (default 10), 5s connection wait, 30s idle expiry.
- CORS_ORIGINS exact comma-separated allowlist. Default localhost/127.0.0.1:3100. Mobile uses the same-origin Next proxy.
- API responses no-store, nosniff, DENY framing and no-referrer.

Deployment blockers / remaining work:
- Shared distributed limits at a trusted gateway or Redis before multiple API instances. Proxy currently coalesces client addresses; do not trust arbitrary X-Forwarded-For. Login username limit alone can be abused to temporarily deny a victim; add trusted-IP/device controls at the edge.
- Edge DDoS protection and request/body/concurrent-connection limits BEFORE Node and authentication.
- HTTPS, firewall/private DB, secret rotation, removal of development accounts, production environment validation.
- Browser session migration from localStorage to secure HttpOnly cookies with CSRF/origin controls, plus CSP/headers on the actual frontend. Not implemented by this pass.
- Automated encrypted backups, verified restore, monitoring and alerts. Not configured.
- Dedicated staging database/load generator for 200 simultaneous representative registrations and larger bursts. Verify exact committed visit counts, replay, latency/error/DB metrics. No load traffic against operating data.
- External security review. Passing functional tests is not penetration testing.

Limits above are current code defaults; tune against staging measurements, not user count alone.
