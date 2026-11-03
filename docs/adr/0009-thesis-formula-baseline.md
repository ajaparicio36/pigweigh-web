---
status: accepted
---

# Use the thesis formula baseline

On 2026-11-03 the user approved the revised thesis baseline `W0_kg = G_cm² × L_cm / 14451` for the experimental prototype, superseding [ADR-0007](0007-formula-weight-prototype.md)'s 11900 divisor. The divisor is the rounded conversion of `G_in² × L_in / 400` pounds to centimeters and kilograms: `400 × 2.54³ / 0.45359237 ≈ 14450.9168`. This conversion does not validate photo-derived proxies or establish weight accuracy. The earlier website's inconsistent displayed and calculated formulas remain recorded in [source inspection](../research/selected-weight-formula.md).

Keep the existing geometry: each view uses its own configured marker-plane homography. `L` is the top-view projected distance from the ear-base midpoint to the tail base; top left/right chest gives width and side withers/sternum gives depth. Ramanujan II ellipse circumference from width/2 and depth/2 supplies `G`. The straight projected length is not the tape path along the spine, and the ellipse is not measured tape girth. Attached reference cards and projections do not make the curved body coplanar or establish same-pig identity. Keep the existing marker configuration and engineering rejection gates; the thesis's proposed marker stand is not a change to the implemented capture protocol.

Serve only actual usable measurements from a compatible configured pose bundle. Missing or invalid bundles remain unavailable and unusable captures are rejected. The method and divisor are versioned in the manifest and response, with a content-derived bundle ID binding the method and model configuration. Old 11900 bundles are incompatible. Valuation remains Decimal arithmetic on the two-decimal reported weight and a price snapshot taken after inference.

The thesis proposes comparing the baseline with `Wcal = a + b × W0` and a fold-specific median predictor. Those are research work requiring same-pig paired captures and scale weights, with correction and median fitted only on training pigs in each grouped fold. No fitted coefficients or median are available; neither is a production fallback for rejected or unavailable image analysis. Do not claim empirical accuracy, trading fitness or calibrated output. The thesis's proposed 20–30 kg eligibility rule and stand-based capture setup are not implemented by this decision.
