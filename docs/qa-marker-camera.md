# Marker and camera browser QA — 2026-10-29

Result: **27 bounded browser checks passed** against the current marker/camera working tree based on `master` at `12eec25`. No application defect was established in this scope. These checks verify browser behavior and software cleanup; physical camera support, print scale and weight accuracy remain unverified.

## Scope and environment

The user confirmed shared Chrome availability for this QA with **simulated camera only**. The computer-use skill, guidance and confirmation rules were read. Implementation/build barriers were observed: UI owner reported lint, TypeScript, 13 helper tests and production build passing before QA started its server. QA did not modify application source, packages, Git state, models, production services or database contents.

- Local Next production server: `http://localhost:3029`, listening on `127.0.0.1:3029`; started from `web/` using `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3029`. The initial `pnpm exec next start` attempt failed because this execution environment cannot safely launch its non-Node Windows command shim; the direct existing Next CLI succeeded.
- No API or PostgreSQL server was started. Existing rewrite target `127.0.0.1:8000` was unavailable, so price/readiness showed their genuine service-error fallback. Expected proxy `ECONNREFUSED` logs are not camera failures. No numeric estimate was generated.
- Installed Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`, browser version reported by Playwright `156.0.8078.73`.
- Bundled existing Playwright: `C:/Users/ajapa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`.
- Headless tests launched owned Chrome instances with `--use-fake-device-for-media-stream` and `--use-fake-ui-for-media-stream`. Native `getUserMedia` therefore supplied Chrome's synthetic video; hardware camera/microphone permission was never requested or granted. Requested media constraints explicitly had `audio: false`.
- Graphical browser: Browser Use/CUA Chrome browser `3`, profile `Your Chrome`, extension instance `c39ad63f-a34e-4448-a054-bf95982529c3`; QA-owned tab `1347458652`, named session `📷 PigWeigh marker QA`. Actual measured viewport was **1920 × 945**. This shared browser exercised static navigation/layout only; Take photo was not clicked there.
- Headless desktop viewport: **1440 × 1000**. Headless narrow viewport: actual `innerWidth=390`, **390 × 844**. This provides bounded responsive-width evidence; it is not a physical-phone result. No shared-browser viewport override was attempted.

## Passed checks

| Area | Evidence |
| --- | --- |
| Marker public route | `/marker` returned the rendered page with correct selected navigation, loaded SVG preview, `DICT_4X4_50`, ID 0, 100 × 100 mm black square, A4 and ruler/Actual size/no Fit to page instructions. Graphical Chrome confirmed navigation from marker to paired-photo page. |
| PDF/SVG delivery | PDF HTTP 200, `application/pdf`, `%PDF-` signature, 2,360 bytes. SVG HTTP 200, `image/svg+xml`, SVG signature, 1,565 bytes. Clicking Download marker PDF produced the expected fixed filename. |
| Explicit camera start | No media request occurred on page load. Top/side Take photo opened the appropriate native dialog with correct back/flank instructions. Live manual guidance explicitly disclaimed marker/pig detection. |
| Native simulated capture | Real decoded Chrome fake video reached **1920 × 1080**, `readyState=4`. Top JPEG review was `image/jpeg`, 22,378 bytes, 1920 × 1080, valid JPEG magic `FF D8 FF`. Side capture entered its own review. Instrumentation observed only a `VIDEO` source drawn onto the intrinsic-size encoding canvas; guide DOM was excluded. |
| Existing selection flow | Captured filenames/reviews appeared, upload replaced a photo, invalid text upload preserved the previous selection with an error, and Remove cleared the review. Captured top/side JPEG Files reached the existing multipart POST path with proper field names, JPEG content type and signatures. |
| Native dialog/focus | Initial dialog focus was Close camera. Close and Escape stopped all returned tracks and restored the matching Take photo trigger. Use upload instead stopped tracks, closed the dialog and focused the correct file input. |
| Cleanup | Native fake stream tracks ended after capture, close, Escape and client-route unmount. Controlled software harnesses also verified tab-hidden dismissal, pending-start capture disabled, and a native fake stream resolving after dismissal being stopped rather than attached. |
| Error/fallback harnesses | Injected NotAllowedError/NotFoundError displayed the relevant error and kept Capture disabled. Unsupported media API and insecure-context harnesses displayed upload fallbacks. These were deterministic software boundary injections, not interactions with OS permissions or real unavailable hardware. |
| Encoding harnesses | Null encoder and oversized JPEG blob failures preserved the previous photo and allowed retry. While encoding was held pending, repeated capture was disabled; Escape stopped the stream and discarded a late encoding result. |
| Disabled/submission lifecycle | A programmatic form submit at the headless test boundary changed parent state to pending while a dialog was open. The dialog closed, tracks ended and photo controls disabled. The intercepted multipart POST was 46,754 bytes. A clearly synthetic HTTP 422 rejection restored controls and retained both JPEG selections. No backend inference or fabricated weight was involved. |
| Responsive layout | `/marker` and estimate page had no horizontal overflow at actual 390 px. Native dialog bounding box was x=19, y=144.5625, width=352, height=554.875 within 390 × 844. Viewport-only screenshot separately confirms the complete modal/actions fit. Desktop and narrow screenshots were visually inspected. |
| Runtime | No uncaught page exceptions in the main scenario. |

## Reproduction and evidence

Task-owned, credential-free scripts, raw results, downloads and screenshots remain **outside Git** at:

`C:/Users/ajapa/AppData/Local/Temp/pigweigh-marker-camera-qa-00c06d21`

Run while the local production web server is listening:

```powershell
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-marker-camera-qa-00c06d21/qa.cjs
# 21 PASS assertions; results.json
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-marker-camera-qa-00c06d21/extra.cjs
# 6 PASS assertions; extra-results.json
```

Evidence files:

- `chrome-marker.jpg`, `chrome-estimate.jpg`: actual shared graphical Chrome; 1920 × 945 viewport, full-page screenshots.
- `desktop-marker.png`, `desktop-top-camera.png`, `desktop-side-camera.png`: owned headless desktop with Chrome fake video. Full-page camera screenshots extend past the viewport and should not be read as viewport dimensions.
- `phone-marker.png`, `phone-estimate.png`: full-page layouts at 390 × 844 viewport.
- `phone-camera-viewport.png`: **390 × 844 viewport-only** native modal screenshot with synthetic Chrome video. Prefer this over the full-page `phone-top-camera.png` for modal fit review.
- `launch.json`, `results.json`, `extra-results.json`, `qa.cjs`, `extra.cjs`: browser flags/version, assertions and reproducible harnesses.
- `downloaded-marker.pdf`, `downloaded-marker.svg`, `clicked-download.pdf`: bytes served/downloaded by the local app.

Working public-route usage examples were exercised end-to-end against the local Next server:

```powershell
curl.exe -I http://localhost:3029/marker
# HTTP 200, text/html
curl.exe -I http://localhost:3029/markers/pigweigh-aruco-4x4-50-id-0-100mm.pdf
# HTTP 200, application/pdf
curl.exe -I http://localhost:3029/markers/pigweigh-aruco-4x4-50-id-0-100mm.svg
# HTTP 200, image/svg+xml
```

The tests used Playwright request GETs plus actual page navigation/download, rather than invoking the illustrative curl commands themselves.

## Cleanup and limits

Both owned headless Chrome instances/contexts closed. The QA-owned shared Chrome tab closed. The owned Next session stopped, and a subsequent listener check found no process listening on 3029. Existing user tabs/profile settings, physical cameras and the older blocked temporary clusters were untouched. No private photographs or credentials were read or committed; retained images are public marker assets or synthetic Chrome frames.

This did not test production deployment, real API/model estimation, admin/price publication, physical camera switching, physical Android/iOS browser behavior, printed ruler scale, real same-pig geometry, weight accuracy, screen readers, exhaustive keyboard traversal, reduced motion or all browser/device combinations. A tested narrow headless layout does not certify physical-phone support. Asset generation/ArUco decoding and PDF physical geometry are separately documented in `docs/marker-assets.md`; browser delivery does not prove an actual print is 100 mm.
## Production static UI verification — 2026-10-29

After the release owner reported deployment `f4ea0cee-e94e-40e2-95ed-c02124b9f086` healthy/SUCCESS from source commit `dc9361697b5e76bab65b56739357139eb14e93bf`, QA verified the public app at `https://web-production-4d49b.up.railway.app`. The independent headless smoke completed at **2026-10-29 15:08:59 UTC** with **7 PASS assertions**. This is a separate post-release check; the 27 local camera assertions above remain local functional evidence.

- `/marker` returned HTTP 200 with the newly released fixed dictionary/ID/100 mm content, correct selected navigation and a loaded SVG preview. Actual Download marker PDF interaction produced `pigweigh-aruco-4x4-50-id-0-100mm.pdf` and bytes matching the committed asset.
- Served PDF returned `application/pdf`, 2,360 bytes, SHA-256 `2939159788a5e633eab4ba03987aa4645b5d4a16dc56e319375fd624b5449ab1`.
- Served SVG returned `image/svg+xml`, 1,565 bytes, SHA-256 `18837c1d8581d4ed20e2853eff9ec44b3d6dc3090056698401ca2f30a92ac8d3`.
- Continue to photos navigated to the released Estimate page with both new Take photo controls and correct selected navigation. Camera/dialog/video did not start on page load. Headless static smoke guarded `getUserMedia` against access and recorded zero calls. It made no estimate/authentication/price write requests.
- Headless production marker and Estimate pages fit actual **390 × 844** viewport without horizontal overflow. These are responsive browser checks, not physical-phone checks.
- Fresh graphical Browser Use/CUA inspection used Chrome browser `3`, the same approved `Your Chrome` session/extension, and QA-owned tab `1347458664`. The marker page measured **1920 × 945**; the subsequent Estimate observation measured **1920 × 889**. Both layouts were inspected and screenshots retained. No camera button was clicked and no permission prompt appeared. Existing published content was read-only.

Reproduction uses the existing bundled Playwright and installed Chrome, with no added dependency:

```powershell
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-marker-camera-qa-00c06d21/production-smoke.cjs
# 7 PASS assertions; production-results.json
```

Public-only evidence remains outside Git in the same task-owned evidence directory: `production-results.json`, `production-smoke.cjs`, `production-chrome-marker.jpg`, `production-chrome-estimate.jpg`, `production-desktop-marker.png`, `production-desktop-estimate.png`, `production-phone-marker.png`, `production-phone-estimate.png`, `production-marker.pdf`, `production-marker.svg`, and `production-clicked-download.pdf`.

The owned graphical tab and headless browser/context were closed. No app source, credential, administrator session, database record, price or cloud configuration was changed. This static production check does not establish production camera capture, physical camera/phone behavior, actual print size, model accuracy or live inference correctness. The local simulated-camera lifecycle and capture proof is described separately above.
