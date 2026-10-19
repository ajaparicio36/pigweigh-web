# PigWeigh

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

User-selected and implemented: Next.js with Tailwind CSS, no ShadCN; FastAPI with SQLAlchemy and uv; PostgreSQL. The dedicated PigWeigh Railway project exists, with web, API, PostgreSQL and volume creation staged; other existing projects remain untouched. The initial 17-change infrastructure apply was cancelled because the tool reported absent approval. The user subsequently chose “Keep staged for now” on 2026-10-19, intentionally deferring deployment. There are zero deployments. Actual IDs and pending operations are recorded in [deployment status](docs/deployment.md). Session mechanics follow `docs/implementation-contract.md`.

## Users and purpose

This is an experimental research thesis project. Anonymous visitors provide handheld phone top/side photos of the same pig for estimated live weight and Philippine peso valuation. Admins publish the applicable price per kilogram. The user accepts controlled-pen capture and flat ArUco cards attached near measured back/flank regions; see [capture decision](docs/adr/0006-controlled-capture-guidelines.md). The user selected `W_kg=G_cm²*L_cm/11900` as the [experimental method](docs/adr/0007-formula-weight-prototype.md), using ellipse-proxy girth from top chest width and side chest depth. Formula output from actual configured measurements is authorized before scale-error evaluation; regression training is optional later refinement. Marker size/dictionary, precise geometry/mapping and serving integration remain unresolved. Attached references do not make the curved body coplanar; accuracy and trading fitness are unmeasured.

## Required workflows

- Require both photos for each estimation request; support reviewing and replacing a photo before submission.
- Return a clearly experimental formula estimate when compatible pose models, explicit marker/geometry configuration and the implemented pipeline produce usable measurements. Otherwise explain unavailable capability or rejected capture. Prior regression fitting or accuracy evaluation is not required for the selected prototype.
- Show the price per kilogram and its provenance alongside a valuation. If no usable price exists, preserve a valid weight result and explain that valuation is unavailable.
- Verify admin sessions on the server and restrict price publication to authenticated admins.
- Preserve the original PigWeigh cream/red colors in the implemented anonymous and admin interfaces.

## Evidence and limits

The incumbent Flutter/Express application supplies workflow, price-publication, and palette evidence. Its estimator assigns weight from detection-class labels and enables fabricated confidence; those behaviors are excluded from the new estimator. Supplied research is subject to the contradiction ledger in `docs/research/migration-evidence.md`.

Core software implementation is complete: server-backed admin sessions, atomic price publication, decimal-safe valuation helpers, bounded paired uploads, explicit readiness/unavailable responses, and anonymous/admin interfaces. Local software verification passed; see [readiness and verification](docs/migration-plan.md) and [backend evidence](server/VERIFICATION.md). [Frontend-only Chrome QA](docs/qa-browser.md) completed desktop/phone layout, keyboard and honest offline-service checks before the later attached-card capture-copy update. That copy update passed lint/typecheck/four helper tests; it has no post-change build or graphical check. Full-stack graphical authentication, publication and photo-upload flows remain unverified after setup was blocked by policy. Deployment is intentionally deferred by the user; deployed-runtime verification and model readiness remain pending. The UI is code-led with no approved visual comp; build and HTTP checks do not prove its appearance or interactions.

The user trains and supplies pose models. The 11900 method is selected, but its photo-derived accuracy is unmeasured; the source website's displayed formula differs from its calculator code as recorded in [source inspection](docs/research/selected-weight-formula.md). Compatible serving checkpoints, concrete marker/geometry configuration and integration are absent, so valid uploads currently return unavailable inference. Confidence in a keypoint is not certainty about kilograms.

The user confirms that dataset weight classes represent actual scale weights. Top and side datasets remain unpaired; their pigs may differ. [Verified non-destructive prepared copies](docs/research/pose-preparation.md) are ready for user-run pose training: 2,397 top and 2,015 side images, with reviewed class-specific order, one pig class, 253 explicit top tail-base masks and three excluded out-of-bounds top images. All source hashes and retained/excluded weight provenance are preserved. Eleven preparation tests, independent review and the installed Ultralytics loader checks passed across all splits; no training/model/GPU execution occurred. Use prepared copies rather than unconverted exports. Representative annotation checks do not certify every landmark or pig/session split independence. Missing weight calibration does not block pose training, but missing serving checkpoints, marker/geometry configuration and integration still block numerical inference. The canonical Roboflow records, originals and supplied annotation guide remain unchanged.

## Scope still open

Public price history, realtime price updates, offline price caching, and queued offline admin writes exist in the incumbent but are not automatically included in this migration. Image retention, consent, and deletion behavior must be resolved before persistent image storage. No accuracy, turnaround, or trading-fitness claim is approved.
