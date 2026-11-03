# Revised thesis review and method handoff

Reviewed 2026-11-03 against the user-supplied `E:/Downloads/PigWeigh Consolidated Thesis Revised 31 October 2026.md` (revision dated 2026-10-31). References below use its section titles and original Markdown line numbers, including blank lines; they are not PDF page numbers. All prose, tables, references and appendix text were read. Embedded base64 image payloads were excluded from the review and are not copied into this repository; figure captions are mapped below, but the images were not independently visually reviewed.

The document is a Chapters 1–3 research proposal. Its consolidation notes explicitly distinguish proposed specifications from completed implementation, adviser approval and measured results (lines 651–663). The user now authorizes replacing the application's 11900 divisor with the thesis baseline **14451**. This authorization supersedes the earlier divisor choice in ADR-0007; it does not authorize implementing every proposed thesis feature or treating the proposed calibrated model as trained.

## Section map

| Source location | Section and purpose |
|---|---|
| Lines 3–23 | Front matter: institution, authors, advisers, degree and year. |
| Chapter 1, lines 25–73 | **Introduction**: problem, objectives and study boundaries. |
| Lines 29–39 | Background of the Study: farmgate negotiation, image-derived measurements and indicative liveweight valuation. |
| Lines 41–55 | Objectives of the Study: paired capture, model/software development, numerical and component evaluation, decimal pricing and adapted usability testing. |
| Lines 57–69 | Scope and Limitations: Negros Occidental, 20–30 kg lechon application, commercial-type purebred/crossbred recruitment, study devices, one administrator, transient ordinary images and limits on inference/generalization. |
| Lines 71–73 | Significance of the Study: inspectable prototype and measured error/failure evidence rather than guaranteed economic benefits. |
| Chapter 2, lines 75–170 | **Conceptual Framework**: literature, assumptions and definitions. |
| Lines 79–85 | Farmgate Valuation and Objective Measurement: live-hog price basis, traceable sources, weight-only fallback and need for local evaluation. |
| Lines 87–91 | Philippine Pig Morphology and the Evaluation Range: local morphology evidence and bounded lechon scope. |
| Lines 93–99 | RGB Images and Smartphone Weight Prediction: feasibility evidence; separate top/side pose models locate anatomy rather than kilograms. |
| Lines 101–111 | ArUco Markers and Measurement Geometry: known-size planar reference, residual depth error and proposed adjustable stand. |
| Lines 113–117 | Browser Camera Access and Processing Requirements: HTTPS/permissions, actual delivered resolution and tested-device support. |
| Lines 119–125 | Sample Size and Independent Validation: independent animals, precision and grouped evaluation. |
| Lines 127–135 | Image Analysis and Regression Evaluation: formula baseline, local linear correction, median comparison and separate regression/detection metrics. |
| Lines 137–141 | Usability Evaluation: adapted PSSUQ, lower-is-better direction and separate administrator case feedback. |
| Lines 143–145 | Synthesis and Research Gap: local evaluation of the two-view browser workflow with explicit price basis. |
| Lines 147–153 | Conceptual Model of the Study: Input–Process–Output model, Figure 2.1. |
| Lines 155–170 | Operational Definition of Terms: Table 2.1 defines projected features, liveweight price, held-out pig, attempts and repeatability. |
| Chapter 3, lines 172–429 | **Methodology**: prospective implementation and field-evaluation protocol. |
| Lines 176–182 | Research Design; System Design: iterative development, paired user workflow and administrator responsibilities. |
| Lines 184–188 | Study Setting and Recruitment: purposive recruitment across at least three farms, consent, safe handling and coded identities. |
| Lines 190–210 | Proposed Animal Sample and Dataset: existing pose images, 30 new calibration pigs, three pairs per pig and conditional independent-test precision scenarios; Table 3.1. |
| Lines 212–216 | Equipment and Compatibility Protocol: calibrated scale, study phones, marker/stand, board and recorded browser/image settings. |
| Lines 218–230 | Marker and Capture Geometry: 100 mm black square, physical checks, feature-plane stand placement, measured-object tests and development-only configuration selection. |
| Lines 232–246 | System Architecture and Users: browser/server/PostgreSQL responsibilities, transient user data and separate research archive; Figure 3.1 and Table 3.2. |
| Lines 248–256 | Guided Image Capture: static composition guides, post-capture server checks and same-pig responsibility; Figure 3.2. |
| Lines 258–272 | Landmarks and Feature Extraction: named top/side proxies, annotation controls and per-view homography; Table 3.3. |
| Lines 274–284 | Weight and Price Computation: baseline/calibration/median, decimal appraisal, proposed range handling; Figure 3.3. |
| Lines 286–301 | Administrator Functions and Database Design: authorized append-only rates, future effectivity and deterministic selection; Table 3.4 and Figure 3.4. |
| Lines 303–319 | Software Tools and Development Workflow: tools, artifact/version records and incomplete features; Table 3.5. |
| Lines 321–331 | Dataset Preparation and Model Training: IDs, grouped five-fold calibration evaluation, frozen pose models and independent final test; Figure 3.5. |
| Lines 333–343 | Proposed User Interface and Program Flow: capture/result/history/admin screens; Figures 3.6–3.7. |
| Lines 345–349 | Pilot and Freeze Procedure: geometry checks, calibration, grouped evaluation and dated freeze before independent testing. |
| Lines 351–365 | Weight Estimation Test Procedure: three stable scale readings, three recaptured attempts, first-attempt primary analysis and failure accounting. |
| Lines 367–387 | Statistical Analysis of Weight Predictions: MAE, RMSE, MAPE, predictive R², signed bias, success, repeatability and pig-level intervals. |
| Lines 389–401 | Image Analysis Performance Test: independent annotations, detection AP, marker ID/corner error and keypoint PCK/missingness; Table 3.6. |
| Lines 403–407 | Market Value and Functional Testing: independently computed decimal expectations and retained failure/retest logs. |
| Lines 409–415 | Usability Respondents and Procedure: 50 purposively recruited adults (1 DA, 25 raisers, 24 traders), observed tasks and reviewed language adaptation. |
| Lines 417–423 | Usability Analysis and Interpretation: response/subscale summaries, missingness rules and separate role reporting. |
| Lines 425–429 | Research Data Management and Reporting: restricted consented archive, retention proposal, actual denominators and deviations. |
| Lines 431–481 | **References**: research papers and official documentation. Formula provenance is the WSU Extension entry at line 477. |
| Appendix A, lines 483–563 | **Adapted PigWeigh Usability Questionnaire**: all 16 items, four groupings, 1–7 lower-is-better responses and N/A. |
| Appendix B, lines 565–598 | **Functional and Arithmetic Test Cases**: Table B.1, A01–A08 and F01–F16 are expected outcomes, not execution results. |
| Appendix C, lines 600–615 | **Research Recording Forms**: Table C.1 schemas for animals/reference weights, attempts, annotation, freeze manifests, usability and test logs. |
| Appendix D, lines 617–641 | **Evidence and Proposed Specifications**: Table D.1 separates inherited scope, cited support and new protocol choices; explicitly supersedes five-feature/ridge and 250-animal development plans. |
| Lines 643–663 | **Source Manuscripts; Consolidation Notes; dated revision**: provenance links, proposal status and revision intent. |

## Approved baseline and source check

Chapter 2, Image Analysis and Regression Evaluation (line 131), and Chapter 3, Weight and Price Computation (line 278), specify:

```text
W0_kg = G_cm² × L_cm / 14451
```

The official [Washington State University Extension article, “Monitoring your show pig’s progress”](https://extension.wsu.edu/animalag/monitoring-your-show-pigs-progress/) was read on 2026-11-03 through a read-only native HTTP request. The search-service reader returned HTTP 403; the native request succeeded. The article instructs use of a fabric tape, heart girth just behind the elbow and length from the top of the head between the ears to the tail head, with both lengths in inches. It states: “weight = heart girth x heart girth x length ÷ 400.” The surrounding article expresses weights in pounds. This verifies the cited imperial baseline and measurement context, not the accuracy of PigWeigh's projected measurements.

Using exact international unit conversions, 1 inch = 2.54 cm and 1 pound = 0.45359237 kg:

```text
W_kg = ((G_cm / 2.54)² × (L_cm / 2.54) / 400) × 0.45359237
     = G_cm² × L_cm / (400 × 2.54³ / 0.45359237)
metric divisor = 14450.9168000335… ≈ 14451
```

Use the thesis's rounded **14451**, not a newly chosen precision variant. With identical measurements, the new weight is `11900 / 14451 = 0.823472424…` times the old weight, approximately **17.65% lower before rounding**. Valuation changes with the reported rounded weight; this arithmetic change is not evidence that accuracy improves by that percentage.

The current named measurement pipeline already matches the baseline's proposed proxy definitions (Chapter 3, Table 3.3 and line 278): top ear-base midpoint to tail base for L, top left/right chest width Cw, and side withers-to-sternum depth Cd. With `u=Cw/2`, `v=Cd/2`, `h=((u-v)/(u+v))²`, Ramanujan II gives `G=π(u+v)[1+3h/(10+√(4−3h))]`. That G is an ellipse circumference proxy; L is a projected straight chord. Neither is a tape measurement or recovered 3D anatomy. A marker-plane homography does not remove off-plane error.

Keep model availability, marker/landmark rejection, experimental/unevaluated status, version provenance and decimal price provenance. Do not infer a calibrated correction or accuracy guarantee from the new divisor. The historical discrepancy in [selected-weight-formula.md](../research/selected-weight-formula.md) remains evidence of the earlier 11900 choice; the new user authorization resolves which divisor to implement now.

## Thesis alignment and remaining work

The comparison below uses the implementation recorded in [PRODUCT.md](../../PRODUCT.md), [migration readiness](../migration-plan.md) and the [inference runbook](../inference.md) before this formula change. These records establish software scope and bounded checks, not completed thesis field evaluation. This handoff does not assert a new production release.

| Area | Existing behavior / authorized change | Thesis proposal still requiring work or evidence |
|---|---|---|
| Baseline | Replace 11900 with 14451 and consistently version/disclose the baseline. Preserve actual pose/marker measurements and fail-closed outcomes. | Fitted coefficients and independent weight-error evaluation are not supplied (lines 131, 278, 319). |
| Pose and geometry | Existing separate ONNX pose models, named proxies, per-view ArUco homographies and ellipse girth align with the baseline structure. | Frozen capture protocol, measured print/board/body checks and physical validation remain necessary. Existing model functionality is not anatomical or weight-accuracy certification (lines 218–230, 258–272). |
| Marker placement | Existing product instructions and guides use cards attached near back/flank; dictionary/ID/100 mm size are implemented. | Thesis instead prohibits animal attachment and proposes an adjustable stand beside the pig at the photographed feature-plane depth. This is a material capture/domain change, not part of the divisor-only authorization. Reconcile guidance and bundle geometry identity, test new captures and version the setup before adopting it (lines 111, 224, 347). |
| Capture | Manual guides, explicit camera permission, uploads, automatic per-photo checks, pair gating and final rechecks exist. | No live marker/distance detection is implied. Same-pig identity and physical placement remain user responsibilities; research attempt accounting and frozen device compatibility need evidence (lines 248–252, 357–363). |
| Prices | Authenticated append-only publication, current price provenance, decimal valuation from reported weight and weight-only fallback exist. | Public/admin history screens and future-effective scheduling/selection rules are thesis requirements requiring separate scope. Existing records are immediately effective; do not describe proposed timestamp tie-breaking as implemented (lines 244–245, 280, 288–290, 319). |
| Evaluation range | No new range policy is authorized by replacing the divisor. | Thesis proposes eligibility on the unrounded prediction, outside 20–30 kg messaging and no appraisal, plus a warning that in-range output cannot prove true eligibility. This is a separate API/UI/analysis change (lines 61, 280; Appendix B F08). |
| Research data | Existing unpaired source datasets preserve actual scale-weight class provenance and support pose training. Ordinary submissions are transient. | New consented same-pig paired ArUco captures, IDs, contemporaneous scale weights, stand geometry, annotations and split audit are needed for calibration/test. Do not pair existing images by weight class or count images as independent animals (lines 192, 210, 323). |
| Validation and usability | Repository software/ONNX/browser checks establish only their recorded scope. | Field metrics, held-out image annotations, observed task tests and adapted PSSUQ study are prospective. Goals of MAPE ≤10% and first-attempt success ≥90% are proposed targets, not measured outcomes (lines 367–429; Appendices A–C). |
| Privacy/research archive | No new production image storage is authorized. | Separate consent, restricted research archive, retention/deletion policy and failed-attempt records need operational evidence; do not add retention merely because research forms exist (lines 67, 234, 425–429). |

The source's definition of **Guided capture** (line 163) says that preview prompts check marker visibility and image scale, but its browser-processing and capture sections (lines 115 and 250) describe static guides followed by server checks. The current app implements the latter. Resolve that wording within the thesis before claiming live preview detection or scale measurement.

## Proposed calibration and comparison pipeline

This is the thesis's research handoff, not a fitted implementation or a claim that coefficients exist.

1. Verify marker dimensions/geometry on measured rigid objects, then pilot actual captures. Freeze or version device/camera modes, measured marker configuration, geometry, pose artifacts, landmark definitions, thresholds and attempt rules. A stand changes acquisition conditions and must not silently inherit attached-card validation (Marker and Capture Geometry; Pilot and Freeze Procedure).
2. Initially recruit **30 independent pigs within 20–30 kg**, with three scheduled top/side attempts each: 90 paired records and 180 photographs if all are obtained. Record failures and missingness rather than reporting all scheduled captures as successes. Collect same-session scale references; the test procedure proposes three stable readings and their mean. Thirty is exploratory, not a universal sufficient sample (lines 192–210, 353–359).
3. Keep the pose models frozen and use their predicted landmarks. For each usable pair compute W0 with 14451. Fit only `Wcal = a + bW0` to scale weights, giving every pig equal total influence across its usable repeated pairs. For example, distribute a pig's total fitting weight equally across its usable pairs; more successful captures must not give that animal more total weight. Do not guess a or b, transfer another study's coefficients or implement the superseded five-feature/ridge plan (lines 278, 325; Appendix D).
4. Use pig-grouped five-fold cross-validation: every pair/session/crop of a pig stays in its partition. Fit the correction **and training-target median baseline inside each training fold**, then evaluate excluded pigs. Compare median, W0 and Wcal on the same evaluable pigs and report failures separately. The median is a research comparator, never a production fallback for failed image analysis. Specify its pig-level target construction so repeated images do not change the target population (lines 125, 276–278, 325).
5. Select the correction using development/calibration evidence, refit it on calibration pigs only, then freeze the entire pipeline before independent final testing. Final-test pigs and weights cannot enter pose development, fitting, threshold choice or tuning; farm overlap limits claims to pig-held-out evaluation rather than farm-external validation (lines 323–349).
6. The thesis's final-test planning targets MAE interval precision, not an individual prediction guarantee. Assumed absolute-error SDs of 1.0/1.5/2.0 kg give 16/35/62 evaluable independent primary predictions; a provisional 20% nonevaluable allowance gives 20/44/78 scheduled pigs. These are conditional calculations, not collected results or an unconditional sample requirement. Primary analysis uses the first scheduled attempt; failed first attempts remain in the success denominator and later successes do not replace them. Report errors beside failure rates, repeatability and pig-level uncertainty (lines 194–198, 351–387).

The existing 2,397 top and 2,015 side prepared images are **pose-training image counts**, with no verified same-animal cross-view pairing. Scale-weight classes alone cannot supply the paired proxy/scale records needed to fit this correction. No supplied calibration table, fitted a/b values, frozen stand protocol or independent final-test results were established by this review. The approved uncalibrated baseline can be implemented now as an experimental estimate; calibrated deployment and the broader thesis features remain separate work.
