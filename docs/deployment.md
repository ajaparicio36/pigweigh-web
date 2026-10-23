# Railway deployment

## New production project, 2026-10-23

The user explicitly requested deployment into a **new** dedicated project. This supersedes the earlier keep-staged decision only for the new project below. The historical `PigWeigh` project remains untouched. Both the connected Railway plugin and authenticated native Railway CLI were used; after reconnecting the plugin, its redacted service/status/log reads confirmed the same account and infrastructure as the CLI.

[Open PigWeigh Production](https://railway.com/project/cf533c71-e072-4820-93b6-0ff4eb38c9a1). Public web origin: [https://web-production-4d49b.up.railway.app](https://web-production-4d49b.up.railway.app).

| Resource | ID |
|---|---|
| Workspace, Anthony John's Projects | `58986dc8-8671-4a3b-a7de-5255587bc825` |
| New private project, PigWeigh Production | `cf533c71-e072-4820-93b6-0ff4eb38c9a1` |
| Environment, production | `b5867d65-7d2b-46c7-b602-539f753dbf1d` |
| web | `e9ff3554-24f5-4ac2-84fe-be4913db339b` |
| api | `44ef6557-1826-45dc-b452-8bad3a121e1e` |
| Postgres | `0037c66b-b0e0-4bb9-ad68-4214ce87f1aa` |
| postgres-volume | `e82100d3-8c13-4b2d-ae69-1a8cdf71b661` |

There are exactly three services and one volume. All run in `asia-southeast1-eqsg3a` (Singapore), with one replica per service and one API process. The PostgreSQL volume is Ready, allocated 5000 MB at `/var/lib/postgresql/data`, with `PGDATA=/var/lib/postgresql/data/pgdata`. No tier upgrade, extra volume, bucket, API/DB domain, or TCP proxy was created. Only web has a public domain on port 3000. API and Postgres use `api.railway.internal:8000` and `postgres.railway.internal:5432` on the current IPv4/IPv6 private network.

### Applied configuration and source

Railway rejected setting `railwayConfigFile` with: “Config as Code (railway.json / railway.toml) is deprecated. Use Infrastructure as Code (.railway/railway.ts) instead.” The repository TOML files are historical configuration intent; they were **not applied**. Equivalent explicit settings were applied using the authenticated CLI's documented `serviceInstanceUpdate` operation and independently read back through the plugin. No infrastructure-framework migration was required.

| Service | Actual configuration |
|---|---|
| Postgres | Official `postgres:17` image; private volume; database/user `pigweigh`; port 5432 |
| api | Root `/server`; `Dockerfile`; locked uv/Python 3.13 image; pre-deploy `.venv/bin/alembic upgrade head`, timeout 120 s; health `/api/health`, timeout 120 s; port 8000; `ON_FAILURE`, max retries 3 |
| web | Root `/web`; RAILPACK; Node 22 and pnpm 10.30.1 manifest; `pnpm build`; start `pnpm exec next start --hostname 0.0.0.0 --port $PORT`; health `/health`, timeout 120 s; port 3000; `ON_FAILURE`, max retries 3 |

Nonsecret references are:

```text
Postgres.DATABASE_URL = postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:${{PGPORT}}/${{POSTGRES_DB}}
api.DATABASE_URL = ${{Postgres.DATABASE_URL}}
api.PUBLIC_ORIGIN = https://web-production-4d49b.up.railway.app
api.PIGWEIGH_MODEL_BUNDLE = /app/models/v1/manifest.json
web.BACKEND_INTERNAL_URL = http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
```

The web rewrite captures its destination during build; rebuild web after changing that reference. API/database connectivity is not required during either build. The web service receives no database credential. PostgreSQL's random password was supplied through CLI stdin. An initial environment-config diagnostic exposed the first generated value in tool output; it was immediately replaced through secure stdin **before** attaching the database image or its first startup. The obsolete value is not a live credential. Credentials were never written into repository source or documentation; subsequent reads use redacted plugin descriptions or explicit field projections.

The CLI uploaded the repository tree locally, with roots `/server` and `/web`, using `.railwayignore`; no GitHub push or source connection was necessary. The uploads derive from `87a2a86` plus the deployment bind fix below. The allowlist includes exactly the approved manifest and two ONNX files; local environments, `.env` files, caches, datasets, captures, training checkpoints and dependencies remain excluded. The Docker context also applies `server/.dockerignore`.

The first API deployment, `83c21ab0-c19b-4d48-aca2-fecd05ebf325`, built and started but failed health probing. Uvicorn's single-process asyncio listener on `::` sets `IPV6_V6ONLY=1`; an isolated reproduction accepted `::1` but refused `127.0.0.1`, while the deployment recorded no incoming health requests. The smallest fix changed the Docker command to `--host 0.0.0.0`. The new private network supports IPv4, and the corrected deployment passed the platform check. This changes socket reachability, not API authorization or public exposure.

### Runtime evidence

Postgres deployment `90a1f606-6ae9-4dda-8eeb-e1ade2cd479a`, corrected API deployment `79c7f7ec-491b-48b9-8fbc-35ff9e346f68`, and web deployment `bef2ce6e-b3c8-43de-a264-e24d13cfa419` all reached SUCCESS. Final plugin inventory reports no pending work or staged changes. A targeted project read confirms private visibility and PR deploys disabled. Scoped web SSH reports Node `v22.23.3` and pnpm `10.30.1`; the built `.next/routes-manifest.json` rewrites `/api/:path*` to `http://api.railway.internal:8000/api/:path*`.

Scoped non-TTY SSH into the healthy API returned `/app`; local HTTP checks returned `/api/health` → `{"status":"ok"}` and `/api/inference/readiness` → `{"ready":true,"blockers":[]}`. The deployed database migration version is `0001_core`. The deployed files match the local release and manifest:

| File | SHA256 |
|---|---|
| `manifest.json` | `81ffd83f099a6fe1e3965b2efc2bb4a5555af5000dfcadf45ae1a9ab6d77cea2` |
| `top.onnx` | `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa` |
| `side.onnx` | `ed40cb8d60da95b1f8eb1c955b7e52fc70bfb00bf798eb2a57a52a2d4e175c72` |

The bundle is `attached-marker-ellipse-11900-v1-5dd3bd4779d7539a`, with 100 mm black-square `DICT_4X4_50` ID 0 configuration and the experimental 11900 formula. Runtime success does not establish physical accuracy, correct card printing/attachment, or trading fitness.

Independent headless HTTP verification through the public web origin passed:

| Flow | Observed result |
|---|---|
| `/` and `/admin` | 200 HTML |
| `/health` and proxied `/api/health` | 200, status ok, `Cache-Control: no-store` |
| Proxied `/api/inference/readiness` | 200, ready true, no blockers, no-store |
| `/api/prices/current` | 200, revision 0, price null, no-store |
| Anonymous `/api/auth/session` | 401, no-store |
| Missing or wrong Origin on unsafe requests | 403 `invalid_origin`, no-store |
| Actual generated top/side pair upload | 200 in 1.078 s; `149.25` kg; valuation null, reason `no_price`; expected bundle/method/marker metadata, no-store |
| Blank PNG top image paired with generated side | 422 `marker_missing`, view top, no-store |
| One authorized admin login/session/logout | 200 login; cookie Secure/HttpOnly/SameSite=Lax; 200 session; 204 logout; subsequent session 401; no-store |

The functional pair returned body length `96.44`, chest width `30.62`, chest depth `54.13` and girth `135.70` cm. These generated images establish deployed pipeline functionality, **not** physical weight accuracy. Static HTML advertises `s-maxage=31536000`; API, health, auth and upload results were no-store. The logout check used the cleared cookie jar; it did not separately replay the revoked token. No market price or test fixture was persisted. No graphical browser or mobile/physical-phone QA was performed during deployment, and no uptime/accuracy guarantee follows from these checks.

The older project's patch `72f46ad9-4d24-40d5-a6c7-a561b0f31bd3` was read back as the same 17-change STAGED patch with its October 19 update timestamp. No old-project resource was changed.

### Admin provisioning and credential recovery

The user chose a generated password saved privately on this PC. A 64-character password from 32 cryptographic random bytes was saved as a Windows DPAPI-encrypted `PSCredential` at `C:/Users/ajapa/.codex/credentials/pigweigh-production-admin.clixml`, outside Git, before the remote insert. Username is `admin`. The file was created with no overwrite. The password was piped through an explicitly scoped non-TTY SSH connection; the remote one-time script checked password length and used the application's `normalize_username`, `PASSWORDS.hash`, `Settings`, SQLAlchemy `Admin` and transaction constraints. It neither bypassed the interactive CLI guards nor overwrote an existing admin, and returned only `Admin created`.

The encrypted file can be imported by the same Windows account on this PC. To inspect the password locally, use your own PowerShell terminal (do not paste it into chat):

```powershell
$admin = Import-Clixml -LiteralPath 'C:/Users/ajapa/.codex/credentials/pigweigh-production-admin.clixml'
$admin.GetNetworkCredential().Password
```

No default admin/password is seeded by application startup. For future user-chosen provisioning, the scoped interactive command is:

```powershell
railway ssh --project cf533c71-e072-4820-93b6-0ff4eb38c9a1 --environment b5867d65-7d2b-46c7-b602-539f753dbf1d --service 44ef6557-1826-45dc-b452-8bad3a121e1e
# Inside /app, prompts twice without echo:
.venv/bin/python -m pigweigh.cli create-admin --username another-admin
```

No market price was invented or published during deployment. Anonymous estimates can return weight with `valuation:null` and `valuation_unavailable_reason:"no_price"` until an admin publishes a real sourced price.

## Historical project: Railway staged preparation

Everything below records the **old** `PigWeigh` project only. Its keep-staged decision and cancelled apply remain historical evidence and do not prohibit the separately authorized new deployment above.

Current decision, 2026-10-19: the user chose **“Keep staged for now”**. Deployment is intentionally deferred; do not apply the staged patch or deploy application code under this decision. The approved dedicated PigWeigh project exists; services and volume remain **staged only**, with **17 staged changes and no deployments**. The PostgreSQL password is securely set and the reviewed base patch is prepared. Historically, the deployment tool cancelled the apply attempt with “the user did not approve this action”; no alternate deployment path followed. Web domain/origin and reviewed application deployment configuration remain pending until the user resumes deployment.

Historical [October 19 frontend-only QA](qa-browser.md) was followed by [October 23 desktop full-stack Chrome QA](qa-inference-browser.md) after packaging commit `a18e4a4`. The fresh local Next/API/PostgreSQL/repository-model flows passed within the report's scope; phone-width verification, physical accuracy and Docker/Railway runtime remain unverified. No QA action changed Railway's staged state.

Later local delivery decision, 2026-10-23: the three approved serving files `server/models/v1/{manifest.json,top.onnx,side.onnx}` are included in ordinary Git (no LFS) at commit `a18e4a4`. Backend image packaging copies that directory and sets `PIGWEIGH_MODEL_BUNDLE=/app/models/v1/manifest.json`; no external artifact mount is required. Source `.pt` checkpoints, photos, training data, export intermediates and credentials remain excluded. No push, Docker/platform build or deployment is claimed here. Desktop QA followed packaging; see [inference runbook](inference.md).

Fresh QA stopped all owned local services and closed its tabs, with ports 13230/18230/3018 no longer listening. Automatic approval rejected guarded temporary-data/credential cleanup before execution (`blocked by policy`); the stopped QA root and private evidence remain outside Git as recorded in [cleanup details](qa-inference-browser.md#cleanup-and-limits). No retry or cloud cleanup occurred.

## Verified identities

| Resource | Name | ID |
|---|---|---|
| Workspace | Anthony John's Projects | `58986dc8-8671-4a3b-a7de-5255587bc825` |
| Project (private) | PigWeigh | `769b1d2d-12a9-4e05-a1ab-1935f42de292` |
| Environment | production | `0ed8ec54-456e-4ceb-99f2-a6f8d7d3dbab` |
| Staged web service | web | `4db14001-d49f-4d96-9eee-05066cb2e795` |
| Staged API service | api | `98f59424-d346-46f2-9490-ee7c559bcc51` |
| Staged database service | Postgres | `4947e76b-5862-4a7b-99de-59b4e4a3d59a` |
| Staged database volume | postgres-data | `23a0c6a3-9125-497b-bcaa-daea25513203` |
| Pending environment patch | STAGED | `72f46ad9-4d24-40d5-a6c7-a561b0f31bd3` |

[Open the dedicated project](https://railway.com/project/769b1d2d-12a9-4e05-a1ab-1935f42de292). The CLI is linked to the exact project/production IDs above after scope verification. No GitHub source was connected.

## Current staged diff

`get-staged-changes` reports 17 non-destructive changes, all in the production environment above. Nothing is applying. Resource actions are three service creates and one volume create; no deletes, buckets, or shared variables.

| Resource | Staged fields |
|---|---|
| Postgres | Create; official `postgres:17` image; private endpoint `postgres`; volume mounted at `/var/lib/postgresql/data`; variable names `POSTGRES_USER`, `POSTGRES_DB`, `PGDATA`, `PGPORT`, `DATABASE_URL` |
| web | Empty service create; variable names `PORT`, `BACKEND_INTERNAL_URL` |
| api | Empty service create; private endpoint `api`; variable names `PORT`, `DATABASE_URL` |
| postgres-data | Volume create, attached to Postgres at the path above |

Service inventory reports default region `us-west2`, one replica each. Region was not overridden. Volume region and size were omitted to use provider/plan defaults; API reports `region:null`, `sizeMB:null`, so an actual allocated capacity is **not yet confirmed**. No plan/tier/resource-limit upgrade was requested or made. No persistent web/API volumes were added.

Nonsecret configuration intent: API port 8000, web port 3000; PostgreSQL port 5432, database/user `pigweigh`, and PGDATA below the mounted directory. Only the API receives a database connection reference:

```text
api.DATABASE_URL -> ${{Postgres.DATABASE_URL}}
web.BACKEND_INTERNAL_URL -> http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
Postgres.DATABASE_URL -> postgresql://${{POSTGRES_USER}}:${{POSTGRES_PASSWORD}}@${{RAILWAY_PRIVATE_DOMAIN}}:${{PGPORT}}/${{POSTGRES_DB}}
```

These references are staged, not resolved/verified runtime connections. `POSTGRES_PASSWORD` now exists as a normal unsealed service variable, written using the documented CLI stdin flow with `--skip-deploys` on the exact new Postgres service. A key-name-only read confirmed it; the staged patch was unchanged by that live variable write. No secrets or rendered database connection values are recorded here.

## Deferred deployment operations and historical evidence

The following deployment operations are deferred by the user's latest decision. Preserve the staged state until the user asks to resume; this is no longer an unanswered deployment approval request.

1. Credential setup is complete: PowerShell `System.Security.Cryptography.RandomNumberGenerator` generated 32 random bytes, encoded to URL-safe hex entirely in memory, then piped to `railway variable set POSTGRES_PASSWORD --stdin --skip-deploys` with explicit new project/environment/service IDs. CLI exit was 0. Output/error streams were captured without emission; byte buffers were cleared and variables released. The value was never placed in arguments/files or printed. Sealing is preferred, not required. No trust authentication, raw API, account-token read, or credential rotation was used.
2. Allocate a domain only for web and set API `PUBLIC_ORIGIN` to its exact HTTPS origin. The connector's domain-generation tool has no staged option; no domain was requested for the staged-only service. No API/DB domains or TCP proxies were created. Describe-service currently returns null live domains/proxies because all services remain staged-only; this is not a runtime exposure test.
3. After application review, stage service-root/build/start/health/migration settings from the backend/frontend owners' final files. No source, build, pre-deploy, or start commands have been attached. No GitHub connection, local source upload, `railway up`, or application deploy occurred.
4. The exact 17-change base diff was re-read and remained limited to the three approved services and volume. One `accept-deploy` attempt for this production environment was cancelled: tool error `INVALID_ARGUMENT`, “Cancelled — the user did not approve this action. No changes were made.” No CLI/API workaround followed. The user subsequently chose to keep it staged; no retry is authorized now. If the user later resumes deployment, re-read the whole diff first, since a commit applies every staged change. No application source is attached, so the reviewed base patch would only start the database and create empty web/API services.
5. After the later deployment, verify private connectivity, cookie/Origin forwarding, health, migrations, volume allocation, bundled-model loading, upload limits, and secure admin bootstrap. None of those deployed-runtime checks has occurred. Local CPU inference is implemented and API/PostgreSQL tested; physical accuracy remains unverified.

## Read/write evidence and isolation

Workspace/project lists were read before creation: three existing projects, no PigWeigh. Exactly one PigWeigh project was then created in the verified workspace with private visibility, production environment, and PR deploys disabled. The final list contains those same three projects plus this one. Existing projects were not inspected beyond list metadata and received no mutations.

All connector service/image/volume/private-endpoint/variable writes supplied the explicit new project/environment IDs and `staged:true`; the separately authorized CLI password write used stdin and `--skip-deploys` on the new Postgres service only. Final inventory reports exactly three staged service creates and one volume create. Final patch status remains STAGED, change count 17, destructive false, and the deployment list is empty. The sole accept-deploy attempt was cancelled without changes. No secret values were emitted, and no browser control was used during infrastructure preparation. Base infrastructure is prepared but not provisioned/healthy; application code deployment remains outside this step.

## Primary references

- [Railway database-service guide](https://docs.railway.com/databases/build-a-database-service): official Postgres image, durable mount, private connections.
- [Railway variables](https://docs.railway.com/variables): cross-service/provider references and sealed-variable behavior.
- [PostgreSQL supported versions](https://www.postgresql.org/support/versioning/): PostgreSQL 17 remains a supported major series; the staged official major tag receives patch updates rather than pinning a particular image digest.
- [Detailed deployment research](research/railway-deployment-readiness.md): build/runtime networking distinction, application commands, migrations, and future verification.
