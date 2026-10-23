# Local CPU inference runbook

Current implementation: 2026-10-23. The API runs real top/side ONNX pose inference, detects the configured attached ArUco marker, measures named proxies and applies the selected 11900 formula. The user now approves the three serving files in ordinary Git for later deployment. A server with no usable configured bundle remains unavailable. Railway stays staged; this runbook does not deploy.

## Versioned serving bundle and isolated export environment

The user-trained checkpoints were first exported into the private working directory below. The approved release location preserves the same manifest/model content:

```text
D:/pigweigh-inference-artifacts/v1/manifest.json
repository release: server/models/v1/{manifest.json,top.onnx,side.onnx}
bundle_id: attached-marker-ellipse-11900-v1-5dd3bd4779d7539a
```

The API loads `top.onnx` and `side.onnx` relative to the manifest, not original `.pt` files. The user's narrow exception permits exactly these three release files in **ordinary Git, no LFS**; both ONNX files are under 41 MB each. Verify hashes match the working bundle before release. Keep source images/checkpoints, `source-copies/`, other export artifacts and credentials excluded. Future exports still use a fresh private output directory before verified release copies. [Export instructions/evidence](../training/README-export.md) record the isolated `D:/pigweigh-export-env` and unchanged originals/global training environment.

Backend dependencies come from `server/pyproject.toml` and `uv.lock`: Python 3.13, CPU `onnxruntime`, NumPy and the sole `opencv-python-headless` provider, alongside the existing API stack. Do not add a second OpenCV distribution or install serving packages globally. Camera/marker detection is provided by this locked OpenCV build; Torch/Ultralytics is not a serving dependency.

## Start the API with the repository bundle

Use a dedicated local PostgreSQL database and the exact web Origin. Follow [backend development instructions](../server/README.md#development) for local `.env`, migrations and interactive admin provisioning; do not use deployment/user databases for tests. From `D:/pigweigh-web/server`:

```powershell
uv sync --frozen
# Configure local DATABASE_URL and PUBLIC_ORIGIN in the private .env first.
uv run --env-file .env alembic upgrade head
$env:PIGWEIGH_MODEL_BUNDLE='models/v1/manifest.json'
uv run --env-file .env uvicorn pigweigh.main:create_app --factory --host 127.0.0.1 --port 8000
```

The relative value assumes the working directory is `D:/pigweigh-web/server`; the corresponding image path is `/app/models/v1/manifest.json`. The variable points to **manifest.json**, not its directory. `server/.env.example` uses the repository-relative path; remove conflicting old private-path overrides. Models load and CPU warm up at startup; restart after changing bundles. Run one API process initially. Two ONNX intra-op threads, one inter-op thread and two OpenCV threads bound concurrency; this is not a throughput benchmark.

Start the web using [frontend instructions](../web/README.md), with `BACKEND_INTERNAL_URL=http://127.0.0.1:8000` and API `PUBLIC_ORIGIN=http://localhost:3000`. Rebuild Next after changing its rewrite target. Then inspect:

```powershell
curl.exe http://localhost:3000/api/inference/readiness
# Loaded bundle: {"ready":true,"blockers":[]}
curl.exe -H 'Origin: http://localhost:3000' `
  -F 'top_image=@D:/captures/top.jpg' -F 'side_image=@D:/captures/side.jpg' `
  http://localhost:3000/api/estimates
```

Use actual local images of the same pig under the protocol below; the paths are usage examples. A readiness result is operational bundle readiness, not physical measurement accuracy. Missing configuration reports `model_bundle_missing`; failed schema/hash/runtime validation reports `model_bundle_invalid`, without local paths. A runtime failure changes readiness to `inference_runtime_failed`; inspect private artifacts and restart after correction. Valid decoded pairs with unavailable inference return 503. Core `/api/health` checks the database separately.

## Capture and implemented measurement

Use a flat `DICT_4X4_50` / ID 0 card near the measured region: back for the straight bird's-eye photo, flank for the straight-on side photo. **The actual outer black square must measure 100 mm = 10 cm**; white margin is additional and excluded from that length. Keep all corners/margin visible and do not cover landmarks. A Photoshop/document size setting or detected marker does not prove the physical print dimension; check the printed card with a ruler. The API assumes this configured physical size.

For each EXIF-oriented decoded image, OpenCV detects exactly one marker, maps its corners to a 10×10 cm plane, and uses the pose model to obtain required points. RGB images are letterboxed to 640×640 with fill 114, normalized by 255, then mapped back into the original oriented image before homography projection. The implementation uses:

| Quantity | Named points after per-view homography |
|---|---|
| `body_length_cm` / L | Top: midpoint of `left-ear-base` and `right-ear-base` to `tail-base` |
| `chest_width_cm` / W | Top: `left-chest` to `right-chest` |
| `chest_depth_cm` / D | Side: `withers` to `sternum` |
| `girth_cm` / G | Ramanujan II ellipse circumference, semiaxes W/2 and D/2 |
| `estimated_weight_kg` | G² × L / 11900 |

These are marker-plane proxies. A straight ear-to-tail chord differs from the tape's path along the spine; the chest section is approximated by an ellipse. The curved body, cross-view posture and residual marker/body offset are not reconstructed in 3D. The formula source displays 11900 but its calculator code uses an imperial conversion near 14450.9; [source inspection](research/selected-weight-formula.md) records this discrepancy. The explicit user choice remains 11900, with no borrowed accuracy claim or mandatory trained regression.

Exactly one class-0 pig at score ≥0.5 must be detected in each view, and each required landmark must score ≥0.5 and lie within the image. These are engineering usability gates, not “50% weight accuracy” or a confidence interval. Missing/extra/wrong markers, missing/multiple pigs, unusable points and unstable/invalid projections return 422 with a view and actionable rejection. The software does not verify same-pig identity, card attachment location or anatomical correctness of every prediction. One CPU estimate is admitted at a time; a competing request gets `429 inference_busy` (separate bounded upload admission can return `upload_busy`). Existing image/body limits and temporary-file cleanup still apply.

Success returns decimal strings for rounded weight and four measurements, plus bundle ID and method metadata: version, formula, dictionary, ID, `marker_side_mm:"100"`, `experimental:true`, `accuracy_evaluated:false`. The current price is read once **after** CPU computation; no database transaction spans inference. Valuation uses Decimal on the two-decimal reported weight and keeps that snapshot's provenance. With no price, keep the weight, `valuation:null` and `valuation_unavailable_reason:"no_price"`.

## Exact bundle boundary

Manifest schema 1 requires method `attached-marker-ellipse-11900-v1`, divisor 11900 and marker object `{"dictionary":"DICT_4X4_50","id":0,"side_mm":100}`. Per-view entries bind relative file, SHA256, canonical point list, `input_size:640`, `input_shape:[1,3,640,640]`, end-to-end mode and outputs `[1,300,39]` top / `[1,300,45]` side. Output rows are `xyxy,score,class_id,(x,y,visibility)…`; no extra sigmoid, transpose or NMS. Model metadata must agree on one `pig` class, pose task and 11×3 / 13×3 named points. The loader checks paths stay within the bundle, hashes, metadata, float input/shape and finite CPU warmup. [Export documentation](../training/README-export.md) records export options. Exact ordered `keypoints` arrays are:

```text
top: snout-tip, left-ear-base, right-ear-base, left-shoulder, right-shoulder,
     left-chest, right-chest, left-hip, right-hip, tail-base, spine-midpoint
side: snout-tip, eye, ear-tip, withers, mid-point-peak, loin, tail-base,
      front-shoulder-joint, front-hoof, rear-hip-joint, rear-hoof, sternum, belly-lowest-part
```

The exporter derives the bundle ID from canonical model/configuration JSON; runtime validates its permitted string form and model hashes. Do not describe the runtime as recomputing that ID. Private source-checkpoint hashes and parity evidence remain in the manifest; they are provenance, not biological accuracy.

## Evidence and remaining work

Export metadata/checker and CPU-versus-PyTorch parity passed on two mock images: maximum selected output difference `4.57763671875e-05` in model input units. A real local pipeline pass on mock imagery produced 149.25 kg; this is a functional fixture result only, not an actual pig's verified weight. Original checkpoints/images were unchanged.

The updated frontend passed lint, TypeScript, seven helper tests and a production build. [Final backend verification](../server/VERIFICATION.md) records 73 complete PostgreSQL-backed tests after material review fixes, including real ONNX/API no-price estimates, authenticated publication, exact Decimal valuation/provenance, no inference-time checked-out DB connection and missing-marker rejection. A final focused run passed 44 tests. Independent review verified fixes for marker-horizon branch normalization and repeated-cancellation worker/image/CPU-slot lifetime and found no remaining P1/P2 in scope. Both new disposable clusters were stopped/deleted. These are local API/TestClient checks, not a fresh live Next proxy or browser proof. October 19 [frontend-only browser QA](qa-browser.md) is historical; fresh Chrome QA is now approved after packaging, but has not yet run. Physical print size, same-pig captures and scale-weight error remain unverified. Comparing later estimates with actual scale weights can measure error; it need not block implementation.

For eventual Railway delivery, the selected repository-to-image delivery path uses the approved Git files: backend Docker `COPY models ./models` includes the bundle and `ENV PIGWEIGH_MODEL_BUNDLE=/app/models/v1/manifest.json` selects it at runtime. No external artifact mount, public download URL or LFS fetch is required for this version. A developer `D:/…` path does not exist in the image. Keep database credentials and source training data excluded. Docker/platform build, private networking and deployed runtime remain unverified and deferred; packaging does not authorize applying staged Railway changes.
