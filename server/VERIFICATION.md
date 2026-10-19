# Backend verification record

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
