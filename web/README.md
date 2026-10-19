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

Open `/` to select and review a top-view and side-view photo of the same pig. JPEG, PNG, and WebP are accepted, up to 10 MiB each; the server also checks decoded content and its bounds. The required models/calibration are absent, so the page shows unavailability and a valid submitted pair returns `503 inference_unavailable`. No sample weight, confidence or detection overlay is substituted. Photos are not retained. A published price can be available even when inference is unavailable.

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

Lint, typecheck, four helper tests and production build passed after UI implementation, along with HTTP smoke checks of `/`, `/admin` and `/health`. Independent frontend review found no P1/P2 issues. These later checks satisfy the earlier backend verification record's request to rerun frontend checks after UI changes. The authorized [frontend-only Chrome QA](../docs/qa-browser.md) verified bounded desktop/phone layouts, selected keyboard paths and honest offline-service states before the later attached-card capture-copy update. The copy update passed lint/typecheck/four helper tests; no production build or browser check followed that change. Full-stack setup was blocked by policy; graphical authentication, publication, photo selection/preview/replacement/removal, rejection and valid-pair unavailable responses remain unverified. No numerical inference readiness or complete accessibility audit is claimed. The implemented palette and component tokens are in root `DESIGN.md` and `.impeccable/design.json`; this is a code-led implementation from the user brief, with no approved visual comp.
