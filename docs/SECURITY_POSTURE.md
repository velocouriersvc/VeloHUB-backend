# Security posture

Last reviewed: 2026-11-04

## Node runtime

The API runs on **Node 24 "Krypton" (24.22.2)**, the current LTS, supported
until 2028-04-30.

It previously ran `node:20-alpine`. Node 20 reached end of life on 2026-04-30,
so for roughly six months the image received no upstream security fixes at all,
including the 21 October 2026 release. The most serious item in that release is
**CVE-2026-111497**: an out-of-bounds write in the Brotli decoder bundled with
Node, where malformed input decompressed through `node:zlib` can corrupt process
memory, up to remote code execution. End-of-life lines are never patched, so the
only fix was moving to a supported line.

That release also fixed TLS hostname verification bypasses (CVE-2026-105483,
CVE-2026-106069, CVE-2026-106072), a `dns.resolve*()` NUL-truncation flaw
(CVE-2026-105482), and a keep-alive response desync (CVE-2026-105481), plus
dependency updates to c-ares, OpenSSL, undici and the bundled CA certificates.

`package.json` declares `engines.node >= 22` so an end-of-life runtime is at
least noisy locally. **When Node 24 approaches its own EOL in April 2028, the
base image in `Dockerfile` must be moved on.**

## Edge hardening

Configured in `src/middleware/security-middleware.ts` and pinned by
`tests/security-middleware.test.ts`. The exceptions below are load bearing:

- `trust proxy` is **1**, not `true`. nginx is the only hop; trusting everything
  would let a client forge `X-Forwarded-For` and defeat the rate limiters.
- `crossOriginResourcePolicy: cross-origin`. Product photos and compliance
  documents stream from MinIO through this API and are loaded by the admin
  dashboard on another origin. helmet's same-origin default breaks every image.
- CSP is **off**. This is a JSON API; the only HTML is Swagger UI, which needs
  inline styles and scripts.
- CORS allows requests with **no Origin header**. The mobile apps and the
  Stripe/Paystack webhooks send none. An unrecognised origin gets no CORS
  headers back rather than a 500.
- The global limiter **skips** webhook delivery, health probes and `/metrics`.
  Throttling a webhook means the provider retries and then gives up.

Rate limits count per pod and the API runs two replicas, so the real ceiling is
about double each configured number.

## Endpoints kept off the public internet

`/metrics` and `/docs` are returned as 404 by nginx (`k8s/nginx/velo-api.conf`)
and remain reachable in-cluster, where Prometheus scrapes
`velo-api-service.velo.svc.cluster.local:3000/metrics`. Swagger is additionally
off at the application level unless `ENABLE_API_DOCS=true`, because it publishes
the whole API surface with "Try it out" enabled and the API key remembered.

## Known advisories accepted, with reasons

`npm audit --omit=dev` reports 9 findings and **0 critical**. None has a fix that
is both non-breaking and safe to apply. Do not "fix" these by running
`npm audit fix --force` - it downgrades minio from 8.0.7 to 7.1.3.

| Package | Why it is accepted |
|---|---|
| `decode-uri-component` | Only 0.5.1 fixes it and that release is **ESM-only**, while `query-string@7` requires it from CommonJS. Forcing it throws `ERR_REQUIRE_ESM` at runtime and breaks every MinIO upload. Reached only when parsing responses from our own in-cluster MinIO. |
| `minio`, `query-string`, `stream-json` | 8.0.7 is the newest release; the advisories are in its pinned transitive deps. Input comes from our own MinIO server, not from users. |
| `glob`, `minimatch` | Pulled in by `swagger-jsdoc` and `typeorm` for startup and migration work over our own paths. The glob advisory needs an `AbortSignal` we never pass. |
| `swagger-jsdoc` | 6.3.0 is the latest release; no upstream fix exists. Parses our own JSDoc at boot. |
| `typeorm` | No fixed 0.3.x exists (0.3.31 is the newest) and 1.x is a major rewrite. The SQL injection is MySQL/MariaDB-only and we run PostgreSQL; the other issue is in `migration:generate`, a developer command. |
| `uuid` | The flaw is in v3/v5/v6 when a `buf` argument is passed. This codebase only ever imports `v4`. |

`qs` is held at `^6.17.1` through `overrides` because it parses query strings
straight off the internet via Express. `tar` is held at `>=7.5.19` for
CVE-2026-59873.

## Container

Runs as the unprivileged `node` user. The process listens on 3000 and writes
nothing to disk - uploads are held in memory by multer and streamed to MinIO -
so it has no reason to run as uid 0.
