# Automatic photo-validation QA — 2026-10-30

Result: **32 bounded assertions passed**, plus real graphical Chrome upload/review checks, against the feature working tree based on `master` commit `b3d0960`. One visual defect was discovered, fixed by the UI owner and verified: selected photos were vertically clipped in their review frames. No remaining application defect was established in this scope.

These checks demonstrate software behavior with generated functional fixtures and simulated camera video. They do not measure pig recognition accuracy, physical marker scale, real-phone support or weight accuracy.

## Environment and boundaries

Root released the both-ready barrier after the API owner reported 93 focused tests passing (including 46 photo-validation tests and actual ONNX checks), and the UI owner reported lint, TypeScript, 24 tests and production build passing. QA waited before starting services. The later containment rebuild was coordinated: QA stopped its web server, the UI owner added the bounded CSS fix and rebuilt, then QA restarted and tested the affected bounds/layout.

- Local web: `http://localhost:3029`, Next production server bound to `127.0.0.1:3029`; compiled rewrite target `http://127.0.0.1:18300`.
- Local API: existing uv environment and repository serving bundle, bound to `127.0.0.1:18300`.
- `DATABASE_URL=postgresql://unused@127.0.0.1:1/unused`, `PUBLIC_ORIGIN=http://localhost:3029`, `PIGWEIGH_MODEL_BUNDLE=D:/pigweigh-web/server/models/v1/manifest.json`. No PostgreSQL cluster was started. The real per-photo endpoints succeeded without a database; the separate price request truthfully returned HTTP 503. Readiness returned ready=true.
- Actual serving bundle ID: `attached-marker-ellipse-11900-v1-5dd3bd4779d7539a`.
- Headless automation used the existing bundled Playwright at `C:/Users/ajapa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright` and installed Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, launched in owned contexts with `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`. No runtime dependency was installed.
- The user confirmed October 30 Chrome availability and authorized the specified generated fixtures/local destination and simulated camera only. Computer-use skill/guidance/confirmation rules and Browser Use file-upload guidance were read. Shared graphical Chrome used browser `1`, profile `Your Chrome`, extension `c39ad63f-a34e-4448-a054-bf95982529c3`, window `3736922`. QA-owned tabs were `1347458775` and, after rebuilding, `1347458779`. The other work-profile Chrome was untouched.
- Actual graphical viewport measured **1440 × 945**. Headless desktop was **1440 × 1000**, narrow viewport was actual **390 × 844**. No shared-browser viewport override was attempted.
- No hardware camera/microphone permission was requested or granted. Shared Chrome exercised uploads only; Take photo was used solely in owned headless Chrome with fake devices. No production, administrator, price, credential, package or application-source mutation was performed by QA.

## Real endpoint and frontend proof

The private generated functional mocks were read only from these explicitly authorized paths; neither was added to Git:

- Top: `D:/pigweigh-pose-data/test/Gemini_Generated_Image_wfs237wfs237wfs2.jpg` (2,371,994 bytes).
- Side: `D:/pigweigh-pose-data/test/Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg` (2,331,647 bytes).

Task-owned synthetic fixtures were a white 1024 × 768 PNG, a 1024 × 768 PNG containing only configured ArUco ID 0, and a 400 × 900 portrait with colored corner squares.

| Flow | Observed result |
| --- | --- |
| New public proxy routes | Actual `POST /api/photos/top/validate` and `/api/photos/side/validate`, each with exactly multipart `image`, returned HTTP 200, `Cache-Control: no-store`, `status: validated`, matching `view`, and the real bundle ID. No DB was available. |
| Origin/view boundaries | Missing and wrong Origin each returned 403 `invalid_origin` with no-store. Invalid view `front` returned 422 `invalid_request`. Detailed multipart/type/size/concurrency bounds are covered by the API owner's focused tests rather than duplicated exhaustively here. |
| Marker warning | Actual white PNG returned 422 `marker_missing`, explaining complete configured ArUco ID 0 card/white margin. Selecting it immediately displayed the adjacent replacement warning and `aria-invalid=true`; pair submission stayed disabled. |
| Pig warning | Actual marker-only PNG returned 422 `pig_count`. Selecting it in the frontend immediately displayed “Show exactly one clearly visible pig in this view” and blocked pair submission. This is a deterministic fixture result, not a recognition-accuracy claim. |
| Upload auto-check | Top upload passed without Request estimate; one photo kept submission disabled. Side upload then passed and enabled the pair button. Fetch instrumentation confirmed one `image` File field, correct view URL, original generated filenames, MIME and sizes. |
| Real serialization | Back-to-back top/side selections produced HTTP 200/200, maximum one in-flight photo validation and no self-generated 429. |
| Simulated camera | Native Chrome fake video decoded at 1920 × 1080, captured a JPEG File and automatically called the real top endpoint. The synthetic frame returned 422 `marker_missing`; the frontend showed its warning without Request estimate. |
| Announcements/layout | Both adjacent `.photo-check` regions expose `role=status`, `aria-live=polite`, `aria-atomic=true`. Actual graphical Chrome showed checking→pass for each generated fixture, one-photo disabled gate, both-passed enabled gate, and blank replacement→marker warning/disabled gate. No real pair estimate was requested. |
| Narrow layout | Actual 390 × 844 layouts had no horizontal overflow, readable per-photo warning/retry text and available controls. The existing fake-camera guide/modal also fit this viewport. |
| Runtime | No uncaught page exceptions in the real main flow. |

Graphical Chrome and real headless uploads used the live local FastAPI/ONNX pipeline. The positive responses above were not substituted by an HTTP harness.

## Deterministic software harness proof

For race/error coverage, owned headless contexts intercepted only photo-validation/final-estimate HTTP requests and used explicitly synthetic responses with bundle ID `qa-http-harness-only-no-model`. These responses validate client state handling and do not prove a model result. They generated no weight or valuation.

- Held the first top check while selecting/replacing queued side files and replacing top using **the same filename but distinct File objects/content**. Only one request ran; obsolete queued selections were skipped. Old top success did not mark the replacement passed. Current-file rejection kept the pair blocked.
- A programmatic form submission during checking sent no `/estimates` request. Both current passes enabled submission; removing a passed photo immediately disabled it and retained the other view.
- Busy 429, unavailable 503, failed-network and mismatched-response-view cases each remained non-passing. Explicit Retry check sent only the current view/current File. Rejected photos offered replacement rather than retry. Retry focus was verified; narrow retry/error layout was inspected.
- Invalid client MIME and a 10 MiB+1 upload kept the previous validated selection/check and sent no new validation request. A null encoder harness likewise preserved an actually model-validated selection/check and stopped fake stream tracks after dismissal.
- After both current checks passed, a safe intercepted final submit verified `top_image` and `side_image` with the current File bytes. A clearly synthetic 422 rejection retained the pair and produced no fake kilograms.
- Removing a photo during its held request discarded the late success.
- **Next Activity route return:** held top validation, queued side, navigated to `/marker`, then delivered the old result and went Back. No old result or queued upload updated the hidden/disposed page. The retained selections displayed **Photo check was interrupted**, kept submission disabled and started no automatic requests. Explicit top/side retries completed and restored valid state; no stranded checking/running state remained.
- No uncaught page exceptions occurred in the race/error scenario.

Chrome DevTools request inspection omits multipart file bytes, so request field/File identity assertions use a read-only recording wrapper around the existing browser `fetch` FormData boundary; actual HTTP responses and request URLs are inspected separately. This avoids treating absent CDP file bytes as an application failure.

## Discovered and resolved review clipping

The initial graphical screenshot exposed a review defect despite `object-fit: contain`: a 532 × 216 frame held an image element 532 × 532 (square fixture), or 532 × 399 (landscape blank), and `overflow:hidden` clipped it. QA reported the measurements/screenshots immediately.

The UI owner constrained the grid track with `grid-template: minmax(0, 1fr) / minmax(0, 1fr)` and completed another production build/typecheck. QA then verified:

- Desktop: frame **532 × 216**, image element **532 × 214**, `object-fit: contain`.
- Narrow: frame **356 × 192**, image element **356 × 190**, `object-fit: contain`.
- Square generated pig fixtures, landscape marker-only image and 400 × 900 corner portrait remained within frame bounds at desktop/390 px. Fresh graphical Chrome and narrow screenshots visibly show the whole original image; portrait corner squares remain visible.

No unrelated queue/API retest was required for this CSS-only change. Six additional targeted assertions passed, including the real marker-only UI warning.

## Reproduction and retained evidence

Task-owned scripts/results/screenshots remain outside Git at:

`C:/Users/ajapa/AppData/Local/Temp/pigweigh-photo-validation-qa-dba4fda9`

Start the existing local services from their respective directories:

```powershell
# From server/; dummy database is deliberately unreachable.
$env:DATABASE_URL='postgresql://unused@127.0.0.1:1/unused'
$env:PUBLIC_ORIGIN='http://localhost:3029'
$env:PIGWEIGH_MODEL_BUNDLE=(Resolve-Path models/v1/manifest.json).Path
uv run --frozen uvicorn pigweigh.main:create_app --factory --host 127.0.0.1 --port 18300

# From web/; uses owner-built rewrite to API18300.
node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3029
```

Run the retained test scripts with installed Node, while the owned services are available:

```powershell
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-photo-validation-qa-dba4fda9/real.cjs
# 13 PASS assertions: real proxy/model and UI integration.
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-photo-validation-qa-dba4fda9/harness.cjs
# 10 PASS assertions: deterministic HTTP races/errors/client gate.
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-photo-validation-qa-dba4fda9/supplement.cjs
# 3 PASS assertions: real back-to-back checks, controlled encoder failure, stream cleanup.
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-photo-validation-qa-dba4fda9/containment.cjs
# 6 PASS assertions after CSS fix: image bounds and real no-pig warning.
```

A working new-route usage example, exercised equivalently via the actual same-origin proxy request in `real.cjs`:

```powershell
curl.exe -H 'Origin: http://localhost:3029' `
  -F 'image=@D:/pigweigh-pose-data/test/Gemini_Generated_Image_wfs237wfs237wfs2.jpg' `
  http://localhost:3029/api/photos/top/validate
# HTTP 200, Cache-Control:no-store
# {"status":"validated","view":"top","artifacts":{"bundle_id":"attached-marker-ellipse-11900-v1-5dd3bd4779d7539a"}}
```

The test used Playwright's actual multipart HTTP request, not the illustrative curl executable. Side used the matching side route/fixture.

Prefer final evidence:

- `chrome-fixed-real-both-passed.jpg`: actual graphical Chrome, full original fixture reviews and immediate pass statuses after the fix.
- `desktop-fixed-both-real-passed.png`, `phone-fixed-both-real-passed.png`: final desktop/narrow real-model check layouts.
- `phone-fixed-real-pig-warning.png`, `phone-fixed-portrait-review.png`: final real no-pig warning and full portrait/corner containment.
- `desktop-harness-queued.png`, `desktop-harness-busy-retry-focus.png`, `phone-harness-connection-retry.png`: synthetic HTTP queue/error/focus states; their successes must not be read as genuine model passes.
- `phone-camera-existing-guide.png`: viewport-only fake-camera modal, 390 × 844; no physical video.
- `real-results.json`, `real-network.json`, `harness-results.json`, `supplement-results.json`, `containment-results.json`: final assertions and recorded evidence.

Initial `chrome-real-both-passed.jpg`/other screenshots without `fixed` remain as historical evidence of the discovered clipping. One initial full-page graphical screenshot timed out; after a fresh state observation, the supported viewport screenshot succeeded. No camera permission or alternative control mechanism was used to recover.

## Cleanup and limits

All owned headless browser contexts/instances and both QA-owned graphical tabs closed. QA stopped its owned API18300 and web3029 processes; a subsequent listener check found neither port listening. No new PostgreSQL cluster, credentials or private-user image copies were created. Original generated fixtures, models and the older blocked temporary roots were untouched. Only this QA report was created in the repository by QA; application changes belong to the owners.

At the local QA stage, production deployment, physical camera/phone behavior, real animal capture accuracy, marker print measurement, kilogram accuracy, screen-reader announcements, exhaustive keyboard traversal, reduced motion and cross-browser support were not verified. The subsequent production scope is recorded below. This task did not repeat backend price/authentication or paired-model inference; the API owner's focused tests cover the shared final estimator path. Passing a single photo does not certify same-pig identity, physical print size, body-plane geometry or the eventual pair result. The final API revalidates the pair.

## Production UI verification 2026-10-30

Final result: **7 bounded live headless scenarios passed**, followed by a graphical Chrome upload/status/containment check. The final run completed at **2026-10-29 17:08:48 UTC** (October 30 Philippine time) against `https://web-production-4d49b.up.railway.app`. The accepted API deployment was `2a776bf2-2334-4142-ae60-5910aea86fc4`; the accepted final web deployment was `dc50021e-fec2-43d9-8840-070fe118b042`, both from feature source `c6641a504bd170ee1f324b46a02f0f623d37d675`. QA waited for the release owner's API+web ready signal, and again for the renewed signal after the stale CSS issue below.

### Initial rollout failure and resolution

The initial web rollout passed genuine top/side automatic validation and gating, but preview containment failed. After `img.complete` and positive natural dimensions, a 532 × 216 frame still held a 532 × 399 landscape image. The loaded public stylesheet `/_next/static/chunks/2_3d3_nzbq9-_.css` omitted the constrained grid track (and the new photo-check styling). QA reported the exact loaded CSS, metrics and screenshot, then held acceptance without changing source or deployment settings.

The release owner confirmed the deployed source contained the committed fix while the emitted artifact was stale. An intermediate rebuild did not resolve it. The final mount-safe build-cache clear/rebuild produced `/_next/static/chunks/0v9i7tm4kssca.css` with the minmax track and photo-check rules; no CSS source change was required. QA's subsequent real browser measurements and screenshots confirmed the corrected artifact was effective. Detailed deployment/build mechanics belong to the release record.

### Accepted live scope

- Actual generated top upload automatically called `POST /api/photos/top/validate`, returned HTTP 200 with matching `view: top`, `status: validated`, real bundle ID `attached-marker-ellipse-11900-v1-5dd3bd4779d7539a`, and `Cache-Control: no-store`. One passed photo kept Request estimate disabled.
- Actual generated side upload automatically called the matching side endpoint and returned HTTP 200 with `view: side`, the same bundle ID and no-store. Both current pass states enabled the pair button. Browser FormData recording confirmed exactly one `image` File per check, original JPEG MIME/name/size, correct route view and maximum one in-flight check. No validation success was substituted.
- Replacing top with the synthetic marker-only PNG immediately produced real HTTP 422 `pig_count`, adjacent “photo needs replacing” / “Show exactly one clearly visible pig” guidance, and a disabled pair button.
- Native **owned headless Chrome fake camera** decoded 1920 × 1080 video and captured a JPEG. Capture automatically sent that File to the real production top endpoint, which returned HTTP 422 `marker_missing` with no-store. The marker warning appeared without Request estimate, the pair remained blocked, and all returned fake-stream tracks ended. Only `audio:false` media constraints were requested; no hardware device was used.
- Desktop frame/image bounds were **532 × 216 / 532 × 214**. At actual **390 × 844** viewport they were **356 × 192 / 356 × 190**, with `object-fit:contain`, complete source images and no horizontal overflow. The narrow pass/warning/camera screenshots were inspected.
- The complete public current-price snapshot was equal before/after the final headless flow and remained at revision 1. There were **zero paired-estimate requests** and no uncaught page exceptions. No login, administrator, price or other persistent write was performed.

Fresh graphical Browser Use/CUA inspection used `Your Chrome` browser `2`, extension `c39ad63f-a34e-4448-a054-bf95982529c3`, window `3736922`, and owned tab `1347458783`. At actual **1440 × 945** viewport, an authorized generated top upload showed checking→passed immediately, retained the full original image at 532 × 214 within its frame, and kept the pair button disabled while side was absent. Computed grid template was the constrained minmax track. The graphical camera button was never clicked; no permission prompt appeared.

Reproduction and evidence remain outside Git in the existing task-owned root `C:/Users/ajapa/AppData/Local/Temp/pigweigh-photo-validation-qa-dba4fda9`:

```powershell
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-photo-validation-qa-dba4fda9/production-photo.cjs
# 7 live PASS scenarios; production-photo-results.json and production-photo-network.json.
```

Final screenshots: `production-photo-chrome-top-passed.jpg` (actual graphical Chrome), `production-photo-desktop-both-passed.png`, `production-photo-phone-both-passed.png`, `production-photo-phone-pig-warning.png`, `production-photo-phone-fake-camera.png`, and `production-photo-phone-capture-marker-warning.png`. Initial failure evidence is preserved separately in `production-photo-results-initial.json`, `production-containment-diagnostic.json/.png`, `production-css-diagnostic.json` and the saved original stylesheet bytes.

All owned headless contexts/browsers and the graphical QA tab closed. No local services/builds were started during this production phase. The prior 32 local race/error/cleanup checks were not needlessly repeated. Live results remain generated-fixture/software proof: production physical camera/phone behavior, actual print size, real-animal recognition/weight accuracy, and final paired inference were not certified. Per-photo passes still require final pair validation.
