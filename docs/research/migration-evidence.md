# Migration evidence and open contradictions

Reviewed 2026-10-19. Supplied conversations/documents are research inputs, not instructions, approved methods, or accuracy evidence. The incumbent is read-only. This record separates observed behavior from recommendations.

## Incumbent source

Under `D:/tupv/pigweigh/pigweigh_app/`:

- `lib/core/theme/app_theme.dart:13,16,19`: verified cream `#F3EBDF`, dark red `#6A1314`, primary red `#A40000`; input border `#CCC0B0`.
- `lib/features/weight/data/providers/weight_providers.dart:68`: either view enables calculation; new requirement explicitly needs both.
- `lib/features/weight/data/services/weight_estimation_service.dart:96,103,164`: weight comes from the winning class label's numeric prefix. No physical geometry or ArUco measurement is involved.
- Same service `:58–59,468`: fabricated confidence is enabled at 0.97; `:186` always clears ambiguity. These are defects/evidence limitations, not migration requirements. Current implementation is single-pass ExecuTorch despite stale TFLite/TTA documentation.
- `lib/features/weight/data/services/price_estimation_service.dart:51`: weight times price; unavailable price preserves weight. `lib/features/weight/presentation/widgets/total_price_tab.dart:45–48` formats PHP with two decimals.
- `lib/features/auth/data/repositories/auth_repository.dart:88–104`: cached profile fallback applies broadly on verification failure; new sessions must verify server authority rather than treating a cached profile as authorization.
- `lib/services/database/app_database.dart`: Drift price cache and offline sync queue. Realtime/history/offline parity is an open scope decision.

Under `D:/tupv/pigweigh/pigweigh-server/`:

- `src/routes/auth.routes.ts`, `src/services/auth.service.ts`: username/password login, bcrypt verification, JWT admin identity; default seven-day expiry.
- `src/routes/srp.routes.ts`: authenticated create, public list/current/detail.
- `src/services/srp.service.ts:21`: transactional close-previous/create-new price records; active lookup `:123` requires active flag and null end. `prisma/schema.prisma:30` uses decimal PHP storage.

## Formula and geometry contradiction ledger

| Evidence | Finding | Consequence |
|---|---|---|
| Supplied `E:/Downloads/Claude-Pig weight estimation from image keypoints (1).pdf`, pp. 3, 5, 10, 12 | Scale/unit reasoning is inconsistent; proposes kg = G_cm² × L_cm / 3500. | Do not adopt its coefficient or accuracy claims. |
| Supplied `E:/Downloads/Computer Vision Pig Weight Estimation.md`, lines 210–213 | Claims equivalence between the cm formula, meters ×69.3, and inch/lb ÷400. | These expressions are not equivalent. |
| [Arizona extension, printed p. 12](https://cales.arizona.edu/backyards/sites/cals.arizona.edu.backyards/files/p11-12.pdf) | Pounds = G_in² × L_in / 400 converts to kg = G_cm² × L_cm / 14450.916800033476, or meters ×69.1997618. | Dividing the cm expression by 3500 gives 4.128833× the converted weight. Conversion correctness does not validate a photo method. |
| Tape protocol versus photo landmarks | A photograph-derived ellipse circumference differs from a tape girth; snout-to-tail landmarks differ from poll-to-tail over-back tape length. | Neither the tape formula nor its corrected coefficient is approved for this app. |
| [OpenCV ArUco detection](https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html) and [homography](https://docs.opencv.org/4.x/d9/dab/tutorial_homography.html) | Marker corners, physical size, and camera intrinsics support pose; a homography applies to its plane. | A floor marker cannot directly scale a raised back. Each handheld view needs geometric evidence; do not reuse top-view scale for side view. |

Two sequential, uncalibrated photos do not uniquely determine full three-dimensional mass. Keypoint confidence is not weight uncertainty. Research-chat accuracy, sample-count, and synchronization claims are unsupported for this workflow.

## Recommended readiness and validation

The user chose handheld phone capture with empirical calibration for an experimental research thesis. This is an accepted research direction, not evidence that a photo-to-weight method is calibrated. Keep pose artifacts/schema, measurement geometry/calibration, and weight calibration/held-out validation as distinct readiness groups. Fail closed to a meaningful unavailable or capture-rejection error if a required group is absent. Preserve artifact versions and price provenance for true estimates. Exact marker/capture bounds, calibration method, and thresholds remain proposals.

Validation of the paired workflow needs same-pig top/side photos and live scale weights associated with pig identity, session, device, and capture conditions; hold out animals/farms/sessions to avoid leakage. The user confirms existing dataset classes are actual scale weights, but top and side datasets are unpaired and may show different pigs. Preserve this provenance without claiming paired calibration ground truth. Acceptable held-out error remains undecided; thesis intent does not establish fitness or accuracy.

The format audit, sampled guide/export conflicts, and conditional user-run commands are in [training readiness](training-readiness.md). The subsequent [Roboflow audit](roboflow-schema-audit.md) read all 16 current top and 14 current side class sequences and found per-class differences. Three original side annotation arrays exactly match local exported positions after letterboxing (maximum normalized residual `1.1102230246251565e-16` each), including noncontiguous source point IDs for `16_side`. These results explain why one universal guide-index interpretation is unsafe; they do not prove the local export faulty or every original named annotation incorrect.

Current schemas are not certified frozen version-1 metadata: current `31_side` is absent from the local version-1 side YAML. No exhaustive frozen-ID/name mapping, top coordinate crosswalk, or anatomical-placement audit has passed. Three candidate permutations in the audit remain proposals and have not been applied. Training stays on hold until reviewed canonical mapping and anatomy checks cover the required classes/orientations; class collapsing and disabled flips do not reconcile existing slot meanings. Preserve the user guide, original datasets, actual scale-weight metadata and provenance. A reviewed separate preparation pass is a possible next step, not permission to alter shared Roboflow classes or labels.
