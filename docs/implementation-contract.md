# Software implementation contract

Status, 2026-10-19: **core software implemented and locally verified**. This document records the implemented core contract and separates future inference requirements below. [Frontend-only Chrome QA](qa-browser.md) is complete; graphical authentication/publication/upload flows remain unverified because full-stack setup was blocked by policy. Railway deployment is intentionally deferred by the user; runtime verification and pose/marker/formula integration remain pending; formula accuracy is unmeasured. Accepted product intent remains handheld phone capture for an experimental thesis, using Next.js/Tailwind without ShadCN and FastAPI/SQLAlchemy/uv. PostgreSQL and Railway are explicit user decisions. The user-selected formula method is accepted in [ADR-0007](adr/0007-formula-weight-prototype.md); passing software tests does not establish weight accuracy.

## Runtime and persistence

The implementation uses Python 3.13 through uv, SQLAlchemy/Alembic, and PostgreSQL, without an automatic SQLite fallback. The approved dedicated PigWeigh Railway project exists; separate web/API/PostgreSQL and volume creation is staged, with existing projects untouched. The initial 17-change apply attempt was cancelled because the deployment tool reported absent approval. On 2026-10-19 the user subsequently chose “Keep staged for now”, intentionally deferring deployment; zero deployments have occurred. Actual resource IDs and pending operations are in [deployment status](deployment.md). The reviewed [deployment-readiness report](research/railway-deployment-readiness.md) and local integration checks establish synchronous Psycopg 3/Python 3.13 compatibility, not Railway runtime success.

Four minimal tables: `admin`, `session`, immutable `price_record`, and singleton `price_state` for atomic current-price revision. Retain historical price records internally; no public history, offline writes, or realtime sockets in this stage.

Provision admins through a CLI that prompts for a password; no default credentials or registration. Hash passwords with Argon2. Use opaque, revocable, database-backed sessions expiring after eight hours. Cookies are HttpOnly and SameSite=Lax, with Secure on HTTPS. Validate the exact configured Origin on unsafe methods. Route `/api` through a same-origin Next.js rewrite; authentication responses must not be cached.

Accept only PostgreSQL connection schemes (`postgres`, `postgresql`, `postgresql+psycopg`); normalize through SQLAlchemy URL parsing to the Psycopg dialect without logging credentials or damaging query parameters/encoding. Use finite connection timeout, bounded pooling, and pre-ping. Alembic owns schema creation/migration, not application startup. No database connection or API fetch is required during build.

Railway topology: public web only, private API and PostgreSQL, no public API/DB domains or TCP proxy. Set `BACKEND_INTERNAL_URL` for web at build time: Next records the rewrite destination then, but its network requests occur at runtime; changing the destination requires rebuilding. Keep backend/database secrets out of browser/public variables. Bind Railway API to `::`; verify private connectivity and health after provisioning. Run Alembic in API pre-deploy, then start the locked runtime without dependency installation. Health checks separate API/database availability from inference readiness; missing models do not make the core service unhealthy. Preserve Origin/cookies/status through the proxy, no-store auth/current-price/readiness responses, and verify paired-upload proxy behavior against backend body bounds.

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
| `POST /estimates` | Anonymous multipart, exactly `top_image` and `side_image`, representing the same pig | Valid uploads currently return `503 inference_unavailable`; future experimental success when compatible pose checkpoints, explicit marker/geometry configuration and the measurement/formula pipeline are ready |

Identifiers and timestamps in JSON are strings; `published_at` is an ISO 8601 UTC timestamp. `revision`/`expected_revision` are nonnegative integers. Unauthenticated protected requests return `401`; invalid Origin returns `403`. Request validation uses `422`. Authentication failures must not reveal which credential was wrong.

Future formula-estimate success shape (wire/price contract unchanged):

```json
{
  "status": "estimated",
  "estimated_weight_kg": "<decimal string>",
  "valuation": {
    "amount_php": "<two-decimal string>",
    "price": {
      "id": "<price id>",
      "php_per_kg": "<two-decimal string>",
      "source_reference": "<reference>",
      "published_at": "<UTC timestamp>"
    }
  },
  "artifacts": { "bundle_id": "<reviewed bundle id>" }
}
```

When no price exists, return the valid weight with `valuation:null` and `valuation_unavailable_reason:"no_price"`. The template above is a contract illustration, not synthetic inference success. A valid upload with unavailable inference never receives numerical output.

## Price and valuation invariants

- A published price is positive PHP/kg with at most two decimal places; keep exact integer centavos in PostgreSQL `BIGINT` with a positive constraint and return canonical two-decimal strings. This preserves a single exact minor-unit representation rather than introducing a second `NUMERIC` money model. Reject signed-64-bit overflow explicitly; a narrower practical UI cap has not been selected. Trim leading/trailing whitespace from `source_reference`, then require length 1–500 while retaining interior spaces. Reject malformed/nonfinite values rather than coercing them.
- Price records are immutable and immediately effective at publication; no scheduling/end-date editor in this stage. Record publishing admin and server time internally.
- Initialize singleton `price_state` in the migration. Publication locks it with PostgreSQL `SELECT FOR UPDATE`, compares `expected_revision`, and updates it atomically in the same transaction as the new record. A stale request returns `409` and rolls back the entire transaction, leaving no record behind. Never hold that lock during password hashing, image decoding, or inference; prove the concurrent-publication invariant against actual PostgreSQL.
- After successful inference, capture the current-price snapshot once. Multiply using Decimal and round the final PHP value with `ROUND_HALF_UP` to two decimals. Preserve that price provenance in the response; later publication must not alter an already computed valuation.

## Upload boundary and inference hold

The user accepts new prototype/evaluation captures using flat ArUco cards attached near measured back/flank regions, with controlled-pen phone top/side views and taught guidelines; see [ADR-0006](adr/0006-controlled-capture-guidelines.md). This supersedes earlier floor/wall references. The printed sticker goes on a flat removable card; preserve visible corners/white margin, measure the black square and avoid landmarks. This reduces offset without proving whole-body coplanarity. The user selected the 11900 formula with ellipse-proxy girth; fitted weight regression and prior error evaluation are not prototype prerequisites. Marker size/dictionary, precise feature geometry, capture rejection and artifact configuration remain to be specified. [Verified prepared pose copies](research/pose-preparation.md) are ready for user-run training; missing weight calibration is not a pose-training hold. Use the prepared copies rather than unconverted exports.

Implemented bounds: 10 MiB per file, 21 MiB whole request, and 20 megapixels per decoded image. The body is bounded before multipart parsing. Accepted decoded formats are JPEG, PNG, and WebP; actual content is checked, EXIF orientation applied, and animation rejected. Missing/extra/invalid pairs receive `422`, oversized input `413`, and unsupported image content `415`. Photos are not permanently stored or logged. Upload cleanup and multipart completion have focused regression coverage, including unfinalized spools. Supplying two images does not by itself prove same-pig identity; that remains a capture requirement and research validation concern.

Inference remains blocked by missing compatible top/side serving pose checkpoints, concrete marker/geometry configuration and the actual measurement/formula pipeline. Canonical preparation and installed Ultralytics loader checks passed for all 4,412 prepared images/4,419 objects. Eleven native tests and independent review passed; original hashes and retained/excluded weight provenance are unchanged. The user can train pose independently of weight calibration. No model/GPU/training execution or exhaustive anatomy/split-independence proof is claimed. See [prepared-copy evidence and commands](research/pose-preparation.md). See [historical annotation audit](research/training-readiness.md) and the current [selected formula contract/source inspection](research/selected-weight-formula.md). Use actual derived centimeter measurements with Ramanujan-II ellipse girth and the selected divisor 11900, recording formula/configuration versions. Formula-derived output is an experimental estimate with unmeasured accuracy; no learned weight regression or prior held-out acceptance is required. Missing/unusable landmarks or markers still reject/unavailable; no fake confidence, class-label weight fallback or guessed physical scale. The detailed artifact schema, capture bounds and error gates remain unresolved.

## Implemented interface structure

Both surfaces use Operate mode and clear experimental-thesis wording. On anonymous `/`, show current price and source, then explicitly labeled top/side photo review-and-replace controls: side by side on desktop, stacked on phones. Put readiness, actionable errors, and the result directly below the capture controls. Explain that photos are not retained; unavailable inference must remain explicit rather than showing a fabricated result or keypoint overlay.

On `/admin`, login is shown when unauthenticated; after server verification, the page shows the current price and publication form with price, source reference, and stale-revision feedback. The implementation preserves cream `#F3EBDF`, dark red `#6A1314`, primary red `#A40000`, system-font typography, Tailwind, and native form semantics. This is a code-led interface with no approved visual comp; frontend-only layouts, keyboard access and offline states received bounded Chrome checks; graphical login/publication/upload flows remain unverified. No fabricated imagery, results, exact accuracy metrics, or trading-fitness claims.

## Implementation and verification boundary

Core authentication, price publication, bounded uploads, readiness and truthful unavailable states are implemented independently of training. FastAPI, Uvicorn, SQLAlchemy, Alembic, `psycopg[binary]`, `python-multipart`, `pwdlib[argon2]` and Pillow are used, with pytest/HTTPX for development checks. A settings package was not needed. Torch, OpenCV, NumPy and serving-runtime selection remain future artifact-dependent work; preserve the separate training environment.

Task-owned portable PostgreSQL supplied real integration tests without SQLite substitution or existing cloud databases. [Backend verification](../server/VERIFICATION.md) records 28 PostgreSQL tests and the live eight-route proxy smoke, followed by 11 focused multipart regressions after an independent review fix. The earlier PostgreSQL suite was not rerun for that upload-only fix. Docker's unavailable engine prevented an image build. The stopped original test cluster remains under the documented cleanup limitation; the reusable runner cleaned its separate cluster.

The implemented frontend passed lint, typecheck, a production build and four helper tests, plus HTTP checks of `/`, `/admin` and `/health`; independent frontend review found no P1/P2 issues. Checks ran on available Node 24.13.0 with an engine warning; the pinned Node 22 platform runtime remains unverified. See [frontend instructions and verification status](../web/README.md). The earlier backend record's instruction for the UI writer to rerun frontend checks is historical and is satisfied by these later checks. No composition approval is implied. The user authorized Chrome QA. [Recorded frontend-only checks](qa-browser.md) cover desktop/phone layouts, selected keyboard paths and offline states before the attached-card capture-copy update. The later copy update passed lint/typecheck/four helper tests, with no subsequent build or graphical verification; full-stack setup was blocked by policy, leaving graphical authentication/publication/photo-upload behavior unverified.

The dedicated PigWeigh Railway target and PostgreSQL choice are settled; actual IDs are recorded, while the user has explicitly deferred deployment by choosing “Keep staged for now” on 2026-10-19. Application configuration, deployment and runtime verification remain pending as detailed in [deployment status](deployment.md). Persistent image retention is outside this no-retention stage. The 11900 formula method is selected; concrete artifact/marker/geometry configuration and integration remain unresolved. Scale-error evaluation can follow implementation, and fitted correction remains optional. Nothing in this contract certifies trading fitness or numerical weight accuracy.
