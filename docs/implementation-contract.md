# Software implementation contract

Status, 2026-10-23: **core software and configured ONNX CPU inference implemented and deployed to the new PigWeigh Production project**. [The runbook](inference.md) records exact runtime/configuration. Final backend API/PostgreSQL proof passed 73 tests after review fixes, with 44 focused regressions; [fresh desktop Chrome QA](qa-inference-browser.md) passed scoped local full-stack flows after packaging commit a18e4a4. That October 23 phone-width check did not take effect; browser busy-429 and exhaustive accessibility remain unverified; the report records stopped services and blocked guarded temporary cleanup. October 19 [frontend-only QA](qa-browser.md) is historical. Separate [production runtime proof](deployment.md#runtime-evidence) records deployed builds, health, migration and bundle hashes. Handheld phone capture uses the selected experimental 11900 method, with unmeasured accuracy; neither model scores nor software tests establish kilogram accuracy. Next.js/Tailwind without ShadCN, FastAPI/SQLAlchemy/uv and PostgreSQL remain the chosen stack.

## Runtime and persistence

The implementation uses Python 3.13 through uv, SQLAlchemy/Alembic, and PostgreSQL, without an automatic SQLite fallback. The newly authorized **PigWeigh Production** Railway project has public web, private API/PostgreSQL and a 5000 MB database volume in Singapore. The older **PigWeigh** project retains its October 19 staged patch untouched. [Deployment status](deployment.md#new-production-project-2026-10-23) records separate identities, applied configuration and runtime evidence; the earlier [deployment-readiness report](research/railway-deployment-readiness.md) remains historical research.

Four minimal tables: `admin`, `session`, immutable `price_record`, and singleton `price_state` for atomic current-price revision. Retain historical price records internally; no public history, offline writes, or realtime sockets in this stage.

Provision admins through a CLI that prompts for a password; no default credentials or registration. Hash passwords with Argon2. Use opaque, revocable, database-backed sessions expiring after eight hours. Cookies are HttpOnly and SameSite=Lax, with Secure on HTTPS. Validate the exact configured Origin on unsafe methods. Route `/api` through a same-origin Next.js rewrite; authentication responses must not be cached.

Accept only PostgreSQL connection schemes (`postgres`, `postgresql`, `postgresql+psycopg`); normalize through SQLAlchemy URL parsing to the Psycopg dialect without logging credentials or damaging query parameters/encoding. Use finite connection timeout, bounded pooling, and pre-ping. Alembic owns schema creation/migration, not application startup. No database connection or API fetch is required during build.

Railway topology: public web only, private API and PostgreSQL, no public API/DB domains or TCP proxy. Set `BACKEND_INTERNAL_URL` for web at build time: Next records the rewrite destination then, but its network requests occur at runtime; changing the destination requires rebuilding. Keep backend/database secrets out of browser/public variables. The deployed API binds `0.0.0.0` on Railway's current private network: the initial `::` listener was IPv6-only and failed health probing. Run Alembic in API pre-deploy, then start the locked runtime without dependency installation. Health checks separate API/database availability from inference readiness; missing models do not make the core service unhealthy. Preserve Origin/cookies/status through the proxy, no-store auth/current-price/readiness responses, and verify paired-upload proxy behavior against backend body bounds. The platform rejected legacy `railway.toml` config; use the [explicit applied service settings](deployment.md#applied-configuration-and-source).

## API shape

All backend routes are under `/api`; the web also has an independent `/health` route. Decimal quantities are wire strings. Errors use `{ "error": { "code": "...", "message": "...", "details": {} } }`; details must not expose local filenames or credentials. Working requests are in [backend instructions](../server/README.md); the live proxy smoke verified all eight API routes end-to-end locally.

| Method and route | Input / behavior | Response contract |
|---|---|---|
| `GET /health` | Public health check | `{status:"ok"}` |
| `GET /inference/readiness` | Public readiness, no local paths | `{ready:boolean,blockers:[{code:string,message:string}]}` |
| `GET /prices/current` | Public current snapshot | `{revision:number,price:null\|{id,php_per_kg,source_reference,published_at}}` |
| `POST /auth/login` | `{username,password}`; verifies credentials, sets session cookie | `{admin:{id,username}}` |
| `GET /auth/session` | Verifies session against server | `{admin:{id,username}}`, or `401` |
| `POST /auth/logout` | Revokes session and clears cookie | `204` |
| `POST /prices` | Authenticated `{php_per_kg,source_reference,expected_revision}` | `201` current-snapshot shape; `409` stale revision |
| `POST /estimates` | Anonymous multipart, exactly `top_image` and `side_image`, representing the same pig | Loaded bundle: experimental estimate or 422 capture rejection; missing/invalid bundle: `503 inference_unavailable`; competing CPU estimate: `429 inference_busy` |

Identifiers and timestamps in JSON are strings; `published_at` is an ISO 8601 UTC timestamp. `revision`/`expected_revision` are nonnegative integers. Unauthenticated protected requests return `401`; invalid Origin returns `403`. Request validation uses `422`. Authentication failures must not reveal which credential was wrong.

Implemented formula-estimate success shape (values below are placeholders, not a fixture or measured pig):

```json
{
  "status": "estimated",
  "estimated_weight_kg": "<decimal string>",
  "measurements": {
    "body_length_cm": "<two-decimal string>",
    "chest_width_cm": "<two-decimal string>",
    "chest_depth_cm": "<two-decimal string>",
    "girth_cm": "<two-decimal string>"
  },
  "valuation": {
    "amount_php": "<two-decimal string>",
    "price": {
      "id": "<price id>",
      "php_per_kg": "<two-decimal string>",
      "source_reference": "<reference>",
      "published_at": "<UTC timestamp>"
    }
  },
  "artifacts": { "bundle_id": "<loaded bundle id>" },
  "method": {
    "version": "attached-marker-ellipse-11900-v1",
    "formula": "G_cm^2 * L_cm / 11900",
    "marker_dictionary": "DICT_4X4_50",
    "marker_id": 0,
    "marker_side_mm": "100",
    "experimental": true,
    "accuracy_evaluated": false
  }
}
```

When no price exists, return the valid weight with `valuation:null` and `valuation_unavailable_reason:"no_price"`. The template above is a contract illustration, not synthetic inference success. A valid upload with unavailable inference never receives numerical output.

## Price and valuation invariants

- A published price is positive PHP/kg with at most two decimal places; keep exact integer centavos in PostgreSQL `BIGINT` with a positive constraint and return canonical two-decimal strings. This preserves a single exact minor-unit representation rather than introducing a second `NUMERIC` money model. Reject signed-64-bit overflow explicitly; a narrower practical UI cap has not been selected. Trim leading/trailing whitespace from `source_reference`, then require length 1–500 while retaining interior spaces. Reject malformed/nonfinite values rather than coercing them.
- Price records are immutable and immediately effective at publication; no scheduling/end-date editor in this stage. Record publishing admin and server time internally.
- Initialize singleton `price_state` in the migration. Publication locks it with PostgreSQL `SELECT FOR UPDATE`, compares `expected_revision`, and updates it atomically in the same transaction as the new record. A stale request returns `409` and rolls back the entire transaction, leaving no record behind. Never hold that lock during password hashing, image decoding, or inference; prove the concurrent-publication invariant against actual PostgreSQL.
- After successful inference, capture the current-price snapshot once, with no transaction spanning CPU computation. Multiply the rounded weight actually returned to the client using Decimal and round the final PHP value with `ROUND_HALF_UP` to two decimals. Preserve that price provenance in the response; later publication must not alter an already computed valuation.

## Upload boundary and inference hold

The user accepts flat ArUco cards attached near measured back/flank regions with controlled-pen phone top/side views; see [ADR-0006](adr/0006-controlled-capture-guidelines.md). Settled configuration is `DICT_4X4_50`, ID 0, actual black-square side 100 mm (10 cm), white margin excluded. Preserve visible corners/margin and avoid landmarks; confirm actual printed size rather than assuming a document setting proves it. The card reduces offset without making the curved pig coplanar. The user-selected 11900 formula needs no trained weight regression or prior error evaluation.

Implemented bounds: 10 MiB per file, 21 MiB whole request, and 20 megapixels per decoded image. The body is bounded before multipart parsing. Accepted decoded formats are JPEG, PNG, and WebP; actual content is checked, EXIF orientation applied, and animation rejected. Missing/extra/invalid pairs receive `422`, oversized input `413`, and unsupported image content `415`. Photos are not permanently stored or logged. Upload cleanup and multipart completion have focused regression coverage, including unfinalized spools. Supplying two images does not by itself prove same-pig identity; that remains a capture requirement and research validation concern.

The loader reads `PIGWEIGH_MODEL_BUNDLE` at startup, verifies schema/model hashes and metadata, and warms two CPU ONNX sessions. The user approved ordinary Git (no LFS) for exactly `server/models/v1/{manifest.json,top.onnx,side.onnx}`, copied from the verified private export with bundle ID `attached-marker-ellipse-11900-v1-5dd3bd4779d7539a`. Source checkpoints, photos, training data, other intermediates and credentials remain excluded. Local startup from `server/` uses `models/v1/manifest.json`; Docker copies `models` and selects `/app/models/v1/manifest.json`. The schema fixes RGB float32 `[1,3,640,640]`, end-to-end outputs `[1,300,39]` top / `[1,300,45]` side and named landmarks. [ADR-0008](adr/0008-cpu-inference-bundle.md) and [the runbook](inference.md) give delivery details. Missing/invalid bundles stay unavailable without exposing local paths.

Each image has a separate 10×10 cm marker-plane homography. After inverse letterbox mapping and projection, top ear-base midpoint→tail-base gives L, top left/right chest gives W, and side withers→sternum gives D. Ramanujan II on semiaxes W/2,D/2 gives G; output weight is G²L/11900. Distances, girth and weight are rounded to two-decimal strings with half-up rounding. These are marker-plane proxies rather than 3D anatomy or a measured tape path. The formula website inconsistency remains documented in [source inspection](research/selected-weight-formula.md).

Each view must contain exactly one class-0 pig scoring at least 0.5, one configured marker, and usable required keypoints scoring at least 0.5. Reject missing/multiple/wrong markers, missing/multiple pigs, unusable/outside-image landmarks and unstable geometry with 422 and view-specific details. These engineering thresholds are not weight accuracy. One estimate runs at a time per API process; a competing estimate returns 429. On success the API reads one current-price snapshot only after CPU computation and values the rounded reported weight through Decimal. No transaction spans inference. No price preserves weight with null valuation. Formula output remains explicitly experimental/accuracy unevaluated; no confidence fabrication or class-label fallback.

## Implemented interface structure

Estimate, Admin and Print marker share navigation and clear experimental-thesis wording. On anonymous `/`, show current price and source, then explicitly labeled top/side photo review-and-replace controls: side by side on desktop, stacked on phones. Put readiness, actionable errors, and the result directly below the capture controls. Explain that photos are not retained; unavailable inference must remain explicit rather than showing a fabricated result or keypoint overlay.

On `/marker`, serve the fixed A4 PDF and SVG preview for `DICT_4X4_50`, ID 0, 100 mm black-square side. These static public assets add no backend API route. The dictionary has 4 × 4 data cells and 50 codes; physical print size is a separate parameter. This is the accepted compatibility choice, not proof of superior detection or weight accuracy. Print at 100% / Actual size with Fit to page disabled, then ruler-check the black square; preserve the quiet zone. [Asset generation and verification](marker-assets.md) records geometry, rendered recognition and hashes.

Each photo card offers upload or Take photo. An explicit Take photo action opens the view-specific native camera dialog and requests video only, preferring the rear camera. Manual whole-pig and ArUco placement guides mark the back for top capture and visible flank for side capture; keep a flat card, all corners/white margin and measurement landmarks visible. Guides perform no live recognition. Capture encodes the intrinsic video frame as JPEG without guides and sends its File through the existing review, replacement and upload-validation path. Camera errors preserve prior selections and offer upload. Capture waits for a usable frame; closing, Escape, navigation, tab hiding or parent submission releases tracks, including late permission resolution. The dialog restores trigger focus or moves focus to upload as appropriate.

On `/admin`, login is shown when unauthenticated; after server verification, the page shows the current price and publication form with price, source reference, and stale-revision feedback. The implementation preserves cream `#F3EBDF`, dark red `#6A1314`, primary red `#A40000`, system-font typography, Tailwind, and native form semantics. This is a code-led interface with no approved visual comp; scoped desktop Chrome checks now cover login/publication/upload and inference, with bounded keyboard/focus coverage. October 29 bounded 390 × 844 marker/modal layout checks passed; physical-phone and exhaustive accessibility behavior remain unverified. No fabricated imagery, results, exact accuracy metrics, or trading-fitness claims.

## Implementation and verification boundary

Core authentication, price publication, bounded uploads, readiness and truthful unavailable states are implemented independently of training. FastAPI, Uvicorn, SQLAlchemy, Alembic, `psycopg[binary]`, `python-multipart`, `pwdlib[argon2]` and Pillow are used, with pytest/HTTPX for development checks. A settings package was not needed. Serving now additionally uses CPU ONNX Runtime, NumPy and the sole opencv-python-headless provider through backend uv. Export uses a separate environment; preserve the global training environment.

Task-owned portable PostgreSQL supplied real integration tests without SQLite substitution or existing cloud databases. [Backend verification](../server/VERIFICATION.md) records 28 PostgreSQL tests and the live eight-route proxy smoke, followed by 11 focused multipart regressions after an independent review fix. The earlier PostgreSQL suite was not rerun for that upload-only fix. At that historical stage the unavailable local Docker engine prevented an image build; the subsequent Railway Linux Docker build passed. The stopped original test cluster remains under the documented cleanup limitation; the reusable runner cleaned its separate cluster.

On 2026-10-23 the experimental-result frontend passed lint, TypeScript, seven helper tests and a production build locally on Node 24.13.0 with the existing Node 22 warning. The deployed web runtime subsequently verified Node 22.23.3 and pnpm 10.30.1; see [production evidence](deployment.md#runtime-evidence). CPU/PyTorch export parity and a mock-image measurement pass provide functional evidence, not physical accuracy. [Final backend verification](../server/VERIFICATION.md) records 73 complete PostgreSQL-backed tests after geometry/cancellation/runtime fixes and 44 final focused regressions. Actual ONNX/API checks cover no-price output, authenticated publication, exact valuation of returned weight/provenance and missing-marker rejection; independent review found no remaining P1/P2 in scope. New disposable clusters were cleaned. [October 23 desktop Chrome QA](qa-inference-browser.md) passed actual local Next/API/PostgreSQL/model estimates, no-price/exact priced results, login/session, publication/stale-409 recovery, file replacement/removal/rejection, missing-bundle503 and bounded keyboard/focus. No P1/P2 application defect was established in scope. Phone-width verification did not take effect; physical phone/camera, busy-429, reduced motion and screen-reader testing remain unverified. All owned local services stopped; automatic approval rejected guarded temporary cluster/configuration/test-credential cleanup before execution, leaving the private root recorded in the report. The earlier test-runner cluster cleanup remains a separate successful event. No production graphical QA, composition approval or complete accessibility audit is implied.

On October 29 the marker/camera frontend passed lint, TypeScript, 13 helper tests and production build; independent review found no remaining P1/P2 in scope. [The final QA report](qa-marker-camera.md) records 27 bounded passes, shared graphical Chrome static navigation and owned headless fake-camera capture/multipart submission, cleanup/focus, injected error boundaries and actual 390 × 844 layout. No API/model server ran for this QA; intercepted synthetic rejection did not exercise inference. Owned browsers and Next server closed. These checks do not prove physical camera/print behavior or deployment of these features.

The new production web/API/PostgreSQL deployments reached SUCCESS; current runtime proof and exact scope are in [deployment status](deployment.md#runtime-evidence). The older project remains staged. A provisioned production admin uses the privately saved DPAPI credential described in [credential recovery](deployment.md#admin-provisioning-and-credential-recovery); no market price was invented or published during deployment. Persistent image retention is outside this no-retention stage. The 11900 method, concrete versioned serving bundle, marker configuration and measurement pipeline are implemented. Default unconfigured serving remains unavailable; physical print/capture validation and scale-error evidence remain unverified. Scale-error evaluation can follow implementation, and fitted correction remains optional. Nothing in this contract certifies trading fitness or numerical weight accuracy.
