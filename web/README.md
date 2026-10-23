# PigWeigh web

Next.js 16 with React 19 and Tailwind 4. Use Node 22 and pnpm 10.30.1. Native forms and same-origin fetch connect to the FastAPI service; there is no ShadCN or client authentication storage.

## Run locally

Start PostgreSQL and the API using [the backend instructions](../server/README.md). From this directory:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Set the nonsecret `BACKEND_INTERNAL_URL` to your API origin, normally `http://127.0.0.1:8000`. Set the backend `PUBLIC_ORIGIN` to the exact web origin, normally `http://localhost:3000`. The API validates Origin for writes and owns the HttpOnly session cookie. Do not put credentials or an internal backend URL in NEXT_PUBLIC variables. The rewrite target is captured at build time; rebuild after changing it.

Open `/` to select and review a top-view and side-view photo of the same pig. Use a flat ArUco `DICT_4X4_50`, ID `0` card on the back for the top view and visible flank for the side view. The printed black square must measure 100 mm per side, excluding its visible white margin. JPEG, PNG, and WebP are accepted, up to 10 MiB each; the server also checks decoded content and its bounds. Readiness reflects the backend's loaded pipeline. Missing models or configuration return `503 inference_unavailable`; unusable captures return `422`, and a busy service returns `429`. Selected photos remain available for review or retry.

A successful request displays an experimental weight and the server-calculated PHP valuation with its exact price snapshot. Without a published price, the weight remains visible and valuation is unavailable. Expand **Measurements and formula** to inspect photo-derived body length, chest width, chest depth and ellipse-estimated girth used in `G_cm² × L_cm / 11900`. The frontend validates the explicit method and measurement payload before showing numerical results. Accuracy against scale weights has not been evaluated. No sample output or confidence is substituted. Photos are not retained.

Open `/admin` to sign in with a provisioned account and publish a positive PHP/kg decimal with a source reference. Sessions are checked against the server. Stale publication requires review of the refreshed price; expired sessions retain the draft on this page for sign-in and review. Reloading or leaving the page discards drafts. Admin provisioning and safe terminal request examples are in the backend README; there are no default credentials.

## Checks and production run

```powershell
pnpm lint
pnpm exec tsc --noEmit
pnpm test
$env:BACKEND_INTERNAL_URL='http://127.0.0.1:8000'
pnpm build
pnpm start
```

`pnpm test` uses Node's built-in test runner and the existing TypeScript compiler. It checks exact money strings, overflow rejection, API payload guards and response handling. Synthetic parser fixtures do not validate a model or its accuracy.

The new local web health route is dynamic and independent of API/database availability:

```powershell
curl.exe -i http://localhost:3000/health
# HTTP 200, Cache-Control: no-store
# {"status":"ok"}
```

`/api/health` is a separate backend/database health check. API route examples and the live eight-route proxy smoke check are in the backend README. All browser fetches use relative `/api` paths and `cache: no-store`. No API or database is contacted during the web build.

Railway configuration in `railway.toml` already sets the web health path to `/health`. Actual staged resources and the cancelled apply attempt are recorded in [deployment status](../docs/deployment.md); no deployment has occurred. Node 22 is pinned in the manifest. Local implementation checks ran under the available Node 24.13.0 and passed with an engine warning; the Node 22 deployment runtime still needs platform verification.

## UI verification status

The experimental-result frontend passed lint, TypeScript, seven helper tests and production build on 2026-10-23; the Impeccable detector reported no findings. Checks used Node 24.13.0 with the existing Node 22 warning. After packaging commit `a18e4a4`, [fresh desktop Chrome QA](../docs/qa-inference-browser.md) passed live Next/API/PostgreSQL/committed-model flows: file selection/previews, no-price/priced estimates and formula disclosure, marker rejection/replacement/removal, login/session, decimal publication, stale-409 draft/review recovery, logout, missing-bundle503 and bounded keyboard/focus. No P1/P2 application defect was established in scope.

Phone-width QA remains unverified: the supported 390×844 override returned success but actual innerWidth/screenshots remained 1920 px. No phone-width or physical-phone pass is claimed. Browser busy-429, reduced motion, screen readers, exhaustive keyboard/accessibility and physical capture/weight accuracy were not tested. [October 19 frontend-only QA](../docs/qa-browser.md) remains historical and does not close these current gaps. Palette/component tokens remain in root `DESIGN.md` and `.impeccable/design.json`; no approved visual comp is claimed.

The backend separately passed 73 PostgreSQL-backed tests and 44 focused regressions; the fresh browser report supplies additional live proxy/UI evidence. QA closed its owned tabs and stopped Next/API/PostgreSQL, with no listeners on 13230/18230/3018. Automatic approval blocked guarded removal of the temporary cluster/configuration/test credentials before execution; no retry followed, and private files/evidence remain at the report's recorded root outside Git. Docker/platform runtime and physical accuracy remain unverified; deployment remains deferred.
