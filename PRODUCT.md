# PigWeigh

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-selected and implemented: Next.js with Tailwind CSS, no ShadCN; FastAPI with SQLAlchemy and uv; PostgreSQL. The dedicated PigWeigh Railway project exists, with web, API, PostgreSQL and volume creation staged; other existing projects remain untouched. The initial 17-change infrastructure apply was cancelled because the tool reported absent approval. The user subsequently chose “Keep staged for now” on 2026-10-19, intentionally deferring deployment. There are zero deployments. Actual IDs and pending operations are recorded in [deployment status](docs/deployment.md). Session mechanics follow `docs/implementation-contract.md`.

## Users and purpose

This is an experimental research thesis project. Anonymous visitors provide handheld phone top/side photos of the same pig for estimated live weight and Philippine peso valuation. Admins publish the applicable price per kilogram. Controlled-pen capture uses flat ArUco cards attached near measured back/flank regions: `DICT_4X4_50`, ID 0, black-square side 100 mm (10 cm), excluding the white margin. The implemented [CPU bundle method](docs/inference.md) runs pose models, per-view homography, named length/width/depth proxies, Ramanujan II ellipse girth and the selected `W_kg=G_cm²*L_cm/11900`. Formula output precedes scale-error evaluation; regression is optional refinement. Attached references do not make the curved body coplanar, and configured 100 mm is not proof of the physical print scale. Accuracy and trading fitness remain unmeasured.

## Required workflows

- Require both photos for each estimation request; support reviewing and replacing a photo before submission.
- Return a clearly experimental formula estimate when compatible pose models, explicit marker/geometry configuration and the implemented pipeline produce usable measurements. Otherwise explain unavailable capability or rejected capture. Prior regression fitting or accuracy evaluation is not required for the selected prototype.
- Show the price per kilogram and its provenance alongside a valuation. If no usable price exists, preserve a valid weight result and explain that valuation is unavailable.
- Verify admin sessions on the server and restrict price publication to authenticated admins.
- Preserve the original PigWeigh cream/red colors in the implemented anonymous and admin interfaces.

## Evidence and limits

The incumbent Flutter/Express application supplies workflow, price-publication, and palette evidence. Its estimator assigns weight from detection-class labels and enables fabricated confidence; those behaviors are excluded from the new estimator. Supplied research is subject to the contradiction ledger in `docs/research/migration-evidence.md`.

The core app and real configured ONNX CPU measurement/formula pipeline are implemented. On 2026-10-23 the updated frontend passed lint/typecheck/seven helper tests and production build; export parity and a mock-image pipeline pass supply functional evidence only. [Final backend verification](server/VERIFICATION.md) records 73 PostgreSQL-backed tests after review fixes, including actual ONNX/API estimates, no-price behavior, published-price valuation/provenance and marker rejection, plus 44 focused regressions. Independent review found no remaining P1/P2 in scope. See [readiness](docs/migration-plan.md). [October 19 frontend-only Chrome QA](docs/qa-browser.md) is historical; fresh graphical verification of the updated pipeline is not established. Deployment remains intentionally deferred with zero deployments. No build, mock result or model score establishes physical weight accuracy.

The user supplied trained pose models and explicitly approved ordinary Git (no LFS) delivery of exactly `server/models/v1/{manifest.json,top.onnx,side.onnx}`. The verified release derives from the private export at `D:/pigweigh-inference-artifacts/v1`; source `.pt` checkpoints, photos, training data and credentials remain excluded. Local serving from `server/` uses `PIGWEIGH_MODEL_BUNDLE=models/v1/manifest.json`; the image uses `/app/models/v1/manifest.json`. See [the runbook](docs/inference.md). A server without a valid configured bundle remains unavailable. The formula website discrepancy remains documented in [source inspection](docs/research/selected-weight-formula.md). Keypoint confidence is not kilogram certainty; method metadata reports experimental, unevaluated accuracy.

The user confirms that dataset weight classes represent actual scale weights. Top and side datasets remain unpaired; their pigs may differ. [Verified non-destructive prepared copies](docs/research/pose-preparation.md) are ready for user-run pose training: 2,397 top and 2,015 side images, with reviewed class-specific order, one pig class, 253 explicit top tail-base masks and three excluded out-of-bounds top images. All source hashes and retained/excluded weight provenance are preserved. Eleven preparation tests, independent review and installed Ultralytics loader checks passed across all splits; those preparation checks did not train models. The user subsequently completed training and supplied checkpoints for the private CPU export. Use prepared copies rather than unconverted exports. Representative annotation checks do not certify every landmark or pig/session split independence. The local serving bundle and pipeline now exist; empirical error evaluation remains separate, and unconfigured or invalid bundles still leave inference unavailable. The canonical Roboflow records, originals and supplied annotation guide remain unchanged.

## Scope still open

Public price history, realtime price updates, offline price caching, and queued offline admin writes exist in the incumbent but are not automatically included in this migration. Image retention, consent, and deletion behavior must be resolved before persistent image storage. No accuracy, turnaround, or trading-fitness claim is approved.
