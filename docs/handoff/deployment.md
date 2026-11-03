# Railway deployment and recovery handoff

## Current state, 2026-11-03

The dedicated [PigWeigh Production project](https://railway.com/project/cf533c71-e072-4820-93b6-0ff4eb38c9a1) is configured, but **the public application was unavailable** when checked on November 3. Read-only HTTPS requests to `/health`, `/api/health`, and `/api/inference/readiness` at [the recorded web origin](https://web-production-4d49b.up.railway.app) all returned Railway HTTP 404 **Application not found**. The latest previously successful deployments of all three services are now `REMOVED`; read-only deployment inventory recorded removal on November 2 at approximately `00:13:38–40 UTC`. The cause and database contents were not established. No restart, upload, deployment, settings change, restore, or price/authentication write was performed in this review.

| Resource | Railway ID | Last previously successful deployment, now removed |
|---|---|---|
| Project | `cf533c71-e072-4820-93b6-0ff4eb38c9a1` | — |
| production environment | `b5867d65-7d2b-46c7-b602-539f753dbf1d` | — |
| API | `44ef6557-1826-45dc-b452-8bad3a121e1e` | `2a776bf2-2334-4142-ae60-5910aea86fc4` |
| web | `e9ff3554-24f5-4ac2-84fe-be4913db339b` | `dc50021e-fec2-43d9-8840-070fe118b042` |
| Postgres | `0037c66b-b0e0-4bb9-ad68-4214ce87f1aa` | `90a1f606-6ae9-4dda-8eeb-e1ade2cd479a` |
| Postgres volume | `e82100d3-8c13-4b2d-ae69-1a8cdf71b661` | configured 5000 MB; contents and recovery unverified |

The October 23–30 [deployment record](../deployment.md) describes historical successful builds and runtime checks. It is not evidence of current uptime. Its 11900 release also differs from the local 14451 method; a repository edit does not update the hosted app. The older project named **PigWeigh** is a different, staged project and is not the target here.

Read-only checks for an operator with the Railway CLI authenticated:

```powershell
railway status --project cf533c71-e072-4820-93b6-0ff4eb38c9a1 --environment b5867d65-7d2b-46c7-b602-539f753dbf1d
railway deployment list --project cf533c71-e072-4820-93b6-0ff4eb38c9a1 --environment b5867d65-7d2b-46c7-b602-539f753dbf1d --service 44ef6557-1826-45dc-b452-8bad3a121e1e
curl.exe -i https://web-production-4d49b.up.railway.app/health
curl.exe -i https://web-production-4d49b.up.railway.app/api/health
curl.exe -i https://web-production-4d49b.up.railway.app/api/inference/readiness
```

Repeat deployment listing with the web and Postgres service IDs. Avoid printing resolved variables or connection strings while inspecting configuration.

## Historical service configuration

Read the current Railway settings before a future release: these are the settings recorded for the former deployment, not proof that containers are running. All three services used one replica in `asia-southeast1-eqsg3a`; only web had a public domain. API and Postgres used private networking. [Configuration](configuration.md) gives nonsecret environment examples.

| Service | Recorded settings |
|---|---|
| Postgres | Official `postgres:17`; port 5432; volume at `/var/lib/postgresql/data`, with `PGDATA=/var/lib/postgresql/data/pgdata`. Preserve the existing volume and inspect backups before recovery. |
| API | Repository root `/server`; Dockerfile; port 8000, bound `0.0.0.0`; pre-deploy `.venv/bin/alembic upgrade head`, 120 s timeout; `/api/health`, 120 s timeout; on-failure restart, maximum 3 retries. |
| web | Repository root `/web`; Railpack; Node 22 and pnpm 10.30.1; start `pnpm exec next start --hostname 0.0.0.0 --port $PORT`; port 3000; health `/health`, 120 s timeout; on-failure restart, maximum 3 retries. |

The original `pnpm build` produced stale compiled CSS in October 2026. The final recorded web settings kept `NO_CACHE=1` and build command `find /app/.next/cache -mindepth 1 -delete && pnpm build`. This cleans **contents of the verified generated cache mount** in the build image, not the mount or source. Review the actual build environment before reusing it; do not execute it against an arbitrary local path. Details and failures are in the [historical build-cache repair](../deployment.md#production-css-failure-and-bounded-repair).

The platform rejected the legacy repository `railway.toml` config-file setting at the time; explicit service settings were applied instead. Do not assume those TOML files configure the running service. The prior source was uploaded from the repository root using `.railwayignore`, with no GitHub source connection. Check current Railway behavior and all settings before relying on this historical arrangement.

## Future authorized deployment

1. Identify the intended project/environment/service IDs and review staged changes. Investigate why deployments were removed. Confirm the existing Postgres volume is attached to the right service, assess backup/recovery options and preserve data. A volume allocation or service definition does not prove that the database is healthy. Do not create or initialize a replacement database over existing data. See [database recovery](database.md#backup-and-recovery).
2. Review and test a single coherent API/web release, confirm the three [serving bundle hashes](models.md#release-hash-check), and ensure the new 14451 backend and frontend method contracts agree. The new local release has not been deployed. Confirm secret values and cross-service references privately; use the exact public web Origin, private database URL and build-time private API rewrite. Do not echo secrets into terminals, logs or tickets.
3. Restore or start Postgres using the reviewed attached volume and verify connectivity and data before rolling out the API. Back up before migrations. The API pre-deploy migration must succeed; a failed deployment or rollback does not undo an already committed migration. Serialize migration/deploy activity.
4. From the repository root, after the operator has authorized the release and verified CLI authentication and service settings, the documented prior local-upload pattern can be repeated. These commands **upload and deploy** the current checkout; they are examples for a later release and were not run during this handoff:

   ```powershell
   railway up --project cf533c71-e072-4820-93b6-0ff4eb38c9a1 --environment b5867d65-7d2b-46c7-b602-539f753dbf1d --service 44ef6557-1826-45dc-b452-8bad3a121e1e --detach
   # Wait for API migration, health and readiness; then:
   railway up --project cf533c71-e072-4820-93b6-0ff4eb38c9a1 --environment b5867d65-7d2b-46c7-b602-539f753dbf1d --service e9ff3554-24f5-4ac2-84fe-be4913db339b --detach
   ```

   `--detach` returns before health is established. Poll each service's deployment list, inspect build/deploy logs without revealing credentials, and verify the built web rewrite. A changed `BACKEND_INTERNAL_URL` requires a web rebuild. Ensure `.railwayignore` and `server/.dockerignore` still include only the approved model files and exclude private images, checkpoints, data, environments and secrets.
5. From the public HTTPS origin verify web `/health`, proxied `/api/health`, `/api/inference/readiness`, and `/api/prices/current`. Compare the observed price revision with the pre-release record without publishing a test price. Verify exact-Origin rejection, secure session behavior, and a consented same-pig pair where authorized. Compare the served method and model hashes to the reviewed release. Obtain shared-browser confirmation before interactive UI QA. A healthy build does not prove camera support, same-pig identity, physical marker scale or weight accuracy.

Railway's [removed-image retention policy](https://docs.railway.com/pricing/plans#image-retention-policy) varies by plan and time; rollback may restore old variables and code. Do not assume an old image remains available or that an old 11900 rollback is compatible with the new web. Treat rollback, redeploy and database restoration as explicit operational changes.
