# Backend verification record

## Serving bundle packaging — 2026-10-23

The user subsequently authorized ordinary Git inclusion of the deployable serving bundle before browser QA. Copied exactly manifest.json, top.onnx and side.onnx from `D:/pigweigh-inference-artifacts/v1` to `server/models/v1`; no training checkpoint, source export image or training-data file was included. The original export was unchanged. Each original, working-tree copy and actual staged Git blob has identical SHA256:

| File | Bytes | SHA256 |
|---|---:|---|
| manifest.json | 2,826 | `81ffd83f099a6fe1e3965b2efc2bb4a5555af5000dfcadf45ae1a9ab6d77cea2` |
| top.onnx | 40,355,879 | `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa` |
| side.onnx | 40,817,006 | `ed40cb8d60da95b1f8eb1c955b7e52fc70bfb00bf798eb2a57a52a2d4e175c72` |

Exact Git/Railway ignore exceptions permit this release only. `server/.gitattributes` prevents manifest CRLF normalization and treats ONNX as binary. The index was scoped to these three bundle files plus `.gitignore`, `.railwayignore` and `server/.gitattributes`; earlier implementation edits were left unstaged by this worker. No commit, push or deployment was performed.

Docker now copies `models` inside the server-only context and sets `PIGWEIGH_MODEL_BUNDLE=/app/models/v1/manifest.json`. The local example actively sets relative `models/v1/manifest.json`. `uv run pytest -q tests/test_packaged_bundle.py --tb=short` from `server/` passed **1 focused test**: actual packaged hashes/metadata/CPU warmup reached ready=true via the example's relative path, without a developer-drive artifact reference or DB connection. Git `cat-file` binary streams independently verified exact staged bytes. Docker image execution was not performed; no claim of deployment readiness beyond this packaging/load proof is made.

## Current inference verification — 2026-10-23

The backend now executes the user-selected experimental 11900 formula from actual CPU pose/ArUco measurements. This supersedes the historical unavailable-only implementation below when a valid private bundle is configured. It does not establish pig-weight accuracy, marker attachment correctness or trading fitness.

- Added only backend serving dependencies through the existing uv Python 3.13 environment: ONNX Runtime 1.31.0, NumPy 2.5.4, and one OpenCV provider, opencv-python-headless 4.13.0.92 with ArUco. No Torch or Ultralytics was installed into serving and the global training environment was unchanged.
- The export owner provided `D:/pigweigh-inference-artifacts/v1/manifest.json` with content-derived bundle ID `attached-marker-ellipse-11900-v1-5dd3bd4779d7539a`. Both local ONNX model checksums, fixed float32 640 inputs, end-to-end output shapes top `[1,300,39]`/side `[1,300,45]`, actual ONNX canonical landmark metadata and single pig class were verified during application loading, followed by actual CPU warmup. No download or silent reload occurs.
- The generated-image pair at `D:/pigweigh-pose-data/test` worked through the actual models: formula output 149.25 kg from length 96.44 cm, width 30.62 cm, depth 54.13 cm and ellipse girth 135.70 cm. These numbers are functional output from generated images, **not measured real pig weight or accuracy evidence**. Both cards use the configured DICT_4X4_50 ID 0 and 100 mm black square. Images and model artifacts remained private and unchanged.
- Initial complete PostgreSQL run passed 68 tests. Independent review then identified two P2 issues: projective matrix signs must be normalized to the marker's own horizon branch, and direct/repeated request task cancellation must not release the CPU slot or images while the worker is still running. Both were fixed and have focused regressions. The reviewer independently reran both targeted tests successfully and reported no remaining P1/P2 in the reviewed scope.
- Final no-database formula/inference/multipart run: `uv run pytest -q tests/test_inference.py tests/test_formula.py tests/test_multipart_cleanup.py --tb=short` — **44 passed**. Coverage includes projection/scale/ear midpoint, positive and opposite horizon branches, actual ArUco missing/wrong/duplicate markers, resize inversion and thin-image 422, confidence/out-of-image/nonfinite/pig-count rejection, checksum/schema/metadata mismatch, readiness/runtime failure, image/spool cleanup, and a blocking CPU worker test with repeated cancellation and a second request receiving 429.
- Final complete run with `PIGWEIGH_TEST_MODEL_BUNDLE` and `PIGWEIGH_TEST_PAIR_DIR` set, through the existing `scripts/test-postgres.ps1` isolated-cluster runner — **73 passed** in 8.70 seconds. This rerun was required after the material geometry/cancellation/runtime changes. It includes actual ONNX/API/PostgreSQL proof: ready=true, successful formula output without a price preserving weight, admin publication followed by valuation using the exact returned Decimal weight and committed price snapshot, no checked-out inference-time DB connection, missing-marker 422, migrations, authentication, publication concurrency/immutability and all upload regressions.
- The final new cluster `pigweigh-pg-test-d8424cea311149c59dd79f2ec66c2d0a` was stopped and removed by its runner. The earlier new cluster used for the 68-test run was also stopped/removed. These runs used existing trusted portable binaries read-only; no existing/cloud database, global installation, original blocked temporary directory or browser was changed. No API/Next server was left running by these checks.
- Starlette's existing HTTPX TestClient deprecation warning remains; current locked tests pass. No Docker build or Railway deployment was attempted. Frontend work/checks are owned and recorded separately.

Use the [backend runbook](README.md#enable-cpu-photo-inference) to set `PIGWEIGH_MODEL_BUNDLE` before launching a usable local API. Without that explicit private setting, readiness correctly reports `model_bundle_missing` and valid uploads remain unavailable. Local PostgreSQL configuration is still required to run the app; tests provision only disposable task-owned databases.

## Historical core verification — 2026-10-19

Verified locally on 2026-10-19; no deployment or browser control performed.

- `uv sync` created the locked Python 3.13 backend environment; `uv lock --check` passed.
- Trusted portable PostgreSQL 16.2 archive from `https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64-binaries.zip` matched SHA256 `C510B3058C161479BFBE0AEAC878CA682B344FD9385C58A359690147A4CA1A6C`, using the checksum in the installed Chocolatey distribution's package metadata. No system installation or service was changed. This older PostgreSQL version was used only for disposable loopback tests.
- Initial task-owned cluster used SCRAM authentication, loopback port 12240 and database `pigweigh_test_backend`. Passwords were randomly generated and never printed. Existing/cloud databases were not contacted.
- Final `pwsh -File scripts/test-postgres.ps1 -PostgresBin <verified portable bin directory>` passed **28 tests**, including actual PostgreSQL migration upgrade/downgrade/upgrade, concurrent price publication, rollback, immutability, auth/CLI/session gates, bounds/EXIF and upload spool cleanup. This runner's separate temporary cluster was stopped and deleted successfully.
- Live Uvicorn on 18080 plus built Next on 13000 passed `uv run python tests/proxy_smoke.py`: all eight public routes through the actual rewrite, cookie roundtrip/no-store, protected publication/stale revision, Origin rejection and a 12 MiB paired upload returning truthful unavailable inference.
- `pnpm build` passed on the pre-UI scaffold with the proxy configured. Initial `tsc` before Next generated its route types reported missing scaffold LayoutProps; the build generated these types and subsequent `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/eslint/bin/eslint.js` passed. The desktop command runner intermittently rejected the Windows pnpm shim, so direct installed Node entry points were used for those checks and `next start`.
- `uv run python -m compileall -q pigweigh migrations tests` and `git diff --check` passed. No Docker image was built because the Docker engine was unavailable. No Railway build, private-network/IPv6 runtime check or cloud mutation was performed. The UI writer must rerun frontend checks after its changes.

Two issues caught and repaired during proof: parser-limit multipart failures are normalized from Starlette's 400 to the agreed 422; persisted price timestamps are normalized to UTC even when PostgreSQL's session timezone is +08:00. Regression checks cover both.

The installed Starlette TestClient warns that HTTPX support is deprecated in favor of HTTPX2. Current locked tests pass; this is a future test-tool compatibility notice, not a runtime failure.

## Multipart EOF follow-up

An independent review found that Starlette's multipart parser could return an incomplete FormData on EOF: an unfinished second file's spool was omitted from FormData.close(), and two finalized files could be accepted without a final multipart boundary. A focused no-database regression run reproduced both defects (two failures, one valid-path pass) before the fix.

The upload boundary now owns the locked Starlette parser's complete spool registry and closes every spool in finally, including unfinalized parts and parser exceptions. An explicit on_end gate rejects missing completion before photo validation. The compatibility bridge uses Starlette 1.9's private registry and must be checked when upgrading that locked dependency.

`uv run pytest -q tests/test_multipart_cleanup.py --tb=short` passed **11 focused tests** after the fix: a rolled-to-disk truncated second file, missing final completion despite two returned files, valid pair still returning 503, parser-limit failures, missing/unknown/duplicate pair fields, decode rejection, file-size rejection and animation rejection. All created spools were explicitly closed. No PostgreSQL cluster, original blocked temporary directory, cloud service or UI file was touched; the earlier 28-test PostgreSQL suite was not rerun for this upload-only fix.

## Cleanup limitation

Owned Next/Uvicorn processes and the original PostgreSQL cluster were stopped; their ports 13000, 18080 and 12240 had no listeners afterwards. Automatic command approval rejected removal of the exact verified directory below and also rejected a narrower removal of its two throwaway credential files, with the reason `blocked by policy`. No alternate deletion mechanism was attempted.

`C:/Users/ajapa/AppData/Local/Temp/pigweigh-pg-7b17aa9f3f23407c95a4dd130f07342c`

That stopped cluster, portable binaries/archive and test-only credential files remain for manual cleanup. It contains no application/user database or production credentials. The reusable test runner's separate temporary cluster cleanup did succeed.

## Experimental formula follow-up, 2026-10-19

Implemented only the standard-library calculation core in `pigweigh/formula.py`: Ramanujan II ellipse circumference from chest width/depth in cm and the user's selected experimental `G_cm² × L_cm / 11900` weight expression. The source's displayed metric expression and different inch/pound calculator behavior are distinguished in README; no accuracy claim or regression fitting was added. Photo width/depth and body length remain proxies for the reference's tape measurements.

Updated readiness's four blockers to actual serving landmark-contract/model, marker geometry and measurement-pipeline gaps. Removed trained/validated weight calibration as a mandatory prototype capability gate. The real upload route still validates/closes both files and returns `503 inference_unavailable` without numerical output. Auth, PostgreSQL, upload limits, Decimal currency, dependencies and deployment configuration are unchanged.

`uv run --frozen pytest -q tests/test_formula.py tests/test_multipart_cleanup.py --tb=short` passed **22 tests**: selected divisor/unit arithmetic, circle/ellipse symmetry/scaling, positive/finite validation, output overflow/underflow, representable extreme arithmetic, actual readiness HTTP response, and existing multipart EOF/cleanup/rejection checks including the valid-pair 503 response. The known Starlette HTTPX deprecation warning remains. No PostgreSQL cluster, live server, browser, new package, GPU task, training, source image/checkpoint or deployment was used. These checks prove arithmetic and honest unavailability, not photo measurement or weight accuracy.
