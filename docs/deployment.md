# Railway staged preparation

Current decision, 2026-10-19: the user chose **“Keep staged for now”**. Deployment is intentionally deferred; do not apply the staged patch or deploy application code under this decision. The approved dedicated PigWeigh project exists; services and volume remain **staged only**, with **17 staged changes and no deployments**. The PostgreSQL password is securely set and the reviewed base patch is prepared. Historically, the deployment tool cancelled the apply attempt with “the user did not approve this action”; no alternate deployment path followed. Web domain/origin and reviewed application deployment configuration remain pending until the user resumes deployment.

The user separately confirmed **“Chrome is available; run QA”** on 2026-10-19. [Frontend-only graphical QA](qa-browser.md) completed bounded layout, keyboard and offline-state checks. Full-stack graphical authentication/publication/upload verification remains pending because setup was blocked by policy. This authorization does not change the staged Railway state.

Later local delivery decision, 2026-10-23: the user approved the three serving files `server/models/v1/{manifest.json,top.onnx,side.onnx}` in ordinary Git (no LFS). Backend image packaging copies that directory and sets `PIGWEIGH_MODEL_BUNDLE=/app/models/v1/manifest.json`; no external artifact mount is required for this bundle. Source `.pt` checkpoints, photos, training data, export intermediates and credentials remain excluded. This prepares future application delivery only: no push, Docker/platform build or deployment is claimed here. Railway remains staged. Chrome is now available for fresh QA after packaging; that check is approved but not yet executed. See [inference runbook](inference.md).

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
