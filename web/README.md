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

Use **Print marker** in the main navigation, or open `http://localhost:3000/marker`, to save the app-compatible A4 PDF. Print at **100% / Actual size**, with Fit to page disabled, then measure the black square at **100 mm per side**. The SVG on the page is a preview, not a physical-size print template. Dictionary, ID and size are fixed to the estimator contract; there are no arbitrary marker settings. Asset generation and physical print checks are documented in [marker assets](../docs/marker-assets.md).

On the Estimate page, choose **Take photo** in either photo area to open its camera modal. HTTPS (or localhost), browser camera support and permission are required. The rear camera is preferred when available; no microphone is requested. The top guide frames the whole pig from above and marks a back placement; the side guide frames the full profile and marks a visible-flank placement. These are manual composition guides, not live detection or validation. **Capture photo** saves the original video frame without guide graphics into the existing photo review. Upload, replace and remove remain available. Cancel/errors preserve earlier selections. Closing, Escape, leaving the page or hiding the tab releases the camera, including a permission request that resolves late; reopening requires another explicit Take photo action.

Public marker route and asset usage examples, with the local app running:

```powershell
curl.exe -I http://localhost:3000/marker
# HTTP 200, HTML marker page
curl.exe -I http://localhost:3000/markers/pigweigh-aruco-4x4-50-id-0-100mm.pdf
# HTTP 200, application/pdf
curl.exe -I http://localhost:3000/markers/pigweigh-aruco-4x4-50-id-0-100mm.svg
# HTTP 200, image/svg+xml
```

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

`pnpm test` uses Node's built-in test runner and the existing TypeScript compiler. It checks exact money strings, overflow rejection, API payload guards, response handling, camera track cleanup (including late permission), capture readiness, original-frame encoding and photo size/type boundaries. Synthetic parser and camera fixtures do not validate a model or its accuracy. Camera permission, focus and responsive behavior require browser QA; fake-camera tests do not establish physical camera support.

The new local web health route is dynamic and independent of API/database availability:

```powershell
curl.exe -i http://localhost:3000/health
# HTTP 200, Cache-Control: no-store
# {"status":"ok"}
```

`/api/health` is a separate backend/database health check. API route examples and the live eight-route proxy smoke check are in the backend README. All browser fetches use relative `/api` paths and `cache: no-store`. No API or database is contacted during the web build.

The new **PigWeigh Production** app is live at [the public web origin](https://web-production-4d49b.up.railway.app); API and PostgreSQL remain private. Railway rejected legacy `railway.toml` config, so it was not applied. Use the [actual explicit service settings](../docs/deployment.md#applied-configuration-and-source): root `/web`, RAILPACK, `pnpm build`, start `pnpm exec next start --hostname 0.0.0.0 --port $PORT` and health `/health`. Node 22 is pinned in the manifest; the deployed runtime reports Node 22.23.3 and pnpm 10.30.1. Local checks ran under Node 24.13.0 with an engine warning. The older **PigWeigh** project remains staged and untouched.

## UI verification status

The experimental-result frontend passed lint, TypeScript, seven helper tests and production build on 2026-10-23; the Impeccable detector reported no findings. Checks used Node 24.13.0 with the existing Node 22 warning. After packaging commit `a18e4a4`, [fresh desktop Chrome QA](../docs/qa-inference-browser.md) passed live Next/API/PostgreSQL/committed-model flows: file selection/previews, no-price/priced estimates and formula disclosure, marker rejection/replacement/removal, login/session, decimal publication, stale-409 draft/review recovery, logout, missing-bundle503 and bounded keyboard/focus. No P1/P2 application defect was established in scope.

The October 23 phone-width attempt is historical: its supported 390×844 override returned success but actual innerWidth/screenshots remained 1920 px. October 29 marker/camera QA separately verified actual 390 × 844 layout; no physical-phone pass or complete mobile audit is claimed. Browser busy-429, reduced motion, screen readers, exhaustive keyboard/accessibility and physical capture/weight accuracy were not tested. [October 19 frontend-only QA](../docs/qa-browser.md) remains historical and does not close these current gaps. Palette/component tokens remain in root `DESIGN.md` and `.impeccable/design.json`; no approved visual comp is claimed.

On 2026-10-29 the marker page and camera changes passed lint, TypeScript, 13 helper tests and production build; independent review found no remaining P1/P2 in scope. [Marker/camera browser QA](../docs/qa-marker-camera.md) records 27 bounded passes: shared desktop Chrome static navigation; owned headless native Chrome fake-camera JPEG capture into review/multipart; focus, cleanup and injected failure boundaries; and actual 390 × 844 marker/modal fit. No API/model server ran in this QA; a synthetic intercepted rejection tested the upload lifecycle only. Owned browsers and the local Next server closed. Physical camera support, physical print scale and weight accuracy remain unverified. The separate [October 29 web-only release](../docs/deployment.md#web-update-printable-marker-and-guided-camera-2026-10-29) reached SUCCESS; production HTTPS checks verified marker-page delivery, exact PDF/SVG hashes, health/readiness and preservation of price revision 1. API/PostgreSQL deployments were unchanged.

The backend separately passed 73 PostgreSQL-backed tests and 44 focused regressions; the fresh local browser report supplies additional proxy/UI evidence. QA closed its owned tabs and stopped Next/API/PostgreSQL, with no listeners on 13230/18230/3018. Automatic approval blocked guarded removal of the temporary cluster/configuration/test credentials before execution; no retry followed, and private files/evidence remain at the report's recorded root outside Git.

Separate [production evidence](../docs/deployment.md#runtime-evidence) records successful web/API/PostgreSQL deployments and independent headless HTTPS checks: HTML, no-store health/readiness, no-price state, Origin rejection, actual generated-fixture inference, missing-marker rejection and admin login/session/logout with secure cookie attributes. No production price was invented or published. These are HTTP checks; production graphical UI, phone-width behavior and physical weight accuracy remain unverified. The provisioned admin's private DPAPI credential recovery is documented in [the deployment runbook](../docs/deployment.md#admin-provisioning-and-credential-recovery).
