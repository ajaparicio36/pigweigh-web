# From pose annotations to calibrated weight estimates

Current decision, 2026-10-19: accepted [ADR-0007](../adr/0007-formula-weight-prototype.md) supersedes this roadmap's proposed mandatory regression/calibration gate for prototype output. The user selected `W_kg=G_cm²*L_cm/11900`, with ellipse-proxy girth from actual top-width/side-depth measurements and attached ArUco references. Compatible pose checkpoints, explicit marker/geometry configuration and pipeline integration remain necessary. Error comparison against scales can follow implementation; fitted regression is optional later refinement. The earlier analysis below is retained as a research option, not a prerequisite. See [selected formula and source discrepancy](selected-weight-formula.md).

Reviewed 2026-10-19 using the research skill and primary sources below. This is a proposed implementation/research path, not a trained estimator or accuracy result. The user now accepts phone capture/upload in a controlled pen with taught guidelines, straight bird's-eye top and straight-on side views, and flat ArUco cards attached near the measured back/flank regions. This supersedes the earlier floor/wall-marker direction. [ADR-0006](../adr/0006-controlled-capture-guidelines.md) accepts that capture choice while leaving numerical choices unresolved.

## What the marker and keypoints each provide

Yes: a known-size marker provides a scale reference, and keypoints provide distances. Neither alone supplies kilograms. The pipeline is **photo → landmark coordinates and marker corners → reproducible size-related features → fitted weight regression → validated kilograms**.

For an approximately front-facing marker and body segment at the same depth, let its measured outer black-square side be `S_cm`, its detected side span be `m_px`, and two image keypoints be `(x1,y1)` and `(x2,y2)` in pixels:

```text
pixels_per_cm = m_px / S_cm
distance_px = sqrt((x2-x1)^2 + (y2-y1)^2)
reference_distance_cm = distance_px / pixels_per_cm
```

This is a pinhole/similar-triangles derivation, not a universal measurement formula. A single scalar assumes negligible perspective variation and lens distortion across the relevant points. Use both coordinates in the same original/oriented image space; normalized model coordinates and letterboxed coordinates must first be mapped back consistently. Four ArUco corners identify a marker; known physical size and camera calibration support marker pose estimation [1]. The printed white margin is not part of the measured black square.

For tilted views, map the detected corners to `(0,0), (S,0), (S,S), (0,S)` with a homography, transform the chosen points, divide by their homogeneous coordinate, then measure distance in that reference plane. Homography rectifies a plane [2]. Attaching the flat card near the measured region reduces offset, but the full curved body does not lie in that plane. Transformed coordinates remain **marker-plane reference features** until measurement validation supports body dimensions. Use separate top and side transforms; never transfer one view's pixel scale to the other.

Historical geometry illustration for the superseded floor/wall option: with a camera `H` above the floor, a horizontal segment at height `h` has floor-scaled apparent length `L_reference = L_true * H/(H-h)`. At hypothetical `H=2 m`, `h=0.6 m`, the factor is approximately `1.43`. Those numbers are not measurements of this pen or a correction coefficient. The example explains why moving the reference closer to the body plane helps; residual local depth differences still need evaluation.

## Simplest defensible approach for this thesis

Use the accepted attached-card protocol and first treat marker-normalized landmark distances as predictors calibrated against real scale weights. Put the sticker on a flat card with removable attachment; keep all corners and the white margin visible, measure the printed black square, and avoid keypoints. Consistent capture reduces variation; pilot data must establish residual depth, posture and phone effects. Call features `top_marker_reference_length` or `side_marker_reference_depth` until measurement validation supports anatomical-centimeter claims. A fitted model cannot guarantee correction outside its tested capture domain.

Possible later improvements are measured local body-plane offsets plus camera-to-plane distance, or calibrated camera rays intersecting a known body plane. Depth correction works only when the depths and plane assumptions are actually known. Camera calibration estimates intrinsics and lens distortion [3]; ArUco pose can locate the marker relative to that camera [1]. It does not reveal every body point's depth or reconstruct arbitrary 3D anatomy from two sequential photographs.

Select a small, anatomically reviewed feature set, such as longitudinal and transverse top spans and torso side spans. Do not rename a snout-to-tail span as tape body length or an inferred ellipse as measured tape girth. The existing [contradiction ledger](migration-evidence.md) explains why no tape coefficient has been accepted.

Proposed first comparison: a training-set mean baseline, then linear or ridge regression over the reviewed features. For example, `kg_hat = b0 + sum(bj * feature_j)` specifies a family to fit; every coefficient must come from training data. Ridge penalizes coefficient magnitude [4]. Keep preprocessing and feature selection inside training folds. More complex models require evidence of improvement over this reproducible baseline. No universal coefficient, acceptable error, sample-size guarantee or weight-confidence conversion is approved.

## Preserve and use the existing work

The user identifies the Roboflow projects as canonical. Preserve their annotations and the original exports; reconcile names/slot order through a reviewed, separately generated preparation manifest/copy. Do not silently relabel anatomy from a universal guide or overwrite source coordinates. The separate dataset-preparation work owns that mapping and its training instructions; final tests/review are pending, so this roadmap does not yet claim a verified prepared output. Once that clears, pose training can use existing images without waiting for new marker captures or fitted weight calibration. Later attached-card captures need a pose-domain/occlusion check.

Existing actual scale-weight classes remain valuable per-view provenance and possible per-view research targets. They are not discarded when pose targets collapse to one pig class. Preserve original class, actual kilograms, image identity, source/version and preparation mapping outside the collapsed label. Unpaired top/side images must not be joined by weight class to invent same-pig pairs. Without markers/protocol metadata they cannot establish the new paired marker-calibration relationship. Pose training can proceed once the separate preparation/audit clears consistent supervision; the user runs training. Weight calibration need not block annotation preservation or pose preparation.

## Calibration records and validation

Proposed minimum: one CSV row per real same-pig capture session, with private originals stored outside Git. Repeat captures remain linked, including derived/augmented copies.

| Fields | Purpose |
|---|---|
| `pig_id`, `session_id`, `captured_at`, `farm_or_pen_id` | Identity and collection grouping |
| `actual_weight_kg`, `weighed_at`, `scale_id`, scale-check notes | Recorded live scale weight and its provenance |
| `top_original`, `side_original`, image hashes | Actual matching views, immutable original references |
| Per-view `marker_dictionary`, `marker_id`, `marker_side_cm`, marker/placement ID | Measured printed black square; flat back/flank attachment and local placement recorded |
| `phone_id`, lens/zoom mode, image dimensions/orientation, `protocol_version` | Capture reproducibility; calibration profile if used |
| Pen position/pose, known distances or offsets if measured, exceptions/rejection reason | Geometry evidence and failures, without guessed depths |
| `split`, annotation/schema version, feature-extractor version | Reproducible analysis and leakage control |

Use stable pig identity as the split group: all sessions and augmentations of that pig stay together. If pig identity is unavailable, session grouping is only a limited fallback and cannot prove independence across animals. Keep a final held-out set untouched by model/threshold selection; use grouped development validation [5]. If claims extend to new farms/phones, evaluate those domains separately rather than assuming within-pen results generalize.

Proposed reporting: MAE and RMSE in kilograms, signed bias, errors by weight range/device/capture condition, and rejected/accepted counts [6]. State dataset coverage and protocol limits. Compare pose-predicted features against manually checked landmarks on a subset to distinguish landmark error from geometry/regression error. Define rejection rules and acceptable held-out error before final evaluation; no thresholds are selected here.

## Immediate steps and later serving contract

1. Finish the separate canonical mapping/preparation audit, preserve all original annotations and scale weights, then let the user train/evaluate separate top and side pose models.
2. Pilot the taught pen protocol: choose and physically measure marker prints, record phone modes, test visibility and pose consistency, and collect real same-pig pairs with contemporaneous scale weights. Freeze the protocol after reviewing pilot failure modes; exact distance/angle/blur limits remain proposals.
3. Freeze named features and grouped splits; fit the baseline/regression, review validation/rejections, then agree an error bar and capture domain. Retrain only on the intended training partition and preserve the final held-out report.
4. Supply a reviewed versioned artifact bundle before backend numerical inference integration. Proposed manifest fields: bundle ID/checksums; top/side checkpoint runtime/version and preprocessing; named landmark order/units; marker dictionary/IDs/measured side sizes; camera profiles if required; feature definitions/order/units and geometry assumptions; fitted preprocessing/regression parameters; capture-domain bounds and rejection policy; validation report/split identifiers and accepted thresholds. Keep private images/checkpoints outside Git.

The backend currently validates uploads and returns truthful unavailable inference. Missing compatible checkpoints blocks landmark extraction; missing reviewed geometry/feature contracts blocks interpreting those landmarks; missing fitted calibration and held-out acceptance blocks kilograms. Keep those readiness failures explicit. Later successful responses must retain bundle ID and the price snapshot used for decimal-safe PHP valuation; no numeric fallback is authorized.

## Primary sources

Accessed 2026-10-19; sources establish methods, not PigWeigh accuracy.

1. [OpenCV ArUco detection and pose](https://docs.opencv.org/4.13.0/d5/dae/tutorial_aruco_detection.html): ordered corners, dictionary/ID, known side size, camera matrix/distortion and `solvePnP`.
2. [OpenCV homography](https://docs.opencv.org/4.13.0/d9/dab/tutorial_homography.html): planar mappings and coplanarity assumptions.
3. [OpenCV camera calibration](https://docs.opencv.org/4.13.0/dc/dbb/tutorial_py_calibration.html): projection, distortion and calibration parameters.
4. [scikit-learn linear models](https://scikit-learn.org/stable/modules/linear_model.html#ridge-regression-and-classification): fitting linear/ridge parameters.
5. [scikit-learn grouped cross-validation](https://scikit-learn.org/stable/modules/cross_validation.html#cross-validation-iterators-for-grouped-data): subjects/groups kept separate across folds.
6. [scikit-learn regression metrics](https://scikit-learn.org/stable/modules/model_evaluation.html#regression-metrics): MAE and squared-error measures.
