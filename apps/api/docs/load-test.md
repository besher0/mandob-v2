# Isolated round concurrency test

Run npm run test:load:isolated from apps/api. Requires a local PostgreSQL account with CREATE DATABASE permission. The runner creates a random medrep_load_* database, migrates/seeds it, provisions 200 representative assignments through real services, then issues 200 simultaneous register calls. The named database is removed in finally. Operating records are not copied or modified. It shares PostgreSQL server resources, so run outside busy hours. Abrupt process termination may require manual cleanup of the named test database.

Assertions: exact round/visit counts match successful requests; replay does not increase counts. Nonzero failure count causes nonzero exit. Reports p50/p95/max and errors. Default pool is 10.

This bypasses HTTP, auth guards, browser session proxy and rate limiting. It is a service/database concurrency regression, NOT a production throughput/SLA benchmark. Dataset has one shared doctor/team/area and one visit per round; larger rounds and multiple companies require separate scenarios.
