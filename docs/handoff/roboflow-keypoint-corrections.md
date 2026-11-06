# Roboflow keypoint corrections

Use this guide to correct the training annotations in the user's [side project](https://app.roboflow.com/maria-antonette-efren/pigweight_side-znzvb/1) and [top project](https://app.roboflow.com/maria-antonette-efren/pigweight_top-aizjl). These are separate datasets. A label edit affects a future model only after a new export, reviewed preparation, training, ONNX export, testing and release. Nothing in this guide asserts that a particular correction improves weight accuracy.

**For the annotation team:** complete [Before editing](#before-editing), then follow [the numbered editing steps](#step-by-step-edit-an-existing-image). Keep the landmark tables open beside Roboflow. Finish with the [handoff checklist](#annotation-team-handoff-checklist); the developer handles dataset preparation and model replacement afterward.

The user-supplied comparison shows cyan original W–S and orange manually adjusted W–F segments. It is useful for identifying photos to inspect, but neither overlay establishes the true anatomical point, physical scale or accuracy. In the pinned v2.6 source (`fa0201f206d511be3d4871f5cf87bfea7e8126f1`), [the overlay](https://github.com/ajaparicio36/pigweigh-web/blob/fa0201f206d511be3d4871f5cf87bfea7e8126f1/web/components/measurement-overlay.tsx) calls withers **W**, sternum **S**, front shoulder joint **F** and lowest belly **B**; F and B are non-movable reference points. Its depth segment is **W–S**, not W–F. The UI's instruction to match chest lines behind the front legs does not redefine withers as any desired point on the back. These runtime adjustments are estimate-request overrides, not saved Roboflow training labels. Do not copy coordinates from the comparison or move points to produce a preferred kilogram result.

## Before editing

1. Record the project and source version, class/skeleton names and orders, image IDs, split membership, preprocessing and augmentation settings. The side link opens version 1; confirm which version and working annotations you are inspecting. Current project annotations and an earlier frozen version need not be identical.
2. Preserve a private, recoverable copy of the original images, annotations, schemas and metadata before making edits. A Roboflow dataset version freezes a snapshot with its selected processing; verify that the saved export and schema are sufficient to recover the intended source before editing. Roboflow's [export documentation](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data) distinguishes compressed version exports from original-quality source downloads. Keep existing original and prepared directories unchanged, and use a new private destination for each export. The [version guide](https://docs.roboflow.com/datasets/dataset-versions/create-a-dataset-version) explains snapshots and processing settings. Download commands may contain private keys; never share or commit them.
3. Preserve each image's source weight class and recorded scale-weight string, original image ID, pig ID, capture session and farm/device information where known. An equal weight class does **not** identify the same pig or establish a top/side pair. Keep private records private, including the comparison image.
4. Read the [reviewed preparation](../research/pose-preparation.md), [schema audit](../research/roboflow-schema-audit.md), and [class-specific mapping](../../training/config/roboflow-pose-v1.json). Agree on a consistent left/right convention with the annotation owner and record it. The existing audit found possible left/right ambiguity in a top class, so resolve it with evidence rather than silently swapping labels.

## What each point means

These are **canonical prepared-model indices**, not universal Roboflow source slots. Use the existing named point in the current image's source class. For example, `16KG_Top` and `18_top` have different source orders, as do `16_side` and `17_side`; the mapping policy records their individual permutations. The historical [annotation guide](../conversations/landmarks.md) is useful anatomy context, but its universal source-order claims do not override the audit. Do not rename a class, reorder a skeleton, shift missing IDs, or equate points merely because they share a screen position.

| Top index and point | Placement target when supported by the photo |
|---|---|
| 0 `snout-tip` | Frontmost tip of the snout. |
| 1–2 `left-ear-base`, `right-ear-base` | Each ear's attachment to the head, not its tip. Their midpoint is the front anchor for L. |
| 3–4 `left-shoulder`, `right-shoulder` | Left/right lateral shoulder-blade borders. |
| 5–6 `left-chest`, `right-chest` | Opposite lateral ribcage/chest edges behind the shoulders; their segment is the top chest-width proxy. |
| 7–8 `left-hip`, `right-hip` | Opposite lateral pelvic/hip prominences. |
| 9 `tail-base` | Tail insertion at the rump, not the tail tip; it is the rear anchor for L. |
| 10 `spine-midpoint` | Dorsal midline between the shoulders and hips. |

| Side index and point | Placement target when supported by the photo |
|---|---|
| 0 `snout-tip` | Frontmost point of the snout profile. |
| 1 `eye` | Center of the visible eye. |
| 2 `ear-tip` | Tip of the visible ear, not its base. |
| 3 `withers` | Dorsal neck-to-back transition at the top of the shoulders; the upper endpoint of the current depth proxy. |
| 4 `mid-point-peak` | Highest curve of the back between withers and loin. |
| 5 `loin` | Dorsal transition before or around the hips. |
| 6 `tail-base` | Tail attachment at the rump, not the tail tip. |
| 7 `front-shoulder-joint` | Center of the front shoulder/leg joint; a separate landmark from the sternum. |
| 8 `front-hoof` | Front hoof's ground-contact point. |
| 9 `rear-hip-joint` | Center of the rear hip/leg joint. |
| 10 `rear-hoof` | Rear hoof's ground-contact point. The audited source name `Rear_Hip-attach-to-ground-` maps here, not to the rear hip joint. |
| 11 `sternum` | Ventral chest floor just behind the front leg; the lower endpoint of the current depth proxy. |
| 12 `belly-lowest-part` | Lowest ventral abdominal contour; separate from the sternum. |

The serving manifest's named order and geometry are documented in [CPU inference](../inference.md#capture-and-implemented-measurement). The method uses the top ear-base midpoint to tail base for L, top chest width and side withers-to-sternum depth for an ellipse estimate of G, then `G_cm² × L_cm / 14451`. These are projected photo proxies, not tape measurements or a reconstructed 3D body. Keep the baseline and the `DICT_4X4_50`, ID 0, 100 mm black-square marker configuration unchanged while correcting labels.

The existing policy masks canonical top `tail-base` for `20-TOP` and `29-TOP` because their source names are `tail-tip` and `tail`, respectively. They are not verified aliases for tail base. Preserve that mask unless a separately reviewed source/schema correction establishes the intended point and updates the policy with evidence.

## Step by step: edit an existing image

These steps correct points on photos already in the projects. You do not need to upload the same photos again or start annotating from scratch. Roboflow's [official editing tutorial](https://roboflow.com/blog/train-a-custom-yolov8-pose-estimation-model) documents opening **Annotate** and dragging keypoints. Exact menu positions can differ from the tutorial; this walkthrough has not been verified against the team's current signed-in editor.

1. **Open the correct project.** Sign in to the workspace `maria-antonette-efren`. Start with [pigweight_side-znzvb](https://app.roboflow.com/maria-antonette-efren/pigweight_side-znzvb/1) for side photos. Use [pigweight_top-aizjl](https://app.roboflow.com/maria-antonette-efren/pigweight_top-aizjl) for top photos. The side link may land on a frozen version page; use the project navigation to reach the working images.

2. **Find the original photo.** Open **Annotate** and the relevant annotation job/batch, then select the image. If an already-labeled image is absent from that queue, locate it in the project's **Dataset** image list and open its annotation editor. Match the filename or image ID, not just a similar-looking pig. Record that identifier so another person can find the correction later. If you only have a read-only viewer, ask the workspace owner for annotation access.

3. **Select the pig's existing annotation.** Click its existing object/skeleton or its entry in the annotation list. Confirm the source class, such as `16_side`, and the landmark names. Keep that class unchanged: its weight information must be preserved. Do not draw a second pig annotation or use **Classes** to rebuild/reorder the skeleton. If the editor offers only new annotation placement, switch to selecting the existing annotation first.

4. **Find the named point before moving it.** Use the editor's landmark labels/list or point details to identify it. Source labels may use capitalization, spaces or underscores; consult the class mapping if a name is unclear. Do not identify a point solely by its color, line connection or index. Different source classes have different orders.

5. **Zoom in on the anatomy.** Keep enough of the pig visible to recognize the shoulder, chest, back and belly. Zooming changes your view of the photo; it does not change where a point belongs. Check the current point against the tables above before deciding it is wrong.

6. **Drag only the misplaced point.** Select the existing keypoint handle and drag it to its supported anatomical location. Release it, then confirm its name and position. Avoid dragging the whole skeleton, box or image. If several points move together, undo that change and select the individual handle again. Leave correctly placed points alone.

7. **For side photos, check W, S, F and B separately.** In the comparison supplied by the team, WS means the original web app and WF means the tweaked version. The overlay also uses letters for landmarks, so identify the actual named endpoints rather than relying on those abbreviations. Check each of these four points:

   | Named point | Where to check | What to avoid |
   |---|---|---|
   | `withers` (W) | Top of the shoulders at the neck-to-back transition. | Moving it anywhere along the back just to straighten a line. |
   | `sternum` (S) | Underside of the chest just behind the front leg. | Moving it onto the shoulder joint or lowest belly point. |
   | `front-shoulder-joint` (F) | The front shoulder/leg joint. | Treating it as another name for sternum. |
   | `belly-lowest-part` (B) | Lowest underside of the abdomen. | Using it as the chest-floor endpoint. |

   The app's current side-depth proxy is **withers to sternum**. If the team actually wants a shoulder-joint endpoint instead, that is a measurement-method change to discuss with the developer, not a reason to relabel the sternum. An internal joint or hidden chest edge may not be reliably identifiable in every photo; use step 9 when uncertain.

8. **For top photos, check the measurement anchors.** Verify both ear **bases**, both chest edges behind the shoulders, and the tail **base**. Ear tips and tail tips are different points. Keep the agreed left/right convention even when the pig faces the other direction; do not silently swap labels based on screen-left/screen-right. If the source point is named `tail-tip` or `tail`, flag it for schema review instead of renaming it or assuming it means tail base. The existing `20-TOP` and `29-TOP` masks remain in force until that review.

9. **Handle hidden or uncertain points consistently.** If a point is obscured but its location is supportable under the agreed annotation policy, Roboflow documents right-clicking it and choosing **Mark as Occluded**. If its location cannot be established, do not guess or place it on a nearby visible joint. Use an unlabeled state only if supported and verified for this project; otherwise flag that image/object for review or exclusion. Check a small export before applying a visibility policy across the dataset.

10. **Save and reopen the same image.** Use the editor's save/complete control if present; if it saves automatically, wait for saving to finish. Return to the image list, reopen the exact filename/image ID, and verify that the corrected point and visibility state persisted. Do this on the first correction before processing a batch. If it did not save, resolve access/save errors before continuing.

11. **Record and review the correction.** Keep a private log with image ID, project, source class, point name, before/after description, reason, annotator and reviewer. For example: `side | <image ID> | <source class> | sternum | was on shoulder joint; moved to visible chest floor | reviewer: <name>`. Have a second person review a small batch, including both facing directions and difficult lighting/occlusion, before applying the same interpretation broadly. Resolve disagreements using anatomy rather than the expected weight.

12. **Repeat on the remaining images and the other project.** Check the rest of each skeleton too; do not assume all other points are correct. Top and side projects contain different pigs, so do not pair photos because their weight classes match. Tell the developer when each reviewed batch is ready, including unresolved cases.

## Annotation-team handoff checklist

- [ ] Original export/schema/weight metadata are recoverable in a private backup.
- [ ] Corrected images were reopened and checked; source classes and skeleton orders were preserved.
- [ ] Named points follow one placement and visibility policy; unresolved images are listed.
- [ ] A reviewer checked representative corrections in both projects.
- [ ] The private change log identifies edited images and reasons, without credentials.
- [ ] The developer receives the project links, reviewed batch/image IDs and any grouping information.

At this point the annotation edits are ready for dataset-version review. The website will still use the currently deployed model until the remaining export, training and release steps are completed.

## Preserve evaluation groups

Keep reliable pig/session groups together in training, validation or test; include related photos, crops and augmentations in the same group. Use a separate held-out set for evaluation and check for duplicate/near-duplicate leakage. Random rebalancing can separate related images, so verify the final assignments by group. If identities or sessions are unknown, record that split independence is unverified; do not invent groups or claim an independent holdout.

## From corrected labels to a candidate bundle

1. In each project, review the completed source annotations and split assignments. Generate a **new** dataset version through **Versions** (or the current equivalent), record its ID and all processing/augmentation settings, and export a compatible YOLO pose dataset to a new private location. Roboflow's [export documentation](https://docs.roboflow.com/datasets/versions/dataset-versions/exporting-data) currently lists `yolov5pytorch` for keypoint detection; select the corresponding format if available, then verify its actual output rather than relying on the name. Check the exported images, labels, point counts, visibility and class orders against named source annotations on representative classes and both orientations. Flips remain disabled until left/right semantics are verified.
2. The existing `roboflow-pose-v1.json` and `prepare_pose.py` bind the previous source to reviewed class names, permutations, label/image evidence hashes and exclusions. A corrected export may fail those checks. Do not overwrite the old export, silently replace old hashes or bypass the validator. Review the new version's per-class mapping, aliases, masks, exclusions and evidence, and create a separately versioned policy and any necessary tested preparation changes before producing a fresh prepared copy. Validate it against the new source and retain original weight provenance and available pig/session IDs; the existing preparer records `paired_capture_ids: null`, so preserve new grouping evidence separately unless the preparation contract is deliberately extended. The [preparation runbook](../research/pose-preparation.md#tools-and-commands) documents the current checks and their limits; its old commands and fixed policy are not an automatic recipe for a changed export.
3. Train top and side models on the reviewed prepared copies using the user's training environment. Keep checkpoints, source data, private photographs and credentials outside Git. Evaluate the named landmark predictions on the held-out images, including occluded and difficult cases. For weight evaluation, separately use true same-pig capture pairs and associated live scale weights; report errors and limitations without treating pose confidence or a class label as weight accuracy.
4. Export both candidate checkpoints to a **new private** CPU ONNX bundle with the [export runbook](../../training/README-export.md), checking model metadata, canonical orders, shapes, hashes and PyTorch/ONNX parity. Review the new manifest and bundle ID, then run applicable preparation/export, loader, inference, rejection and end-to-end checks described in [models](models.md) and the [inference runbook](../inference.md). A parity test on fixtures demonstrates functional equivalence, not physical accuracy.
5. Only after review and successful checks, follow the model replacement/release process. Exactly `server/models/v1/manifest.json`, `server/models/v1/top.onnx` and `server/models/v1/side.onnx` are approved for ordinary Git; independently verify the bundle and manifest hashes before release. Do not change the formula divisor or marker dimensions automatically to compensate for annotation or model errors.

This guide documents a future user-run workflow. No source annotation, dataset export, training, model replacement or production deployment was performed by writing it.
