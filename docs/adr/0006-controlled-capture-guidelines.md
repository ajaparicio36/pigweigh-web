---
status: accepted
---

# Formalize controlled phone capture with attached references

## Accepted user direction, 2026-10-19

The user accepted phone upload/capture with taught testing guidelines in a controlled pen: a straight bird's-eye top photo with a flat ArUco reference card attached near the measured back region, and a straight-on side photo with a flat card near the measured flank region. This supersedes the earlier floor/wall-marker direction discussed on the same date. Both views remain a capture pair of the same pig. This narrows ADR-0004's handheld thesis direction; it does not require abandoning existing annotations or replacing the user-trained pose models.

Print the sticker onto a flat card and use a removable attachment. Keep the whole marker and surrounding white margin visible, measure the actual printed black-square side, and avoid covering anatomical landmarks. A sticker conforming to curved skin is not a flat reference. Attachment near the measured region reduces plane offset; it does not make every part of the curved body coplanar. Settled on 2026-10-23: `DICT_4X4_50`, ID 0, black-square side 100 mm (10 cm), excluding the white margin. Verify the actual print with a ruler; a document's 100 mm size setting is not physical verification.

The user identifies the Roboflow projects as canonical and requires preservation of annotation work. Any reviewed slot/name reconciliation must be recorded in separately generated preparation data/manifests, with original coordinates, actual scale-weight classes and provenance preserved. Existing unpaired datasets remain useful; they must not be joined into invented animal pairs.

## Proposed technical consequences

Use each attached marker as its own local reference plane. Simple pixels-per-centimeter or homography distances represent body measurements only under their documented plane/depth assumptions. Apply the selected experimental formula under ADR-0007 once actual measurements and serving configuration work; evaluate error against scales afterward. Regression fitting is optional later refinement. New marker images also need a pose-domain check for attachment/occlusion effects; no numerical accuracy claim is accepted.

Collect same-pig/session top and side originals, physical marker measurements, phone/protocol metadata and live scale weights. Keep animals and their sessions together across split boundaries. Preserve a held-out evaluation and explicit capture rejection coverage. The [weight-estimation roadmap](../research/weight-estimation-roadmap.md) records primary sources and the proposed calibration table/artifact outline.

This ADR accepts **the capture direction and preservation policy**. Accepted [ADR-0007](0007-formula-weight-prototype.md) selects the 11900 formula without mandatory regression fitting. [ADR-0008](0008-cpu-inference-bundle.md) and the [runbook](../inference.md) record the implemented marker, named mappings, bundle and engineering rejection gates. Physical print/placement suitability and scale-error evaluation remain unverified. Missing/invalid configured bundles or unusable captures still require unavailable/rejected results; no accuracy claim is accepted.
