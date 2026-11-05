# ArUco-only camera guide QA — 2026-11-05

Result: **PASS after the short-landscape visibility correction.** The initial ten-case review verified square geometry and found a sticky-footer overlap. The corrected build passed all four affected view/video combinations on initial open and after resizing, plus two unaffected representatives: **10 further observations passed**. No remaining guide defect was established in this scope.

The user approved narrowly scoped Chrome QA with a simulated camera only. This review exercised the top/side camera overlays and responsive resizing. It did not capture/upload photos, run estimates, exercise authentication/pricing, access physical cameras/microphones, or start the API, database or model service.

## Environment and method

- Repository: `D:/pigweigh-web`, working changes based on `master` at `43b45b1`. The implementation owner completed the production build and froze `.next` before the root coordinator released QA.
- Current installed computer-use skill and its guidance/confirmation rules were read. A separate task-owned native Chrome profile was used for each source orientation, controlled through the existing bundled Playwright. Existing user Chrome tabs and settings were untouched.
- Installed Chrome: `C:/Program Files/Google/Chrome/Application/chrome.exe`, version **156.0.8078.80**.
- Local production server: `http://localhost:3037`, bound to `127.0.0.1`, started from `web/` with `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3037`.
- Native Chrome flags: `--use-fake-device-for-media-stream`, `--use-fake-ui-for-media-stream`, and `--use-file-for-fake-video-capture=<task-owned Y4M>`. The app requests `audio: false`. No physical-device permission prompt was handled.
- Two generated, public-data-free checkerboard/circle Y4M sources supplied actual decoded video dimensions **640 × 360** and **360 × 640**. Browser measurements confirmed those dimensions rather than assuming native fake-device orientation.
- Each same-dialog viewport sequence changed desktop → phone portrait → phone landscape for the first view, and phone portrait → phone landscape for the second view. Ready-state metadata updated the preview from its initial default aspect. Measurements used actual `getBoundingClientRect()` values after the video was playing and after each resize.
- The only page was the local estimate page and its camera dialogs. Unavailable API price/readiness GETs produced the expected fallback because port 8000 was not running. The request log recorded **zero write requests**, and no uncaught page exceptions occurred.

## Geometry and visual evidence

All ten cases passed square geometry with **0 CSS px width/height difference**. The square remained centered and inside its preview. `object-fit: contain` and the preview's measured aspect matched the decoded video; screenshot checkerboard cells and circle retained their shape. The frame interior was transparent and empty, with instructions outside the preview. No `.camera-pig-frame` or whole-pig frame label remained, and instructions no longer asked users to put the pig inside a dashed frame. The manual-guide/no-detection disclosure remained visible.

| Native video | View | Actual viewport | Square width × height (CSS px) | Preview width × height (CSS px) |
| --- | --- | --- | --- | --- |
| 640 × 360 | Top | 1440 × 1000 | 96 × 96 | 718 × 403.875 |
| 640 × 360 | Top | 390 × 844 | 96 × 96 | 318 × 178.875 |
| 640 × 360 | Top | 844 × 390 | 96 × 96 | 312 × 175.5 |
| 640 × 360 | Side | 390 × 844 | 96 × 96 | 318 × 178.875 |
| 640 × 360 | Side | 844 × 390 | 96 × 96 | 312 × 175.5 |
| 360 × 640 | Side | 1440 × 1000 | 96 × 96 | 253.125 × 450 |
| 360 × 640 | Side | 390 × 844 | 96 × 96 | 213.625 × 379.765625 |
| 360 × 640 | Side | 844 × 390 | 78.96875 × 78.96875 | 98.71875 × 175.5 |
| 360 × 640 | Top | 390 × 844 | 96 × 96 | 213.625 × 379.765625 |
| 360 × 640 | Top | 844 × 390 | 78.96875 × 78.96875 | 98.71875 × 175.5 |

Desktop and 390 × 844 screenshots show the complete square and legible instructions. **Historical initial finding, corrected below:** at **844 × 390**, visual inspection found that the existing sticky action bar covered the square's lower edge. A separate initial-open observation confirmed this without a resize or test scrolling:

- Portrait top video: guide top `223.265625`, height `78.96875`, bottom `302.234375`; action bar top `293.5`, height `79.5`. Thus **8.734375 CSS px** of the lower guide are obscured.
- Landscape video: guide top `214.75`, height `96`, bottom `310.75`; the same action-bar top obscures **17.25 CSS px**.
- The dialog has `scrollTop=0`, `scrollHeight=515`, and `clientHeight=356`. Scrolling is available, but the initial square is not entirely visible. The geometry-only assertions did not detect this sticky overlap; the screenshot review did. The coordinator was notified immediately, and release PASS was withheld pending correction/review.

## Corrected-build verification

After the implementation owner rebuilt the CSS correction and the coordinator released the second QA barrier, the short-landscape camera body became the scroll region, with preview at left, instructions at right, and the action bar outside it. QA repeated only the affected overlay layouts and two representatives; no other flows were added.

| Native video | Views | 844 × 390 observations | Square (CSS px) | Square vertical bounds | Visible body bounds | Action-bar top |
| --- | --- | --- | --- | --- | --- | --- |
| 640 × 360 | Top and side | Initial open and return from portrait resize, each view | 96 × 96 | 153.75–249.75 | 94–293.5 | 293.5 |
| 360 × 640 | Top and side | Initial open and return from portrait/desktop resize, each view | 78.96875 × 78.96875 | 162.265625–241.234375 | 94–293.5 | 293.5 |

All eight affected observations passed explicit square, preview containment, body-scrollport containment and footer-occlusion assertions. The actual video dimensions remained 640 × 360 / 360 × 640; preview aspect and `object-fit: contain` matched the native video, and the complete source preview fit above the footer. Actual pixels confirmed an unobscured four-sided square, round circle and square checker cells. Instructions were legible beside the preview and outside it. Supporting help can scroll in this short layout without moving the action bar over the guide.

Two additional observations confirmed the prior layout at **390 × 844 with landscape top video** and **1440 × 1000 with portrait side video**. Both retained a complete **96 × 96** square, correct video aspect and legible instructions. No pig outline/label returned, no page exception occurred, and the request log still contained zero write requests.

The corrected-build result is **PASS**; the initial overlap evidence is retained as historical evidence rather than an outstanding failure.

The existing capture implementation was read: `capturePhoto()` sizes its canvas from intrinsic video dimensions and draws only the video element. This unchanged code excludes guide DOM; the capture/upload flow was intentionally not retested in this scope.

## Retained evidence and reproduction

All synthetic media, Chrome profiles, scripts, raw measurements and screenshots are outside Git at:

`C:/Users/ajapa/AppData/Local/Temp/pigweigh-aruco-square-qa-M4o7f3`

- `qa.cjs`, `results.json`: ten-case native Chrome harness and measurements.
- `landscape.y4m`, `portrait.y4m`: the two synthetic sources.
- `landscape-top-desktop.png`, `landscape-top-phone-portrait.png`, `portrait-side-desktop.png`, `portrait-side-phone-portrait.png`, and other case-named PNGs: viewport-only evidence for all ten cases.
- `portrait-top-landscape-initial-overlap.png`, `occlusion.json`: independently confirmed initial-open sticky overlap.
- `retest.cjs`, `retest-results.json`: corrected-build assertions and raw geometry for all ten retest observations.
- `retest-landscape-top-landscape-initial.png`, `retest-portrait-side-landscape-resized.png`: corrected short-landscape examples with the full square above the footer.
- `retest-landscape-top-phone-portrait.png`, `retest-portrait-side-desktop.png`: corrected-build unaffected representatives.

With the local production server listening, rerun the bounded harness using the existing dependencies:

```powershell
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-aruco-square-qa-M4o7f3/qa.cjs
node C:/Users/ajapa/AppData/Local/Temp/pigweigh-aruco-square-qa-M4o7f3/retest.cjs
```

`qa.cjs` records the initial vertical-caption layout and geometry matrix; its caption-position assertion is historical for the short-landscape layout. Use `retest.cjs` to reproduce the final short-landscape visibility checks and unaffected representatives.

## Cleanup and limits

All owned Chrome contexts closed, and the owned Next server stopped. A listener check found no process listening on 3037. No application source, dependencies, Git state, cloud service or database content was changed by QA; this report is the only repository file owned by QA.

These are native desktop Chrome responsive-layout and synthetic-video results. They do not establish physical-phone orientation handling, device field of view, camera calibration, marker distance, print scale, live recognition, same-pig identity, inference quality or weight accuracy. No physical camera, microphone, private image, credentials or test weights were used.
