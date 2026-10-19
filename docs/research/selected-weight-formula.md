# User-selected formula prototype

Verified 2026-10-19. The user selected `W_kg = G_cm² * L_cm / 11900` for a time-constrained experimental prototype using trained pose models and attached ArUco references. This supersedes mandatory regression fitting/held-out acceptance before prototype numerical output. Evaluation can follow implementation; accuracy remains unmeasured.

## Source inspection and discrepancy

[Pig Weight Calculator / HogWeigh](https://pigweightcalculator.org/) returned HTTP 200 through a native read-only request. The search-service reader could not access the URL. The HTML's published [application bundle](https://pigweightcalculator.org/assets/index-C5jpGG6z.js) was read as text without executing it or opening a browser.

The site's “Pig Weight Formula & Calculation Example” displays the metric divisor **11,900** for centimeters and kilograms. Its measurement instructions define heart girth as circumference directly behind the front legs and over the shoulder blades, and body length along the spine from the base of the ears to the base of the tail.

However, the active calculator handler implements metric weight as:

```text
((girth_cm / 2.54)^2 * (length_cm / 2.54) / 400) / 2.20462
```

That is equivalent to divisor `400 * 2.54³ * 2.20462 = 14450.899614272`, **not 11900**. For identical inputs the selected divisor yields approximately 21.4% more weight. The site's own example follows its imperial calculation rather than the displayed metric divisor. Record this inconsistency; do not silently switch the user's selected formula to match the handler.

Exact public bundle excerpts (read as text, not executed), with `r` the girth input and `a` the length input:

```javascript
let o=e===`imperial`?r**2*a/400:(r/2.54)**2*(a/2.54)/400,
c=(e===`imperial`?o:o/2.20462).toFixed(1)
```

Displayed text in the same bundle:

```text
(Heart Girth in cm² × Body Length in cm) ÷ 11,900 = Live Weight in kg
```

The site attributes its methodology to Kansas State University/USDA and claims 3–5% error, but the inspected content did not provide an identifiable validating study or dataset for the displayed 11900 expression. Those claims are unverified and are not PigWeigh accuracy evidence. [The AGRIS paper](agris-pig-weight-study.md) is a different fitted length × chest-depth regression; it is not the provenance of this divisor.

## Concrete experimental geometry

The following is the proposed simple measurement definition for implementation review, not a direct measurement of full three-dimensional girth:

1. Detect the known flat attached ArUco reference separately in each photo. Its physical black-square side and dictionary must come from explicit configuration; they are not chosen here. Map pose coordinates back through resize/letterbox/EXIF transforms. Use local marker-plane scaling/rectification and reject unusable markers or landmarks rather than inventing scale.
2. From the top view obtain chest width `w_cm` between the named left/right chest points. From the side view obtain chest depth `d_cm` between the reviewed dorsal thoracic anchor (initial candidate: withers) and sternum. These must correspond approximately to the same chest section; the withers–sternum pair needs explicit placement review because it may be oblique or anatomically noisy. Do not use hoof height or arbitrary lowest belly as chest depth.
3. Approximate that cross-section as an ellipse, with semiaxes `a=w_cm/2`, `b=d_cm/2`. Use Ramanujan II: `h=((a-b)/(a+b))²`, then `G_cm ≈ π*(a+b)*(1 + 3h/(10+sqrt(4-3h)))`. This is an ellipse-model circumference proxy, not a tape measurement or a claim that pig torsos are exact ellipses.
4. For a minimal length proxy, use the top-view midpoint of the named ear bases to tail-base distance. The source requests a path along the spine; a straight image distance is only a proxy. Apply straight-posture checks and retain this distinction. Do not substitute snout-to-tail length. Where tail-base is missing or unusable, reject that capture; do not use tail-tip as a fallback.
5. Apply the selected expression to these actual derived centimeter features: `W_kg = G_cm² * L_cm / 11900`. Version the formula, divisor, named feature definitions and units. Once the real pipeline and configured models/markers work, a numerical result is a legitimate **experimental estimate**, with unmeasured accuracy; it need not wait for regression training.

Flat body-attached references reduce local plane offset but do not flatten the curved pig. Two sequential images also require matching identity, section and posture. These assumptions and proxy definitions must remain visible in the method metadata and capture instructions. Keypoint confidence can gate landmark usability; it must not be relabeled as kilogram certainty.

## Error evaluation after implementation

For a pig with scale weight 30 kg and estimate 28 kg: signed error is `28-30=-2 kg`, absolute error is `2 kg`, and absolute percentage error is `2/30*100≈6.7%`. This is arithmetic illustration, not a PigWeigh test result.

Collect same-pig paired captures and contemporaneous scale weights, record the formula/configuration version, then summarize kilogram errors and bias over the tested animals. Keep repeat sessions/augmentations grouped by pig when assessing generalization. No particular sample count or acceptable error is promised. Later empirical correction or regression is optional refinement; it is not a prerequisite to implementing this selected prototype.

Current blockers are missing compatible serving pose checkpoints, concrete marker/geometry configuration and pipeline integration. A failed/missing measurement still returns unavailable or rejected input. No class-label weights, invented confidence or fabricated successful output is authorized. Existing decimal-safe valuation and price provenance remain unchanged.
