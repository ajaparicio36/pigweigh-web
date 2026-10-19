# Local Chrome QA

Date: 2026-10-19. Result: **frontend-only graphical checks completed; full-stack graphical QA remains unverified**.

The user authorized local Chrome QA and chose to keep Railway infrastructure staged. This QA made no cloud changes. No model accuracy or numerical inference claim is made.

## Full-stack setup blocker

The original proposed setup-script creation command was rejected before execution at process creation with `blocked by policy`. It would have created a new isolated temporary PostgreSQL cluster, migrated it, seeded a QA admin and synthetic fixtures, and started API/Next services. No part of that command executed; no retry, split command, or alternate full-stack setup was attempted. The exact original command and complete error envelope were not retained through compaction, so only the preserved rejection wording is quoted here.

No database, admin, fixture or temporary directory was created by that invocation. The older temporary PostgreSQL directory whose deletion was previously rejected was untouched.

## Reduced scope actually executed

The coordinator assigned a materially narrower check: run only the already-built Next frontend, with no database, API, seed, credentials, fixture generation or setup-script creation. This separate direct startup succeeded:

```powershell
& 'C:\Program Files\nodejs\node.exe' 'D:\pigweigh-web\web\node_modules\next\dist\bin\next' start --hostname 127.0.0.1 --port 13000
```

Next 16.4.2 reported ready. Installed Node was 24.13.0; deployment Node 22 remains unverified. The built rewrite targeted `http://127.0.0.1:18080/api/:path*`; that API was offline. Next logged `ECONNREFUSED` for price, readiness and session requests, matching the visible service-error states. No backend request was mocked.

Read the computer-use skill and required guidance. A fresh browser inventory identified Chrome browser `4`, profile `Anthony John`. Created dedicated local tab `1347450119`, session `PigWeigh frontend QA`, and interacted only with `http://127.0.0.1:13000/` and `/admin`. Existing Roboflow and other user tabs were untouched.

## Results

| Check | Observed result |
|---|---|
| Desktop estimate layout | Two photo cards rendered side by side; headings, instructions and controls remained legible in the default desktop viewport. Lower availability/action/footer content was inspected after scrolling. |
| Empty photo pair | Both controls showed no file selected; `Request estimate` was disabled and the page said to add both photos. No file chooser or upload was used. |
| Offline price | Clear service error and `Retry price`; keyboard activation retried and returned to the truthful error without displaying a price. |
| Offline readiness | Clear service error and availability could not be confirmed. `Check again` retried and returned to the truthful error. No kg, valuation, confidence or fabricated result appeared. |
| Keyboard | First Tab exposed a visible outlined skip link. Enter activated `#main-content`; the next Tab reached `Retry price`. Enter on the Estimate navigation link opened the estimate page. Tab from the top photo input reached the side photo input, then `Check again`, with visible focus treatment. |
| Admin offline | `/admin` showed `Session check failed` and `Retry session check`. Retry returned to the same honest error. No login or publication form was exposed while session verification failed. |
| Phone estimate | At an explicit 390×844 viewport, cards stacked vertically; top, middle and bottom content were inspected. File input focus, availability action, disabled request and footer were visible without overlap. DOM measurement gave document width 375 and layout viewport width 375 (390 outer viewport including scrollbar), with no horizontal overflow. |
| Phone admin | At 390×844 the heading, error message and retry button fit and remained readable. |
| Defects | No P1/P2 defect established in these bounded checks. Price retry replaced its focused button and focus returned to the page; this observation is not a keyboard-trap or complete accessibility audit. |

Native login/publication validation, successful authentication, reload/logout protection, published-price provenance, actual 401/409 draft recovery, photo selection/preview/replace/remove, invalid upload rejection and valid-pair `503 inference_unavailable` were **not exercised graphically**. Reduced-motion behavior and screen-reader announcements were not tested. Earlier source/static/proxy/PostgreSQL evidence remains separate and does not fill these graphical coverage gaps.

## Evidence

Screenshots are viewport JPEG captures. The initial full-page screenshot command timed out; normal viewport captures succeeded. Desktop evidence uses the existing default viewport; phone evidence uses 390×844.

- [Desktop estimate](qa/frontend-desktop-estimate.jpg)
- [Desktop skip-link focus](qa/frontend-desktop-skip-focus.jpg)
- [Desktop unavailable estimate action](qa/frontend-desktop-unavailable.jpg)
- [Desktop admin offline](qa/frontend-desktop-admin-offline.jpg)
- [Phone estimate top](qa/frontend-phone-estimate-top.jpg)
- [Phone file-control focus](qa/frontend-phone-photo-focus.jpg)
- [Phone unavailable estimate action](qa/frontend-phone-unavailable.jpg)
- [Phone admin offline](qa/frontend-phone-admin-offline.jpg)

## Cleanup

Reset the temporary browser viewport and closed the dedicated PigWeigh tab, releasing Chrome for the coordinator's Roboflow work. Stopped owned Next exec session `27958` with Ctrl+C; the process exited. No PostgreSQL/API process was started, no database or credential was changed, and no old temporary folder was accessed during the reduced check. Only this report and the listed screenshots were written as QA evidence. Railway remains staged.

Full-stack browser verification still requires an available disposable local API/database environment. The existing user authorization for Chrome availability remains granted.
