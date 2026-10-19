---
status: accepted
---

# Require top and side photos and replace class-label weight inference

The user requires a top-view and side-view capture pair and a pose-plus-ArUco approach. The legacy app accepts one view and derives weight from a detection-class label; it also enables fabricated confidence. Those legacy policies are excluded. Requiring two photos establishes the input contract, not a validated weight method: capture geometry, landmark meanings, measurement calibration, and weight calibration remain unresolved research dependencies.
