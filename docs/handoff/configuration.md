# Configuration

Copy the existing [server example](../../server/.env.example) to `server/.env`, and [web example](../../web/.env.example) to `web/.env.local` only when the destination does not exist; the [root setup](../../README.md#run-from-a-fresh-checkout) provides guarded commands. Never commit filled files. The API reads process environment; local commands explicitly use `uv run --env-file .env`. Next loads `.env.local` from `web/`.

## Local example

```dotenv
# server/.env — replace the placeholder locally
DATABASE_URL=postgresql+psycopg://pigweigh:REPLACE_WITH_URL_ENCODED_LOCAL_PASSWORD@127.0.0.1:5432/pigweigh
PUBLIC_ORIGIN=http://localhost:3000
PIGWEIGH_MODEL_BUNDLE=models/v1/manifest.json
```

```dotenv
# web/.env.local — nonsecret build-time rewrite destination
BACKEND_INTERNAL_URL=http://127.0.0.1:8000
```

`DATABASE_URL` is mandatory. `postgres://`, `postgresql://` and `postgresql+psycopg://` are normalized to Psycopg 3; other databases are rejected. Encode password characters such as `@`, `:` and `/` as URL components. No automatic schema creation or SQLite fallback exists.

`PUBLIC_ORIGIN` defaults to `http://localhost:3000`, but set it explicitly. It must be an HTTPS origin or loopback HTTP origin, without credentials, path, query, fragment or trailing slash. Every unsafe API request (including anonymous photo uploads and login) must carry exactly this Origin. The session cookie is `pigweigh_session`, HttpOnly, SameSite=Lax, Path=/, and Secure when the configured origin is HTTPS. Do not weaken this configuration to resolve an origin mismatch.

`PIGWEIGH_MODEL_BUNDLE` points to the manifest, relative to the API working directory or absolute. Missing/invalid bundles yield unavailable inference; API health still checks the database. Model loading is once per process, with no auto-download or hot reload.

`BACKEND_INTERNAL_URL` must be an HTTP(S) origin without credentials, path, query or fragment. It defaults to loopback port 8000 and is compiled into Next's `/api/:path*` rewrite during `pnpm build`. Change it at build time and rebuild web; changing only a running process variable cannot rewrite the built manifest. Browser requests use relative `/api` paths, so no public API domain or CORS setup is needed. Do not use `NEXT_PUBLIC_*` for secrets/internal connections.

For custom local ports, for example web 3010/API 8010: set `PUBLIC_ORIGIN=http://localhost:3010`, set `BACKEND_INTERNAL_URL=http://127.0.0.1:8010`, run Uvicorn with `--port 8010`, and Next with `pnpm dev --port 3010` (or `pnpm start --port 3010` after rebuilding). Restart API and rebuild/restart web as applicable. Always browse the configured hostname/port.

## Railway reference expressions

These are nonsecret configuration templates, not resolved credential values:

```text
Postgres.POSTGRES_USER = pigweigh
Postgres.POSTGRES_DB = pigweigh
Postgres.PGPORT = 5432
Postgres.PGDATA = /var/lib/postgresql/data/pgdata
Postgres.POSTGRES_PASSWORD = <private generated secret>
Postgres.DATABASE_URL = postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:${{PGPORT}}/${{POSTGRES_DB}}
api.DATABASE_URL = ${{Postgres.DATABASE_URL}}
api.PUBLIC_ORIGIN = https://web-production-4d49b.up.railway.app
api.PIGWEIGH_MODEL_BUNDLE = /app/models/v1/manifest.json
api.PORT = 8000
web.BACKEND_INTERNAL_URL = http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
web.PORT = 3000
web.NO_CACHE = 1
```

Only the API receives the database connection. The Docker command honors `PORT`; local Uvicorn's explicit port does not depend on it. Railway web uses its explicit start command and the build-cache repair described in [deployment](deployment.md). `NO_CACHE` is a platform build setting, not an application setting. November 3 inspection checked variable **names** and redacted service settings; secret/reference values above derive from the recorded applied deployment, not an unredacted variable dump.

After any authorized configuration release, check web `/health`, API `/api/health`, inference readiness and actual built rewrite destination. Exact Origin rejection and secure session behavior need runtime verification; a successful build alone proves neither.
