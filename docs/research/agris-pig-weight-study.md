# Relevance of the AGRIS smartphone pig-weight study

Reviewed 2026-10-19 using the research skill. **Useful as a candidate feature/regression baseline and evidence for a local body-plane reference.** The user has since accepted flat ArUco cards attached near the measured back/flank regions, superseding floor/wall references. No published coefficient or accuracy claim has been adopted.

## Identity and access

Thapar, G.; Biswas, T.K.; Bhushan, B.; Naskar, S.; Kumar, A.; Dandapat, P.; Rokhade, J. (2023). *Accurate estimation of body weight of pigs through smartphone image measurement app*. Smart Agricultural Technology 4, 100194. [DOI: 10.1016/j.atech.2023.100194](https://doi.org/10.1016/j.atech.2023.100194).

The [user's AGRIS record](https://agris.fao.org/search/en/providers/122436/records/67597dbdc7a957febdf8dd0b) was read. Direct [publisher retrieval](https://www.sciencedirect.com/science/article/pii/S2772375523000242) returned HTTP 403. The complete published-article text was readable in the [public author upload by Tapas Kumar Biswas](https://www.researchgate.net/publication/367967821_Accurate_estimation_of_body_weight_of_pigs_through_smartphone_image_measurement_app), identified as uploaded 2025-05-30. Findings below use its numbered methods/results/tables, not only the abstract. Figure captions/text were available; anatomical endpoint equivalence has not been certified from figure pixels. No access controls were bypassed or data requested.

## Published evidence

| Topic | Reported finding and locator |
|---|---|
| Population | Ghoongroo, 30–190 days; 395 farm observations/100 pigs; independent 45 field pigs/four villages (§§2.1, 2.6–2.7). |
| Weight/truth | Farm 2.90–58 kg; field 4.40–36 kg (Table 1, p.5); spring balance/platform (§2.2). |
| Imaging | Samsung M31, 64 MP, 2.5–6 ft; top/side, straight posture; On 3D CameraMeasure v7 (§§2.2.2–2.3). |
| Reference | Coplanar pixel-density reference; cards taped onto back/flank (§§2.2.2–2.4, p.3; Fig.2). No depth-offset correction specified. |
| Features | Manual endpoints, three-image means. BL2: tail base–ear base; HGH: chest depth, not circumference (§§2.2.1, 2.4; Fig.1). |
| Fit | `Y_kg = -6.335 + 0.024*(BL2_cm*HGH_cm)`; training R²=0.98 (Table 5, p.8). |
| Test | Same-breed field pigs; predicted/actual r=0.99 (§3.5; Fig.6). |

The coefficients are fitted. The equation is linear in the product feature despite being called nonlinear. Correlation is not kilogram error; cited validation supplies no MAE/RMSE. Repeated observations are not independent animals. Automated keypoints and floor/wall scaling were not validated.

## Engineering assessment for PigWeigh

The reusable idea is a small interpretable **length × chest-depth predictor**, tested against scale weight. We can compare that feature family with our proposed simpler linear/ridge baselines. This gives us a concrete experiment without assuming that a tape-girth formula or a learned class label is kilograms.

The user now accepts a closer geometric match: flat cards attached near the measured back and flank regions. Print a sticker onto a flat card, keep its corners and white margin visible, measure the printed black-square side, and avoid landmarks. This reduces offset compared with the historical floor/wall option, but the curved body remains noncoplanar in places. Knowing camera-to-marker distance still does not locate every body point. Validate the ArUco/keypoint implementation and residual geometry under our own pen protocol using the [roadmap](weight-estimation-roadmap.md); the study's fitted constants do not automatically transfer.

Published coefficients should be evaluated only in an offline comparison after confirming anatomical definitions, units, projection, reference-plane treatment and population applicability. Do not insert unvalidated marker-reference distances into the published equation and label them the paper's body dimensions. Do not substitute meters for centimeters without changing units/coefficient, or substitute snout–tail length, ear tip, hoof height, belly depth or circumference. Do not clamp extrapolated output into a plausible weight and present it as validated.

## Compatibility with existing annotations

Preserve the canonical Roboflow projects and originals. The guide contains potential top ear-base/tail-base anchors and potential side dorsal-chest/ventral-chest anchors, but the ongoing preparation audit determines their actual meaning across classes. Named landmarks, not assumed universal slot numbers, must drive extraction. A midpoint between top ear bases is a **proposed proxy** for an anterior length endpoint, not established equivalence to BL2. Side ear-tip is not ear-base; an arbitrary back-to-belly line is not certified HGH.

Therefore, first inspect a small representative prepared-label sample and record an explicit feature definition. If the annotations support only a proxy, fit a local proxy-feature regression and name it accordingly. Additional exact endpoints can be collected in the new calibration subset if necessary; no wholesale reannotation follows from this paper. Existing true-weight classes remain useful per-view provenance; do not fabricate same-pig top/side pairs by matching weight classes.

## Reproducible next experiment

1. Finish non-destructive canonical pose preparation, then let the user train/evaluate the two pose models. Preserve source weight metadata.
2. Collect real same-pig/session paired phone images and scale weights under the accepted pen protocol, recording marker size/ID/dictionary, phone mode and geometry metadata from the roadmap.
3. Review and freeze compatible named features. Compare a training-mean baseline, individual reference features, and a fitted product model `kg = a + b*(length_reference*chest_depth_reference)`; estimate `a,b` locally. This expression proposes a model family, not numerical coefficients or metric body claims.
4. Keep every pig's sessions/augmentations in one split; reserve untouched animals for final testing. Report kilogram MAE/RMSE, signed bias, weight-range/device strata and rejection rates. Evaluate single-pair capture explicitly because our runtime input contract differs from repeated-image averaging.
5. Integrate only after checkpoint schemas, geometry/feature contracts, fitted parameters, capture bounds and held-out acceptance are reviewed. Missing artifacts continue to return unavailable inference. No source datasets, application code, deployment or training were changed for this assessment.
