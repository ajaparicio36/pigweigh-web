---
status: accepted
---

# Use the user-selected formula for the experimental prototype

On 2026-10-19 the user selected `W_kg = G_cm² * L_cm / 11900` from [pigweightcalculator.org](https://pigweightcalculator.org/) with top/side pose models and flat body-attached ArUco reference cards. Time constraints favor implementing this explicit baseline before measuring its error; trained weight regression and held-out accuracy acceptance are not prerequisites to experimental numerical output.

The [source inspection and geometry outline](../research/selected-weight-formula.md) records a material inconsistency: the website displays 11900 but its calculator code uses an imperial conversion equivalent to approximately 14450.9. Retain the user's selected 11900; its population validity and the site's accuracy claims are unverified. This is different from the AGRIS length × chest-depth regression and the previously discussed tape coefficients.

Use an ellipse approximation from top chest width and side chest depth for `G_cm`, plus an ear-base-to-tail-base length proxy, with explicit named points, units and projection assumptions. A curved body and spine path are not fully reconstructed by these two photos. On 2026-10-23 these mappings were implemented with a private CPU ONNX bundle and the settled `DICT_4X4_50` / ID 0 / 100 mm black-square reference; see [ADR-0008](0008-cpu-inference-bundle.md) and [inference runbook](../inference.md). The configured physical size remains an assumption to verify on the actual print.

Numerical readiness requires compatible user-trained pose checkpoints, explicit marker/geometry configuration and a working measurement/formula pipeline. Missing or unusable inputs yield unavailable/rejected results. Formula-derived output from actual measurements is a legitimate experimental estimate with unmeasured accuracy; fabricated confidence, class-label weight fallback and guessed marker scale remain excluded. Keep bundle/formula versions and the current price snapshot in successful results.

This supersedes ADR-0003's proposed mandatory weight-calibration/regression gate for this prototype and amends ADR-0006's remaining-method frontier. Compare results against scale weights after implementation, recording kilogram error and bias. Later fitted calibration is optional refinement; no trading-fitness, numerical accuracy or percentage-error claim is accepted.
