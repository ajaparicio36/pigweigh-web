# PigWeigh API

PostgreSQL-only FastAPI service for admin sessions, immutable PHP/kg publication and paired-photo formula estimation. The reviewed ONNX serving bundle is included at `models/v1`; absent or incompatible artifacts return `503 inference_unavailable`. The selected 11900 formula is experimental with unmeasured accuracy. No regression prerequisite, fabricated confidence or class-label weight fallback is used. The global model-training Python environment is separate.

## Development

Use PowerShell 7, uv and Python 3.13. Install locked dependencies from this directory:

```powershell
uv sync --frozen
Copy-Item .env.example .env
```

Set `.env` to a dedicated local PostgreSQL database and an exact `PUBLIC_ORIGIN`, with no trailing slash. Do not commit credentials. Only PostgreSQL URLs are accepted and are normalized to Psycopg 3. No automatic schema creation or SQLite fallback occurs.

The example already sets `PIGWEIGH_MODEL_BUNDLE=models/v1/manifest.json`, relative to this server working directory. See [CPU photo inference](#enable-cpu-photo-inference) for the bundle/marker contract; explicitly removing this setting keeps estimation unavailable.

```powershell
uv run --env-file .env alembic upgrade head
uv run --env-file .env python -m pigweigh.cli create-admin --username admin
uv run --env-file .env uvicorn pigweigh.main:create_app --factory --host 127.0.0.1 --port 8000
```

Admin creation requires an interactive terminal and prompts twice for a 12–128 character password. No default user/password is seeded. Username is normalized to lowercase and accepts 3–64 letters, digits, dots, underscores or hyphens. Sessions expire after eight hours, are revoked on logout/rotation, and cannot authorize a disabled admin. Only token hashes are stored. The process admits at most 20 login attempts per minute globally and two simultaneous password verifications. Run one API process/replica; revisit this process-local protection before scaling. Cookies are HttpOnly/SameSite=Lax/Path=/; Secure is automatic for HTTPS origins. HTTP origins are restricted to loopback development.

Copy `web/.env.example` to `web/.env.local` and configure `BACKEND_INTERNAL_URL=http://127.0.0.1:8000`. The Next rewrite destination is captured during build, so rebuild after changing it. Browser requests stay same-origin; do not publish a backend URL or DB credential through NEXT_PUBLIC variables.

## Requests and frozen UI contract

All errors use `{"error":{"code":"...","message":"...","details":{}}}`. Passwords and raw validation input are never echoed. IDs and UTC timestamps are strings; revisions are integers. Money is a canonical two-decimal string. Responses are `Cache-Control: no-store`. Every unsafe request requires exactly the configured Origin, including anonymous multipart uploads and login. There is no cross-origin API permission.

Public examples (assumes web on port 3000):

```powershell
curl.exe http://localhost:3000/api/health
# 200 {"status":"ok"}; 503 database_unavailable when DB connectivity fails
curl.exe http://localhost:3000/api/inference/readiness
# 200 {"ready":true,"blockers":[]}, or ready:false with actual bundle/configuration blockers
curl.exe http://localhost:3000/api/prices/current
# 200 {"revision":0,"price":null}, or a committed price snapshot
curl.exe -H 'Origin: http://localhost:3000' `
  -F 'top_image=@D:/captures/top.jpg' -F 'side_image=@D:/captures/side.jpg' `
  http://localhost:3000/api/estimates
# Configured usable pair: 200 estimate; missing bundle: 503 inference_unavailable; unusable capture: 422
```

Exactly one `top_image` and one `side_image` file are required. Both must depict the same pig; the software does not claim to verify identity. JPEG, PNG and WebP are decoded and EXIF-oriented, not trusted from extensions. No animation; maximum 10 MiB/file, 21 MiB/body and 20 million decoded pixels/image. Missing/extra/malformed pairs return 422; unsupported formats return 415; body/file/pixel limits return 413. The body boundary permits two uploads, while only one decoded pair/inference operation runs at a time; busy requests receive 429 without queuing CPU jobs. The body is bounded before multipart parsing, including chunked uploads. No photos are retained or logged; temporary spools and decoded images close on every outcome. Request cancellation joins the actual CPU worker before releasing its slot and resources. The API does not claim to verify anatomical card attachment or same-pig identity.

For login, construct a temporary body from a secure terminal prompt rather than putting a password into history. This example holds a cookie jar only for the current shell and cleans it up:

```powershell
$secret = Read-Host 'Admin password' -AsSecureString
$credential = [PSCredential]::new('unused', $secret)
$body = @{ username = 'admin'; password = $credential.GetNetworkCredential().Password } | ConvertTo-Json
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
try {
  Invoke-RestMethod http://localhost:3000/api/auth/login -Method Post `
    -WebSession $session -ContentType application/json -Headers @{Origin='http://localhost:3000'} -Body $body
  # 200 {admin:{id:"1",username:"admin"}}; incorrect credentials: 401 invalid_credentials
  Invoke-RestMethod http://localhost:3000/api/auth/session -WebSession $session
  # Same identity after live DB verification; expired/revoked/disabled sessions: 401
  $current = Invoke-RestMethod http://localhost:3000/api/prices/current
  $price = @{php_per_kg='210.50';source_reference='DA publication reference';expected_revision=$current.revision} | ConvertTo-Json
  Invoke-RestMethod http://localhost:3000/api/prices -Method Post -WebSession $session `
    -ContentType application/json -Headers @{Origin='http://localhost:3000'} -Body $price
  # 201 {revision:1,price:{id:"1",php_per_kg:"210.50",source_reference:"DA publication reference",published_at:"...Z"}}
  Invoke-RestMethod http://localhost:3000/api/auth/logout -Method Post -WebSession $session -Headers @{Origin='http://localhost:3000'}
  # 204; cookie expires and the session is revoked
} finally { $body = $null; $credential = $null; $secret.Dispose(); $session = $null }
```

Publication requires a positive decimal string with at most two fractional digits, bounded by signed 64-bit centavos (`92233720368547758.07` PHP). Source references are trimmed then checked for 1–500 characters. A stale revision returns `409 stale_price_revision`; fetch the new current price and require review before resubmission. Publication locks the singleton in PostgreSQL and commits the immutable record/current revision together. Historical records have no edit/delete endpoint and a DB trigger forbids mutation. Current-price reads use one joined snapshot. The isolated Decimal valuation helper uses ROUND_HALF_UP for centavos and retains a supplied snapshot; it is not an inference method and is not exposed as fake output.

## Experimental measurement formula

`pigweigh.formula.estimate_weight_kg(girth_cm, body_length_cm)` applies the user-selected `G_cm² × L_cm / 11900`. The [selected reference](https://pigweightcalculator.org/) displays that metric expression, but its live calculator uses inch/pound arithmetic equivalent to a metric divisor of about 14451. The app deliberately follows the user's chosen 11900 experimental coefficient; it does not claim those expressions are equivalent or adopt the site's accuracy claims.

The reference describes tape girth directly behind the front legs and over the shoulder blades, with body length along the spine from ear base to tail base. `ellipse_girth_cm(chest_width_cm, chest_depth_cm)` uses Ramanujan II with semiaxes width/2 and depth/2. Chest width/depth from two photos would produce an approximate girth proxy, not a directly measured tape circumference; photo-derived body length is also a proxy for the tape path. Both helpers accept already obtained positive finite centimeter measurements and reject invalid or unrepresentable results. They apply no biological range clamp or invented confidence.

Pure arithmetic example from this directory (this is not a photo estimate):

```powershell
uv run --frozen python -c "from pigweigh.formula import estimate_weight_kg; print(estimate_weight_kg(100, 100))"
# Approximately 84.03361344537815 kg from explicitly supplied 100 cm girth and 100 cm length
```

Readiness now checks the configured bundle and loads both actual CPU models once per application lifespan, including warmup. Missing configuration yields `model_bundle_missing`; invalid files, checksums, canonical names, ONNX metadata/shapes or marker/method configuration yield `model_bundle_invalid`. Both are unavailable states rather than failed pricing/admin health. A runtime model failure disables readiness with `inference_runtime_failed` until restart. There is no automatic reload or model download. A trained weight regression or held-out calibration is not required; later comparisons against scale weights assess error.

### Enable CPU photo inference

The user explicitly authorized including the deployable bundle in Git: `server/models/v1/manifest.json`, `top.onnx`, and `side.onnx`. The source export at `D:/pigweigh-inference-artifacts/v1` remains unchanged. Local `.env.example` uses `models/v1/manifest.json`; Docker copies the same three-file directory and sets `/app/models/v1/manifest.json`, so runtime needs no developer drive or remote model download. Exact Git/Railway allowlists and Git attributes preserve only this serving release, including original manifest bytes. Training `.pt` checkpoints, source images/data and environments remain excluded. The serving environment uses ONNX Runtime CPU, NumPy and exactly one OpenCV provider (`opencv-python-headless` 4.13 with ArUco); it contains no Torch/Ultralytics training dependency.

The version-1 manifest contains `schema_version:1`, a content-derived `bundle_id`, `method:"attached-marker-ellipse-11900-v1"`, `formula_divisor:11900`, and `marker:{dictionary:"DICT_4X4_50",id:0,side_mm:100}`. `models.top` and `models.side` declare a relative `file` inside the bundle, lowercase SHA256, exact canonical `keypoints`, `input_size:640`, `input_shape:[1,3,640,640]`, output shapes `[1,300,39]` and `[1,300,45]`, and `end2end:true`. Extra export/source provenance is retained in the manifest. The actual ONNX task, single pig class, keypoint names/shape and end-to-end metadata must agree. No extra NMS is applied to the exported end-to-end rows.

Both photos must contain one complete flat `DICT_4X4_50` ID 0 marker; measure its **black square**, which must be 100 mm on each side. The white margin is not part of the measurement. ArUco detection uses full EXIF-oriented resolution. Pose inference uses RGB float32/255 with centered 640-pixel letterboxing and pad 114; coordinates are mapped back through the actual rounded resize/padding.

Each view uses its own marker-corner-to-10-cm-square homography. Top length is the distance between the **projected** ear-base midpoint and tail base; width is projected left-chest to right-chest. Side depth is projected withers to sternum. There is no snout/tail-tip/hoof/belly fallback. An ellipse approximation gives girth, followed by G²L/11900. These remain local reference-plane proxies for a curved body and a tape path. Matching pig identity, marker attachment and posture are capture requirements, not automatically verified facts.

The initial box and required-keypoint thresholds are both 0.5, an engineering usability gate rather than measured accuracy. Zero/multiple pigs, absent/wrong/multiple markers, low-confidence or out-of-image required points, degenerate/horizon-crossing projections, and unusable numeric/reporting precision return 422 with an actionable code and view. No biological weight range is clamped. Measurements and weight are positive two-decimal strings; positive values rounding to `0.00` are rejected. The exact returned Decimal weight is multiplied by the price snapshot queried **after** CPU inference, with HALF_UP PHP rounding. No DB transaction/connection is held during inference.

Success preserves `status`, `estimated_weight_kg`, `valuation` and `artifacts.bundle_id`, adding four strings under `measurements`: `body_length_cm`, `chest_width_cm`, `chest_depth_cm`, `girth_cm`. `method` contains version `attached-marker-ellipse-11900-v1`, formula `G_cm^2 * L_cm / 11900`, dictionary `DICT_4X4_50`, ID 0, `marker_side_mm:"100"`, `experimental:true`, `accuracy_evaluated:false`. No model confidence is presented as kilogram accuracy. Without a price, weight is preserved with `valuation:null` and `valuation_unavailable_reason:"no_price"`; a valued result omits that reason.

The focused formula/readiness/upload checks need no PostgreSQL connection:

```powershell
uv run --frozen pytest -q tests/test_formula.py tests/test_inference.py tests/test_multipart_cleanup.py --tb=short
```

## PostgreSQL tests and HTTP proxy proof

Never aim tests at a deployed/user database. The test guard requires a loopback nondefault port, `pgtest` user, a `pigweigh_test_` database prefix and an exact reset opt-in. There is no SQLite substitute. With trusted PostgreSQL 15/16 Windows server binaries available, this runner creates a temporary SCRAM-authenticated loopback cluster and database, runs the tests, stops it and verifies its owned absolute path before deletion:

```powershell
pwsh -File scripts/test-postgres.ps1 -PostgresBin 'C:/path/to/trusted/pgsql/bin'
```

Alternatively set `PIGWEIGH_TEST_DATABASE_URL` and `PIGWEIGH_TEST_ALLOW_RESET` to the exact name of a separately provisioned disposable local test DB, then `uv run pytest -q`. Tests truncate all app tables and prove initial migration down/up only there. They verify real PostgreSQL concurrent revision locking, rollback/immutability, credentials/session expiry/revocation, Origin, decimal bounds, upload formats/EXIF/limits/spool cleanup and truthful inference unavailability.

For opt-in actual ONNX/API/price proof, set `PIGWEIGH_TEST_MODEL_BUNDLE` to the packaged manifest and `PIGWEIGH_TEST_PAIR_DIR` to the private `D:/pigweigh-pose-data/test` before running the isolated PostgreSQL runner. The test uses the explicitly named generated-image pair without copying either image into source. It verifies actual CPU readiness/measurement, no-price weight preservation, admin publication, Decimal valuation/provenance and missing-marker rejection. Generated images establish functionality only, not real pig weight or accuracy.

```powershell
$env:PIGWEIGH_TEST_MODEL_BUNDLE = (Resolve-Path models/v1/manifest.json).Path
$env:PIGWEIGH_TEST_PAIR_DIR = 'D:/pigweigh-pose-data/test'
pwsh -File scripts/test-postgres.ps1 -PostgresBin 'C:/path/to/trusted/pgsql/bin'
```

`tests/proxy_smoke.py` is an optional live HTTP check, not a production test. It expects the same isolated database fixture with its test-only admin and sends a real 12 MiB pair through a built Next server. Start API on 18080 with `PUBLIC_ORIGIN=http://localhost:13000`; build web with `BACKEND_INTERNAL_URL=http://127.0.0.1:18080`, then start Next on 13000. Run `uv run python tests/proxy_smoke.py`. It exercises all eight routes, cookies, protected publication, stale revision, upload-unavailable and Origin rejection. Do not run against deployment credentials.

## Railway

Use a dedicated project with `/server` API root and `/web` frontend root. Select repository-absolute config paths `/server/railway.toml` and `/web/railway.toml`. Only web receives a public domain. Keep API and PostgreSQL private, no DB TCP proxy. Configure API `PORT=8000`, private database `DATABASE_URL` reference and exact HTTPS web `PUBLIC_ORIGIN`. Configure web's build/runtime `BACKEND_INTERNAL_URL` from the actual API private domain and port; changing it requires a rebuild. Do not access DB or API during build.

Backend Docker image installs `uv.lock` without dev packages and runs as a nonroot user. Its command runs `pigweigh.main:create_app --factory`, binding `::` and `$PORT`. Run `.venv/bin/alembic upgrade head` as pre-deploy with a finite platform timeout (recommend 120 seconds). Failed migrations must halt rollout; rollback does not undo committed DB migrations. Serialize migrations/deployments initially. No admin is created by deployment; use an explicitly targeted interactive Railway SSH terminal to run `.venv/bin/python -m pigweigh.cli create-admin --username admin` inside the API service.

API health `/api/health` checks DB connectivity independently of unavailable inference. Web configuration targets the UI-owned local `/health` route. Railway checks are deploy-time, not continuous uptime monitoring. One replica/process is configured; no persistent web/API volume is needed. Build/container execution and Railway deployment require later platform verification; no deployment is claimed by this source.
