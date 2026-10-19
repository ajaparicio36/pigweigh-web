---
status: proposed
---

# Gate numerical estimates on calibrated artifacts

Historical proposal: the mandatory weight-calibration/held-out gate below is **superseded for the experimental prototype by accepted [ADR-0007](0007-formula-weight-prototype.md)**. The user selected formula-derived output from real pose/marker measurements, with error evaluation afterward. Compatible checkpoints, explicit marker/geometry configuration and rejection of unusable captures still gate serving; regression fitting does not.

Propose three readiness groups: top/side pose checkpoints and landmark schema; measurement calibration and capture/marker geometry; weight calibration or regression with held-out validation. Missing or incompatible groups should yield explicit unavailable/capture-rejection results rather than invented kilograms or PHP. A successful estimate should retain artifact versions and the price snapshot/reference used for valuation. The exact artifact schema, rejection thresholds, validation bar, and photo-to-weight method await agreement; no supplied tape formula is accepted as that method.
