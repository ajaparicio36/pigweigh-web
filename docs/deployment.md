# Railway deployment

## Local side-v3 API and web release, 2026-11-08

The user deferred Cloud integration and authorized Local deployment to the existing **PigWeigh Production** project. The native CLI uploaded source commit `e16451ff30f64000afd115bcda624218cf992805` from the repository root using the existing ignore rules, API first and web after API health/readiness and deployed-file verification. The Railway plugin confirmed both deployments reached SUCCESS:

| Service | Deployment | Created UTC | SUCCESS UTC |
|---|---|---|---|
| API | `f789e120-679f-4041-9e8a-40c72587bfc6` | `2026-11-08T01:19:31.141Z` | `2026-11-08T01:20:54.164Z` |
| web | `8d475015-4d11-4f11-92c7-fe56a5b5a12f` | `2026-11-08T01:22:19.458Z` | `2026-11-08T01:24:12.427Z` |

The API loads bundle `attached-marker-ellipse-14451-v1-845afb1a5f873783`, replacing the side model with the user's single-class canonical v3 export. Scoped SSH verified all three deployed SHA-256 values:

| File | SHA-256 |
|---|---|
| `manifest.json` | `62063fd3f667e648fbb3367f63455dbec1a1da2c00efc7a493cbe8872e693c1e` |
| `top.onnx`, unchanged | `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa` |
| `side.onnx` | `558c18e39b796ca7e0f0d7de591464cf668f44a3422c8dfc7c92b2c86ca789e4` |

Bounded public HTTPS checks verified default and explicit Local readiness, top/side validation and a paired estimate using the previously authorized generated fixtures. Both validations returned 200 with the new bundle. The estimate returned `58.06` kg, length `96.44`, width `30.62`, depth `28.75` and ellipse girth `93.28` cm, using the unchanged `G_cm^2 * L_cm / 14451` method. Valuation was `1741.80` PHP at the existing `30.00` PHP/kg; Decimal multiplication and the complete price snapshot matched. These generated pictures establish functional compatibility, not physical weight accuracy.

Cloud readiness returned `ready:false` with `cloud_inference_unavailable`; Cloud photo-validation and estimate requests returned 503 with that code. There is no silent Local fallback. A blank photo returned 422 `marker_missing`. A small multipart request with the wrong Origin returned 403. An earlier wrong-Origin probe uploading the full fixture pair encountered a remote connection reset; the successful bounded request verifies rejection without claiming a full-body transport result. Public `/`, `/health`, `/api/health` and Local readiness returned 200 after the web rollout; health/readiness remained no-store. Served HTML contains the Local checked radio and Cloud disabled radio with the server-inference explanation. This is HTTP/HTML evidence, not browser interaction proof.

The current-price response remained revision 1 / record 1 with raw SHA-256 `975832544557c6acec2a371b234a6e0fd0eb5d89e86eebba3b2b447bf7115fc6`, before inference, afterward and after the web rollout. No test price, login or account change was made. PostgreSQL retained deployment `e8f059a8-7ae7-4b04-90f3-d653d015fcc9` and its existing 5000 MB volume `e82100d3-8c13-4b2d-ae69-1a8cdf71b661`. This release introduced no schema migration or infrastructure configuration change, and did not redeploy the database. Final plugin inventory showed one running replica per service, no issues, no pending work and no staged changes. Cloud credentials were not added to Railway.

Pre-release verification passed 159 PostgreSQL-backed backend tests with the actual new bundle/generated pair, 53 frontend helper tests, changed-file ESLint and the production build including TypeScript. Full-project lint still fails at the unchanged `web/components/repeat-test.tsx:52` rule `react-hooks/set-state-in-effect`; this release does not claim a full lint pass. Interactive browser/camera QA was skipped at the user's request. Physical marker scale, same-pig identity and scale-weight accuracy remain unverified. The pre-existing untracked empty handoff filename containing `#step-by-step-edit-an-existing-image` was preserved and excluded from commits and deployment by the existing docs ignore rule.

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

## Web update: printable marker and guided camera, 2026-10-29

Only the existing production **web** service was uploaded and deployed for this release. The native CLI was authenticated as Anthony John; the connected Railway plugin independently confirmed the workspace, project, environment and redacted web configuration before release. The upload came from the clean repository at `dc9361697b5e76bab65b56739357139eb14e93bf` (`feat: add printable marker and guided camera capture`), after local QA and review. It used the repository root, existing `.railwayignore`, and explicit production project/environment/web service IDs. No GitHub source connection or infrastructure change was made.

Web deployment [`f4ea0cee-e94e-40e2-95ed-c02124b9f086`](https://railway.com/project/cf533c71-e072-4820-93b6-0ff4eb38c9a1/service/e9ff3554-24f5-4ac2-84fe-be4913db339b?id=f4ea0cee-e94e-40e2-95ed-c02124b9f086) was created at `2026-10-29T15:05:25.551Z` and reached **SUCCESS** at `2026-10-29T15:07:53.997Z` in `asia-southeast1-eqsg3a`. The production build compiled and typechecked successfully and prerendered `/marker`. Scoped read-only web SSH returned Node `v22.23.3` and pnpm `10.30.1`. The final plugin readback confirms the same `/web` root, RAILPACK, build/start/health commands, one replica and existing public domain, with no staged or pending production work.

Headless HTTPS checks against the public origin passed after SUCCESS:

| Check | Observed result |
|---|---|
| `/`, `/admin`, `/marker` | 200 HTML; marker page includes the fixed dictionary, 100 mm instructions, Actual size / no Fit to page copy and PDF download link |
| `/markers/pigweigh-aruco-4x4-50-id-0-100mm.pdf` | 200 `application/pdf`; 2360 bytes; SHA256 `2939159788a5e633eab4ba03987aa4645b5d4a16dc56e319375fd624b5449ab1`, byte-identical to the reviewed local asset |
| `/markers/pigweigh-aruco-4x4-50-id-0-100mm.svg` | 200 `image/svg+xml`; 1565 bytes; SHA256 `18837c1d8581d4ed20e2853eff9ec44b3d6dc3090056698401ca2f30a92ac8d3`, byte-identical to the reviewed local asset |
| `/health`, `/api/health` | 200, `status:ok`, `Cache-Control:no-store` |
| `/api/inference/readiness` | 200, `ready:true`, no blockers, no-store |
| `/api/prices/current` | 200, no-store; existing published revision 1 / price record ID 1 preserved |

No API or PostgreSQL deployment, migration, account operation or price publication occurred. Final inventory retains API deployment `79c7f7ec-491b-48b9-8fbc-35ff9e346f68` and PostgreSQL deployment `90a1f606-6ae9-4dda-8eeb-e1ade2cd479a`, both SUCCESS, and the same 5000 MB volume. No variables, domains, volumes or service settings changed. Read-only checks of the older PigWeigh project before and after this release show the same `72f46ad9-4d24-40d5-a6c7-a561b0f31bd3` STAGED patch, 13 entries as displayed by the current plugin, and no live services; no operation targeted that project's resources. The historical October 23 report's 17-entry display is retained above as recorded at that time.

These release checks establish deployment health, marker-page content and asset delivery. Local marker geometry/render recognition checks are documented in [marker assets](marker-assets.md). They do not establish physical printer scale, physical phone camera support or weight accuracy. The web-only release did not repeat inference/photo POSTs, admin login or price publication.

## API and web update: per-photo validation, 2026-10-30

The reviewed application source for every upload was commit `c6641a504bd170ee1f324b46a02f0f623d37d675` (`feat: validate individual photos before estimation`). The initial uploads used a clean checkout after local QA and independent review. Later uploads had only this excluded deployment record modified; application source remained unchanged. The authenticated native CLI uploaded the repository root with the existing `.railwayignore` and explicit production project/environment/service IDs. The connected Railway plugin independently confirmed the account, redacted configurations and deployment results. A production CSS cache failure required the two bounded web build-setting exceptions documented below.

The backward-compatible API was deployed **first**. Actual new per-photo routes passed through the existing public web proxy before the matching frontend was uploaded:

| Service | Deployment | Created UTC | SUCCESS UTC |
|---|---|---|---|
| API | `2a776bf2-2334-4142-ae60-5910aea86fc4` | `2026-10-29T16:45:44.422Z` | `2026-10-29T16:47:51.974Z` |
| web, initial platform-successful build; superseded after UI failure | `08a5d8a2-9810-435a-937f-d95272d1d91b` | `2026-10-29T16:49:15.534Z` | `2026-10-29T16:50:42.019Z` |
| web, final cache-corrected release | `dc50021e-fec2-43d9-8840-070fe118b042` | `2026-10-29T17:06:34.932Z` | `2026-10-29T17:07:57.054Z` |

These UTC timestamps fall on October 30 in Asia/Manila. Both services run in the existing Singapore region. API retained `/server`, Dockerfile, the IPv4 listener, the existing Alembic-head pre-deploy command and `/api/health`; web retained `/web`, RAILPACK, its existing start command, `/health` and public domain. No new migration, schema or model file was part of the feature commit. The standard existing migration pre-deploy completed as part of the successful API rollout. Scoped read-only SSH returned Python `3.13.18` in API, and Node `v22.23.3` / pnpm `10.30.1` in web.

### Production CSS failure and bounded repair

Production UI QA rejected the initial web build despite platform SUCCESS: a loaded 1024 x 768 image rendered at 532 x 399 inside a 532 x 216 preview, clipping the selected photo. The committed and deployed `app/globals.css` contained the minmax grid track and new `.photo-check` rules, but the compiled stylesheet omitted both. The remote disk stylesheet and public response were byte-identical: `/_next/static/chunks/2_3d3_nzbq9-_.css`, 20317 bytes, SHA256 `adef80c9d79a00410e844627d0426bcd626a3d0d9c238812b7e0f047a11438f5`. A cache-busting public query returned the same bytes. Fresh Windows builds and the actual installed Linux Tailwind optimizer both preserved the rules, isolating the discrepancy to the built artifact rather than the reviewed CSS or browser/CDN cache.

Each subsequent operation targeted only web, after a separate reviewed release decision:

| Deployment | Outcome |
|---|---|
| `8b6946b6-45b8-430f-a5e4-ed220f71ca7b` | Platform SUCCESS after setting only web `NO_CACHE=1` with `skipDeploys:true`, then one explicit upload; emitted CSS remained stale. Railway's documented layer-cache bypass did not clear the mounted Next cache. |
| `bb66935a-aff2-4429-b025-fcffe6cc02e8` | FAILED before cleaning/building: Railpack stripped inner JavaScript quotes from the scoped Node clean command, causing a syntax error. This was command transport failure, not an application compile failure. |
| `74737932-1eaf-4e78-a880-dc5aeb379cb3` | FAILED before Next build: the quote-free absolute `/app/.next` removal reported `/app/.next/cache: Device or resource busy`, proving the generated cache was a mount that must be preserved. |
| `dc50021e-fec2-43d9-8840-070fe118b042` | SUCCESS after deleting only descendants of that verified generated cache mount, then compiling the unchanged application source. |

The final web configuration intentionally retains `NO_CACHE=1` and the mount-safe build command `find /app/.next/cache -mindepth 1 -delete && pnpm build`. The build root `/app` was verified before any clean operation. Each build-command update applied only to the next deployment; a deployment-list check confirmed no automatic rollout before the single explicit upload. No source/CSS/dependency changes were used to repair the artifact. Failed builds left the preceding healthy web deployment live; this is bounded rollout evidence, not a continuous uptime guarantee.

The final clean command completed and Next compiled, typechecked, prerendered and passed health checking. The actual emitted stylesheet is now `/_next/static/chunks/0v9i7tm4kssca.css`, 20686 bytes, SHA256 `21e16ed6583a9757f8b83f800824abf1985c6724bb8ead6929bb82d6ff5694ca`, identical over public HTTPS and remote disk. It contains the minmax preview grid and all five `.photo-check` rules and matches the fresh local build. This supports stale mounted build-cache state as the cause; the framework's deeper cache-invalidation mechanism was not isolated. Seven bounded production UI checks subsequently passed against this corrected artifact; [photo-validation QA](qa-photo-validation.md) records their scope and software-camera limits.

### Live route and release checks

Sequential live checks used only the existing named generated-image fixtures, an in-memory blank image and an in-memory marker-only image. All multipart requests sent the exact public Origin and one `image` file; no admin or price write occurred.

| Public check | Observed result |
|---|---|
| `POST /api/photos/top/validate`, generated top | 200 in 0.824 s; exact `status:validated`, `view:top`, `artifacts.bundle_id:attached-marker-ellipse-11900-v1-5dd3bd4779d7539a` |
| `POST /api/photos/side/validate`, generated side | 200 in 0.516 s; same response shape and bundle with `view:side` |
| Top validation, blank PNG | 422 `marker_missing`, `error.details.view:top` |
| Top validation, configured ID 0 marker without a pig | 422 `pig_count`, `error.details.view:top` |
| Validation responses | `Cache-Control:no-store`; successes contain only status, view and artifact provenance, with no weight or confidence |
| `/`, `/admin`, `/marker` after web rollout | 200 HTML; home includes the automatic photo-check/privacy disclosure and disabled initial estimate submission |
| `/health`, `/api/health`, `/api/inference/readiness` | 200, no-store; status ok / ready true with no blockers, before and after web rollout |
| `/api/prices/current` before and after both deployments | 200, no-store; published revision 1 / record ID 1 preserved, with identical raw-response SHA256 `975832544557c6acec2a371b234a6e0fd0eb5d89e86eebba3b2b447bf7115fc6` |
| Marker PDF and SVG | 200; byte-identical to the reviewed assets and hashes recorded in the October 29 release |

All three deployed serving-file SHA256 values were read back over scoped API SSH and matched both the approved local files and the [original runtime hashes](#runtime-evidence): manifest `81ffd83f099a6fe1e3965b2efc2bb4a5555af5000dfcadf45ae1a9ab6d77cea2`, top ONNX `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa`, and side ONNX `ed40cb8d60da95b1f8eb1c955b7e52fc70bfb00bf798eb2a57a52a2d4e175c72`. No estimator formula or threshold changed.

Final redacted inventory reports API and corrected web SUCCESS with one replica each and no staged/pending production work. PostgreSQL remains on deployment `90a1f606-6ae9-4dda-8eeb-e1ade2cd479a`, with the same 5000 MB volume. The only service-setting exceptions are web's cache variable and mount-safe build command above; API configuration, existing variables, domains, volumes, account records and price records were preserved. Health, readiness and the full price-response hash passed again after the corrected release. The older PigWeigh project received no mutations; a read-only status still reports patch `72f46ad9-4d24-40d5-a6c7-a561b0f31bd3` STAGED, 13 displayed entries and no live services.

The live generated-fixture checks establish per-photo API functionality and deployment compatibility. They do not establish physical camera support, printed marker scale, correct body attachment, same-pig identity or weight accuracy. Busy/unavailable/replacement races were covered by local software QA rather than deliberately disrupting production. This release did not repeat a full estimate, admin authentication or price publication.

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

## 14451 API and web release, 2026-11-03

The user authorized deployment of the reviewed 14451 baseline to the existing **PigWeigh Production** project. Both source uploads used the clean repository root at commit `2918bec478e43858356ec6eda5240d4f416a29db` and the existing `.railwayignore`; no GitHub source connection or push was made. The API was deployed and verified before the web upload. The older, separately staged `PigWeigh` project was not targeted.

Before either upload, a fresh Railway inventory found that all three services had already returned online with deployments created around `2026-11-03T06:28Z`. The cause of the earlier removal and the actor behind these pre-existing redeployments were not established. No database restart, redeployment, restore, configuration change, volume operation, price publication or account operation was performed during this release. PostgreSQL's startup log reported an existing database directory, skipped initialization, and became ready for connections. Its `postgres:17` service retained the same 5000 MB volume `e82100d3-8c13-4b2d-ae69-1a8cdf71b661`, mounted at `/var/lib/postgresql/data`; `PGDATA` still matched `/var/lib/postgresql/data/pgdata`. The live Alembic revision was `0001_core (head)` both before and after API deployment, matching the sole repository migration. The configured API pre-deploy command remained `.venv/bin/alembic upgrade head`; this release introduced no migration. Available connector and CLI operations did not expose a backup inventory, and no backup or restore drill was performed.

| Service | Deployment | Created UTC | SUCCESS UTC |
|---|---|---|---|
| Postgres, already online before this release | `e8f059a8-7ae7-4b04-90f3-d653d015fcc9` | `2026-11-03T06:28:03.366Z` | `2026-11-03T06:28:14.515Z` |
| API | `265a92c8-5b83-405d-ad47-9aa34ef11821` | `2026-11-03T06:32:28.929Z` | `2026-11-03T06:34:09.220Z` |
| web | `29c0f060-2d91-4c56-905e-97ca8fe657d0` | `2026-11-03T06:35:24.516Z` | `2026-11-03T06:36:52.988Z` |

The API's deployed serving files matched the reviewed release and manifest: manifest SHA256 `7c17d197691d304f311a58634f985e0a0a1d9122e5c50b2fe95ae5fae017760f`, top ONNX `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa`, and side ONNX `ed40cb8d60da95b1f8eb1c955b7e52fc70bfb00bf798eb2a57a52a2d4e175c72`. The API's database health and warmed model readiness returned 200 with `Cache-Control: no-store` before web deployment. The configured exact public Origin, model path, private API port and build-time web backend reference matched the recorded settings. The new web's built route manifest contained the expected private `/api/:path*` rewrite.

The existing web `NO_CACHE=1` and build command `find /app/.next/cache -mindepth 1 -delete && pnpm build` were retained. Railway's build log records that command, successful compilation, TypeScript and prerendering. The delivered client JavaScript's response guard checked method `attached-marker-ellipse-14451-v1` and formula `G_cm^2 * L_cm / 14451` by exact equality, with no old 11900 method identifier in the loaded scripts. Public CSS and the deployed disk file matched SHA256 `21e16ed6583a9757f8b83f800824abf1985c6724bb8ead6929bb82d6ff5694ca`; the stylesheet retained the minmax photo-preview grid and all five photo-check rules.

Public `/`, `/admin`, and `/marker` returned 200. The marker PDF and SVG returned 200 with the reviewed respective SHA256 values `2939159788a5e633eab4ba03987aa4645b5d4a16dc56e319375fd624b5449ab1` and `18837c1d8581d4ed20e2853eff9ec44b3d6dc3090056698401ca2f30a92ac8d3`. Public web health, API health, inference readiness and current price returned 200/no-store after both deployments. The current-price response remained revision 1 / record 1 and raw-response SHA256 `975832544557c6acec2a371b234a6e0fd0eb5d89e86eebba3b2b447bf7115fc6` before and after release, matching the prior October record. An unauthenticated session returned 401/no-store; requests with a missing or incorrect Origin returned 403/no-store. No credentials or resolved connection strings were recorded.

Independent, serialized public API checks used the two previously authorized generated functional fixtures, not real paired scale measurements. Top and side photo validation each returned 200 with bundle `attached-marker-ellipse-14451-v1-08661ffdf08ae1cc`. One paired estimate returned 200 with that bundle, method `attached-marker-ellipse-14451-v1`, formula `G_cm^2 * L_cm / 14451`, weight `122.90` kg, and valuation `3687.00` PHP using the existing `30.00` PHP/kg price and its matching snapshot. Decimal multiplication and price provenance matched the response. An in-memory blank image returned 422 `marker_missing`; a correct Origin with an unsupported body returned 415, and checked API responses were no-store. The independent verifier also compared the complete price response before and after these requests and found it unchanged.

The final read-only inventory showed all three services online with one running replica each, no pending work or active issues, and the same attached Postgres volume. These checks establish the observed deployment and bounded fixture behavior, not complete database integrity, physical camera or print behavior, same-pig identity, physical marker scale, or weight accuracy. No interactive graphical browser or physical-device QA, authenticated login, price publication, or backup/restore verification was performed in this release.

## Web update: square ArUco camera guide, 2026-11-05

Following the focused [local Chrome guide QA](qa-aruco-guide.md), the reviewed clean repository root at commit `f660cae8b9882942abf67aac723c2a625f9854a5` was uploaded with the existing `.railwayignore` to the **PigWeigh Production** web service only. Deployment `fc7c38cc-2b0c-4b5f-8552-5412e199d9e5` was created at `2026-11-05T05:21:37.471Z` and reached `SUCCESS` at `2026-11-05T05:23:12.963Z`. The existing `/web` root, `NO_CACHE=1` and build command `find /app/.next/cache -mindepth 1 -delete && pnpm build` were retained; the build log recorded successful compilation and generation of all seven static pages. Public `/` returned 200 and `/health` returned 200 with `Cache-Control: no-store`.

The served stylesheet `/_next/static/chunks/39uqb2x3-6fyk.css` and its running-container file both had SHA-256 `b465ab404b824ef26078558e4959bb7e2ee999da16b73f83bb472129294fb4a3`, distinct from the November 3 stylesheet. It contains the centered grid and marker rule `width:min(6rem,80cqw,80cqh); aspect-ratio:1`, with no `camera-pig-frame` selector; the five existing photo-check rules remain. The served guide JavaScript `/_next/static/chunks/3zsqvgc8hk7zq.js` and its running-container file both had SHA-256 `ec41f0c46df6eabf2ef8212cdd9f6247f9036ee1cd65893627c2cbced4a5069a`. It contains the updated top/back and side/flank instructions, no pig-frame class, and the unchanged 14451 formula guard. Matching public and container hashes establish that these new assets are served; they do not themselves establish visual browser behavior.

The separate [deployed Chrome guide smoke](qa-aruco-guide.md#production-guide-smoke--2026-11-05) passed both representative cases at an actual 844 × 390 viewport using synthetic landscape and portrait video. Each showed an unobscured square above the action bar, correct native preview aspect and no pig outline. The bounded check recorded no write requests or page exceptions; it does not establish physical-device behavior.

Before upload, all three approved serving bundle hashes matched the [14451 release values](handoff/models.md#release-hash-check) and the model hashes in the manifest. Read-only Railway inventories before and after showed the existing API deployment `265a92c8-5b83-405d-ad47-9aa34ef11821` and PostgreSQL deployment `e8f059a8-7ae7-4b04-90f3-d653d015fcc9` at `SUCCESS`, with the same 5000 MB volume `e82100d3-8c13-4b2d-ae69-1a8cdf71b661` mounted at `/var/lib/postgresql/data` and no staged or pending work. No API or database deployment, configuration change, model change, photo-validation or estimate request, authentication, or price publication was performed for this web release.

## Web update: half-size ArUco guide, 2026-11-05

Source commit `37c9899c8fedd1914cf2fa7777a1760014dbac4d` halves both dimensions of the on-screen guide by changing `min(6rem,80cqw,80cqh)` to `min(3rem,40cqw,40cqh)`, retaining `aspect-ratio:1`. This halves the maximum and both responsive limits; at the default 16 px text size the maximum becomes 48 × 48 CSS px. The physical 100 mm marker configuration, capture pixels, formula and models are unchanged. The production build, including TypeScript, passed locally with the existing Node 24 versus pinned Node 22 engine warning. No new browser QA or unrelated flow tests were run for this CSS-only adjustment.

Only the existing web service was uploaded. Deployment `6a33aa6b-2d07-4809-80b9-33e0792255d5`, created at `2026-11-05T07:16:28.672Z`, reached SUCCESS at `2026-11-05T07:18:00.071Z`. Public `/` returned 200 and `/health` returned 200 with `Cache-Control:no-store`. The served `/_next/static/chunks/38r0en3mvhf1j.css` has SHA-256 `177848a701caf4d421a10a0b7bc8fcde81421d2c73666810b78bcf32e8955f41`; its actual marker rule contains the new half-size expression and square aspect ratio, with no pig-frame selector. Final inventory showed one running replica per service and no pending work; the API and PostgreSQL retained the same deployment IDs recorded above. All three approved local serving-file hashes still match the 14451 release.
