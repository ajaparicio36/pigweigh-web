# PigWeigh

Experimental paired-photo pig live-weight estimation and Philippine peso valuation. The app uses Next.js/React/Tailwind in `web/`, FastAPI/SQLAlchemy in `server/`, PostgreSQL, and a packaged CPU ONNX pose bundle. Formula output has not been evaluated against scale weights; it is not a certified sale weight.

## Run from a fresh checkout

Use PowerShell 7, Git, Python 3.13 with [uv](https://docs.astral.sh/uv/), Node.js 22, pnpm 10.30.1, and a running PostgreSQL server (17 matches hosting). Install pnpm with `npm install --global pnpm@10.30.1` if needed. PostgreSQL is required locally; SQLite is unsupported.

Clone this repository and open its root. Provision a **dedicated local database**, using PostgreSQL's `createuser` and `createdb` tools in your PATH:

```powershell
createuser --host 127.0.0.1 --port 5432 --username postgres --pwprompt pigweigh
createdb --host 127.0.0.1 --port 5432 --username postgres --owner pigweigh pigweigh
```

Enter your existing PostgreSQL administrator password when requested and choose a new local password for `pigweigh`. These commands create objects; use different names if those objects already belong to another application. Alternatively create the same role/database with your PostgreSQL administration tool.

In terminal 1, from the repository root:

```powershell
Set-Location server
uv sync --frozen
if (-not (Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
```

The guarded copy preserves any existing `.env`. Edit `server/.env`: replace the example database password with your local role password (URL-encode special characters), keep `PUBLIC_ORIGIN=http://localhost:3000`, and keep `PIGWEIGH_MODEL_BUNDLE=models/v1/manifest.json`. Local inference needs no Roboflow key. Cloud inference is currently unavailable; see [provider availability](server/README.md#inference-provider-availability). Then:

```powershell
uv run --env-file .env alembic upgrade head
uv run --env-file .env python -m pigweigh.cli create-admin --username admin
uv run --env-file .env uvicorn pigweigh.main:create_app --factory --host 127.0.0.1 --port 8000
```

Admin bootstrap prompts twice in an interactive terminal for a 12–128 character password. There is no default admin/password. Bootstrap once per database; a duplicate username is rejected.

In terminal 2, from the repository root:

```powershell
Set-Location web
pnpm install --frozen-lockfile
if (-not (Test-Path -LiteralPath .env.local)) { Copy-Item .env.example .env.local }
pnpm dev
```

The guarded copy preserves any existing `.env.local`; the example sets `BACKEND_INTERNAL_URL=http://127.0.0.1:8000`. Open [localhost:3000](http://localhost:3000), [admin](http://localhost:3000/admin), and [Print marker](http://localhost:3000/marker). Use that exact browser origin: `127.0.0.1:3000` is a different origin. API writes require the exact configured Origin, and cookies are HttpOnly/SameSite=Lax (Secure for HTTPS). Keep credentials out of `NEXT_PUBLIC_*` variables and Git. See [configuration](docs/handoff/configuration.md) for other ports/origins.

For a production-style local web run, stop `pnpm dev`, then run `pnpm build` followed by `pnpm start` from `web/`. The internal API rewrite is captured at **build time**; rebuild after changing `BACKEND_INTERNAL_URL`. Builds do not need an API/database connection. The API loads models once at process startup; restart it after a bundle change.

## Verify local startup

With both processes running:

```powershell
curl.exe http://localhost:3000/health
curl.exe http://localhost:3000/api/health
curl.exe http://localhost:3000/api/inference/readiness
curl.exe http://localhost:3000/api/prices/current
```

Expect web/API `status:ok`, inference `ready:true` with no blockers when the packaged bundle loads, and revision 0 / `price:null` in a new database. Missing/invalid models leave inference unavailable; never replace them with sample weights. A missing database makes API health fail independently of model readiness. See [server route examples](server/README.md) for multipart requests and authenticated publication; only publish sourced prices into your local database.

For photos, use the same pig in top and side views, with complete flat `DICT_4X4_50` ID 0 markers attached near the back/flank. The marker's black square must physically measure 100 mm per side, excluding the white margin. Each selected/captured photo uploads for checking; final submission rechecks both. The server does not retain photos or estimates after processing. Photo drafts and saved repeat attempts are stored in the browser, and exports save them on the chosen device. Camera video stays in the browser; Local live pose preview sends sampled frames to the PigWeigh API. Check passes do not verify animal identity or physical weight accuracy.

## Development checks and operations

From `web/`: `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build`. PostgreSQL integration tests must use an isolated disposable database; follow [server verification instructions](server/README.md#postgresql-tests-and-http-proxy-proof), never a user/deployed database.

Operator documentation starts at [handoff](docs/handoff/README.md): hosting costs, deployment, environment configuration, model serving and database storage. The [November 3 Railway release](docs/deployment.md#14451-api-and-web-release-2026-11-03) deployed the reviewed 14451 method and passed bounded public checks, including generated-fixture inference and valuation. The earlier 404 and removed deployment observations remain in the [handoff history](docs/handoff/deployment.md#earlier-outage-observation-2026-11-03). A later source edit does not deploy automatically, and these checks do not establish physical weight accuracy.

Scope and readiness: [PRODUCT.md](PRODUCT.md), [migration plan](docs/migration-plan.md), [inference method](docs/inference.md), [architecture decisions](docs/adr/).
