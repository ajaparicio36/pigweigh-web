# PostgreSQL and Railway deployment readiness

Read-only platform inspection on 2026-10-19. The user selected PostgreSQL and Railway for both applications, then explicitly approved a dedicated PigWeigh project with web, API and PostgreSQL services. This supersedes SQLite in the proposed implementation contract. No remote resources or variables were created or changed during this inspection; the coordinating agent owns provisioning.

## Account and local evidence

- Railway connector and CLI show workspace **Anthony John's Projects** (workspace ID `58986dc8-8671-4a3b-a7de-5255587bc825`). CLI version is 5.30.3 and authenticated as Anthony John. No credentials were requested or printed.
- Existing projects are `health-ier-clinic-demo-v1-1`, `koi-learned`, and `Get Gains`. None matches PigWeigh. Their service configuration, variables and databases were not inspected. Do not reuse their PostgreSQL services.
- `railway status --json` from this checkout reports no linked project. Remote Git repository is `ajaparicio36/pigweigh-web`. A new dedicated project is the approved target; its environment/service IDs do not exist in this report.
- `psql --version` reports PostgreSQL client 16.2. It is the Chocolatey `psql` client-only package. Its install script explicitly keeps psql/dump/restore tools and removes the extracted server directory. The package's ZIP extraction log mentions `initdb.exe` and `postgres.exe`, but these are historical paths, not installed binaries.
- No `initdb`, `postgres`, `pg_ctl`, or `pg_isready` was found on PATH or in the checked PostgreSQL 15/16 standard installation paths/Chocolatey package. No Windows PostgreSQL service or listener on local port 5432 was found. This is a bounded availability check, not a whole-disk inventory.
- Docker CLI exists, but `docker version` cannot connect to Docker Desktop's Linux engine named pipe. No GUI or engine was started.

Core implementation can start now. Actual PostgreSQL integration tests need a dedicated local test instance: start an already available Docker engine when authorized/available, or explicitly provision portable PostgreSQL server binaries in a task-owned directory. The existing psql client alone cannot run a server. Do not use SQLite as the integration-test substitute or run tests on the user's existing cloud databases.

## Contract changes

Keep the four tables and wire API. Replace SQLite with PostgreSQL for development, tests and Railway. Add synchronous Psycopg 3 via `psycopg[binary]` to FastAPI/Uvicorn, SQLAlchemy, Alembic, python-multipart, pwdlib[argon2], and Pillow. Keep pytest/HTTPX for checks. PyPI metadata inspected on this date reports psycopg/psycopg-binary 3.3.6 requires Python >=3.10 and includes CPython 3.13 Linux wheels. Resolve and lock compatible dependencies through the backend uv project; do not change the global training installation.

Normalize DATABASE_URL through SQLAlchemy URL parsing: accept `postgres://`, `postgresql://`, or `postgresql+psycopg://`, and set drivername to `postgresql+psycopg`. Preserve credentials, query parameters and percent encoding; do not perform broad string replacements or log the URL. Reject unrelated schemes. Use a finite connection timeout and `pool_pre_ping=True`; a small bounded pool is sufficient for one process.

Use BIGINT integer centavos with a positive CHECK constraint, BIGINT revision and timezone-aware timestamps. Decimal wire strings and Decimal/ROUND_HALF_UP valuation remain unchanged. Do not redesign money as floating point. The signed 64-bit centavo ceiling still applies; validate it before insertion.

Create the singleton price_state row in the migration. Publication starts a transaction, locks that row with SELECT FOR UPDATE, compares expected_revision, and inserts the immutable price record plus updates current ID/revision. A stale revision returns 409 with the whole transaction rolled back. Do not hold locks while hashing passwords, decoding images or running inference. Read the committed current-price snapshot once after successful inference and retain its provenance in the response. Real PostgreSQL concurrency tests must prove only one contender for a revision succeeds.

No automatic schema creation at app startup. Alembic owns migrations. Keep migrations compatible with the preceding app version because a failed rollout does not undo already committed database migrations. Serialize deployments/migrations initially; destructive migrations require separate review.

All previously proposed session, Origin, upload and unavailable-inference contracts remain. One backend process/replica keeps a bounded in-memory login limiter coherent for this stage; scaling requires revisiting that limiter, not pretending process-local counters are shared. Missing models/calibration must not make an otherwise healthy pricing/admin deployment fail its platform healthcheck.

## Railway layout and networking

Use one dedicated project/environment with three services: public Next frontend, private FastAPI API, private PostgreSQL with its database volume. API and web need no persistent volumes. Do not enable public API/DB domains or PostgreSQL TCP proxy for this topology. Region, resource limits, backup retention and public/custom frontend domain need concrete provisioning choices; no paid tier or region was assumed.

Use isolated monorepo roots `/web` and `/server`, with matching watch paths. Each directory must carry its own lockfile and runtime manifest. If config-as-code files are used, Railway configuration-file paths are repository-absolute (for example `/server/railway.toml`), not relative to the service root.

Reference the new database service's private DATABASE_URL in API variables. Only the API receives DB credentials. Web receives a nonsecret BACKEND_INTERNAL_URL using the API's actual private domain and port; never give DB variables to web or use NEXT_PUBLIC for backend addresses. Configure a fixed API port (for example 8000) and reference the same value in the web destination rather than assuming Railway services share PORT.

Railway private DNS is available at runtime, not build time. New environments support IPv4 and IPv6; legacy environments may be IPv6-only. Bind the Railway API on `::` and verify both the actual private DNS connection and platform healthcheck after provisioning. A local development command may continue to bind `127.0.0.1`.

Next external rewrites are evaluated during `next build`: installed Next 16.4.2 build source loads custom routes and writes the route manifest. Therefore BACKEND_INTERNAL_URL must be supplied at build time; changing it requires rebuilding web. Recording an internal hostname string in the manifest does not resolve DNS. Build must not fetch API/DB data or require those services to be reachable. Actual external-rewrite HTTP connections occur at request time. This is the smallest option; a runtime Route Handler proxy is only needed if the destination must change without a build.

Keep same-origin relative browser requests under `/api`. Preserve Origin, Cookie, Set-Cookie and status responses through the proxy, and verify this with headless end-to-end HTTP tests. Backend validates an explicit PUBLIC_ORIGIN matching the exact HTTPS frontend origin; never infer this trust boundary from arbitrary forwarded headers. Cookies are HttpOnly, SameSite=Lax, Path=/ and Secure in Railway. No broad CORS or wildcard trusted-forwarding setting is required. Do not rely on forwarded client IP headers for login throttling without a verified trusted proxy chain.

Backend enforces the 21 MiB whole-body bound while receiving, plus per-file/decode limits. Installed Next has experimental.proxyClientMaxBodySize (default 10MB) and proxyTimeout options. Verify actual external-rewrite upload behavior; that option concerns proxy body cloning and is not a substitute for backend enforcement. Avoid a second smaller proxy limit breaking the agreed paired upload. Keep auth/current-price/readiness responses no-store and keep them out of static generation or Next cache directives.

## Build, start and migration plan

For initial implementation use the existing pnpm start flow rather than introducing a custom Node server. Railway web build: frozen pnpm install plus `pnpm build`; start with `pnpm exec next start --hostname 0.0.0.0 --port $PORT`. Pin a supported Node runtime in the implementation manifest. Railway API build installs the locked Python 3.13 uv environment; runtime must not install packages.

An explicit reproducible backend image can run `uv sync --frozen --no-dev`; pre-deploy uses `.venv/bin/alembic upgrade head`; start uses `.venv/bin/uvicorn pigweigh.main:app --host :: --port $PORT`. The application module name is the proposed implementation target, not an existing source file. Ensure the chosen image contains Alembic and migration files. A Docker CMD exec array will not expand `$PORT`: use an appropriate shell command or read PORT in an entry point. Set a finite pre-deploy timeout, initially 120 seconds, and use noninteractive migrations. Pre-deploy containers have private networking and variables but do not mount volumes or persist filesystem writes.

Standalone Next output is optional. If later selected, set output: standalone, copy public and .next/static into the runtime image, and run its generated server.js with HOSTNAME/PORT. Merely enabling standalone without those assets is incomplete. The existing next start flow is adequate for the first release.

Use API `/api/health` for process/database availability, with inference readiness reported separately. Add web `/health` as a local dynamic health route; it should not require inference. Platform checks use service PORT and hostname healthcheck.railway.app; account for that if adding host restrictions. Railway deployment healthchecks do not provide ongoing uptime monitoring.

## Intended verification and rollout sequence

1. Implement and lock the backend, proxy and UI in their assigned source ownership. Obtain an isolated actual PostgreSQL test target; run Alembic against that target and tests covering authentication/revocation, Origin, price locking/rollback, Decimal valuation, uploads/cleanup and truthful unavailable inference. Test configuration must refuse an unintended database target.
2. With an isolated local PostgreSQL URL configured securely, intended commands are `uv sync`, `uv run alembic upgrade head`, `uv run pytest`, and `uv run uvicorn pigweigh.main:app --host 127.0.0.1 --port 8000` from server. Run frontend lint/typecheck/build and live HTTP proxy tests from web. These commands depend on implementation and a test database; none was run here.
3. Coordinator provisions the approved dedicated project/services and privately wires references. Review exact resource settings and source before deployment. Do not use unscoped `railway up` in this currently unlinked checkout: CLI help confirms it can create and deploy resources automatically.
4. Deploy migration/API and then web using explicit project/environment/service IDs or the reviewed source connection. Wait for deployment health rather than treating an upload command's return as readiness. Confirm no public API/DB exposure and exercise the frontend-to-private-API path, secure cookie session, price publication, stale revision and unavailable estimation through headless HTTP.
5. Bootstrap the admin using the password-prompting CLI inside the running API environment through explicitly targeted Railway SSH. Do not put a password in source, logs, CLI arguments, seed migration or permanent environment variable. `railway run` executes locally with injected variables; it does not put the local machine on Railway's private network, so it is not the intended path to the private database.
6. Interactive Chrome QA still needs confirmation that the exact shared session is available. Calibration and trained-artifact validation remain external blockers for numerical estimation.

No deployment, database query/migration, package installation, local server startup, tests, or browser control occurred during this investigation. No unrelated service variables or credentials were read.

## Sources

- [Railway isolated monorepos and config-file paths](https://docs.railway.com/deployments/monorepo)
- [Private networking architecture and build/runtime distinction](https://docs.railway.com/networking/private-networking/how-it-works)
- [Library networking configuration](https://docs.railway.com/networking/private-networking/library-configuration)
- [PostgreSQL private connections and external exposure](https://docs.railway.com/databases/postgresql)
- [Pre-deploy runtime/network/filesystem behavior](https://docs.railway.com/deployments/pre-deploy-command)
- [Healthcheck port, hostname and deployment-only monitoring](https://docs.railway.com/deployments/healthchecks)
- [Next standalone output and assets](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Next external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)
- [SQLAlchemy Psycopg dialect](https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#module-sqlalchemy.dialects.postgresql.psycopg)
- [Psycopg package metadata](https://pypi.org/pypi/psycopg/json) and [binary wheels](https://pypi.org/pypi/psycopg-binary/json)

Railway search exposed a Next deployment guide, but fetch-docs could not retrieve that page; no claim depends solely on that unavailable full page. The links above were read through the connector or directly, supplemented by installed Next source and CLI help.
