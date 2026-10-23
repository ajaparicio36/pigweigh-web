# Local inference Chrome QA

Date: 2026-10-23. Result: **fresh local desktop full-stack browser flows passed within the scope below; phone-width verification remains unverified because the browser viewport override did not take effect**. No physical weight accuracy or deployed readiness is established.

## Environment and boundaries

QA began after commit `a18e4a4` (`feat: enable pose estimation with bundled ONNX models`) and the coordinator's packaging barrier release. The API loaded `server/models/v1/manifest.json` from that committed serving bundle, not an external substitute. Production Next was rebuilt with `BACKEND_INTERNAL_URL=http://127.0.0.1:18230`, then served on `http://localhost:13230`; FastAPI used exact `PUBLIC_ORIGIN=http://localhost:13230`.

A new task-owned SCRAM PostgreSQL 16.2 cluster on loopback port 3018 used database `pigweigh_test_browser`, Alembic migrations and a generated disposable admin hashed by the normal application password implementation. No existing/cloud application database or Railway resource was used. Trusted portable binaries were used read-only; the older blocked cluster and its data/credentials were untouched.

Read the computer-use skill and its required guidance/confirmations. Used its preferred supported Browser Use controls through `cua_repl`, not an external Playwright/CDP client. Chrome browser ID `3`, profile `Your Chrome`, extension instance `c39ad63f-a34e-4448-a054-bf95982529c3`, session `🐷 PigWeigh QA`. Owned tabs: estimate `1347452773`, admin `1347452776`, viewport probe `1347452779`, stale-draft admin `1347452783`. Only the local PigWeigh application was exercised; unrelated user tabs were untouched.

The generated mock source pair remained outside Git and unchanged: top `D:/pigweigh-pose-data/test/Gemini_Generated_Image_wfs237wfs237wfs2.jpg`, side `D:/pigweigh-pose-data/test/Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg`. They exercise the function of the actual ONNX/ArUco/formula pipeline; they are not real scale-weight evidence or proof that the app verifies pig identity.

## Observed results

| Flow | Result |
|---|---|
| Empty pair and readiness | No published price; both images required; Request estimate disabled. Actual configured readiness displayed experimental estimation available. |
| Real file selection | Native file chooser flow selected top then side; previews and filenames appeared; one-photo state still disabled submission; full pair enabled it. |
| No-price inference | Actual UI multipart request returned 200 through the live Next proxy/API and models. Result showed **149.25 kg**, valuation unavailable, no-price explanation and explicit unevaluated-accuracy disclaimer. |
| Measurement disclosure | Expanded details showed length **96.44 cm**, width **30.62 cm**, depth **54.13 cm**, ellipse girth **135.70 cm** and the selected 11900 formula. |
| Sign-in and session | Wrong password returned 401 with a generic incorrect-credentials message. Correct private disposable credentials signed in; reload retained the server-verified session. No credential screenshot was taken. |
| Price validation/publication | `210.505` was rejected with an actionable two-decimal validation message. UI publication of **PHP 210.50/kg** returned 201; source `Local QA synthetic price — 2026-10-23; not a market quote` and Philippine publication time appeared. These were disposable QA prices, not market quotes. |
| Decimal valuation/provenance | A real repeat UI estimate showed **149.25 kg × PHP 210.50 = PHP 31,417.13**, matching HALF_UP rounding of 31417.125, with the exact price/source/publication snapshot used for that estimate. |
| Replacement/rejection/removal | Replaced top with an owned blank PNG; prior success cleared. Submission returned actual 422 and actionable complete ArUco ID 0/white-margin guidance; both photos remained. Removing top cleared the outcome and disabled submission. Restoring the original top yielded a successful real estimate again. |
| Stale publication | Two signed-in tabs: one retained draft `211.01`, another published `210.51`. Stale draft submission returned actual 409, preserved amount/source, refreshed current price, and disabled Publish until explicit review. Checking review then publishing succeeded (201). The earlier estimate continued to display its original 210.50 price snapshot. |
| Logout | Sign out returned 204; reload showed the sign-in form rather than publication controls (session 401). |
| Keyboard/focus | First Tab exposed Skip to content with computed 3px red outline. Enter navigated to main; next Tab reached Username with the same visible outline. Successful/rejected/unavailable estimate outcomes received focus; expanded formula details were operable. This is bounded keyboard coverage, not a full accessibility audit. |
| Desktop layout | Default inner viewport 1920 px; document width 1905 px, without horizontal overflow. Side-by-side cards, result, provenance and admin states remained readable. Computed body font and `--font-sans` both resolved to the intended system sans stack. |
| Unavailable capability | Restarted only the owned API using an alternate private environment without model-bundle configuration. Check again displayed unavailable readiness and the real missing-bundle blocker. Valid-pair submission returned actual 503; no numeric result remained, no weight/valuation was invented, and photos remained for review. |
| Console | Bounded final estimate-tab inspection returned no captured warning/error entries. API access output independently showed actual 200/201/401/409/422/503 requests described above. |

Phone-width QA is **unverified**: supported viewport capability accepted 390×844 but existing and fresh owned tabs still reported innerWidth 1920 with desktop screenshots. A bounded supported recovery did not change the viewport. The override was reset; the misleading attempted phone screenshot was removed. No phone screenshot or responsive pass is claimed. Busy 429, physical captures/marker print scale, reduced motion, screen readers, exhaustive keyboard paths and Docker/Railway runtime were not graphically tested. Backend concurrency evidence is separate and does not fill the browser gap.

## Private evidence

Screenshots contain private mock imagery and remain outside Git. Absolute local links are intentionally machine-local; they are not portable repository assets.

- [Desktop empty state](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/desktop-empty.jpg)
- [No-price result and measurements](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/desktop-no-price-result.jpg)
- [Priced result](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/desktop-priced-result.jpg)
- [Published price](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/admin-published.jpg)
- [Stale draft](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/admin-stale-draft.jpg)
- [Capture rejection](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/desktop-capture-rejected.jpg)
- [Keyboard skip focus](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/keyboard-skip-focus.jpg)
- [Unavailable result](C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b/evidence/desktop-unavailable.jpg)

## Cleanup and limits

Closed all four owned tabs and reset the temporary viewport override. Stopped owned Next exec session `22685`, configured API session `26533` (PID 24280), replacement unavailable API session `82513` (PID 5268), and the fresh PostgreSQL cluster (`pg_ctl` confirmed server stopped). Final read-only listener inspection found no listeners on 13230, 18230 or 3018. The generated publication data exists only in the stopped disposable local cluster.

Automatic command approval rejected the guarded cleanup command before execution with **`blocked by policy`**. The action would have verified the exact new temporary root, checked stopped ports and removed its `data` subtree, `pg-password.txt`, `admin-password.txt`, `api.env`, `unavailable.env`, blank fixture and temporary path pointer, while preserving evidence. No retry, alternate deletion mechanism or bypass was attempted. Consequently the stopped new cluster, task-only credentials and configuration remain at `C:/Users/ajapa/AppData/Local/Temp/pigweigh-browser-qa-ec276a9e0ac3421197ba18a94a36ff9b`, with pointer `C:/Users/ajapa/AppData/Local/Temp/pigweigh-current-browser-qa-path.txt`. Credentials were never printed, included in screenshots or committed. Evidence remains at the links above. The old previously blocked temporary cluster was not modified.

No application/source change, deployment, cloud mutation or accuracy claim resulted from QA. No P1/P2 application defect was established in these bounded flows. `git diff --check` passed after the report was written.
