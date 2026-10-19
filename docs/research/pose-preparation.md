# Reversible Roboflow pose preparation

Reviewed 2026-10-19. The user selected their current Roboflow projects as the canonical annotation source and authorized a separate local preparation that preserves the original work. This supersedes the earlier guide-based global training hold for this bounded preparation. The historical guide, original exports, and Roboflow records remain unchanged. No training, GPU execution, environment upgrade, remote editing, export generation, or paid compute was performed.

## What is accepted

Use one `pig` class per view and reconcile each **source class's named keypoint order before collapsing classes**. The checked-in [mapping policy](../../training/config/roboflow-pose-v1.json) contains all 16 top and 13 exported side classes, exact current source names, explicit spelling aliases, output-to-input permutations, reviewed local image/label hashes, and exclusions. Additional current Roboflow class `31_side` is absent from the source export and is not introduced.

Top canonical order, taken from Roboflow's shared T sequence: `snout-tip, left-ear-base, right-ear-base, left-shoulder, right-shoulder, left-chest, right-chest, left-hip, right-hip, tail-base, spine-midpoint`.

Side canonical order, retaining Roboflow's named meanings: `snout-tip, eye, ear-tip, withers, mid-point-peak, loin, tail-base, front-shoulder-joint, front-hoof, rear-hip-joint, rear-hoof, sternum, belly-lowest-part`. The `Rear_Hip-attach-to-ground-` source name denotes the rear ground-contact point in reviewed overlays and is normalized to `rear-hoof`; it is distinct from `Rear_Hip-Joint`.

Aliases normalize only the spellings explicitly listed in the policy, including ear `based/base`, `soulder/shoulder`, `midpoint-spint`, `snipe-midpoint`, punctuation/descriptive suffixes, and `tail-based/base`. **`tail-tip` and `tail` are not aliases for `tail-base`.** For `20-TOP` and `29-TOP`, only canonical tail-base becomes `0 0 0` (unlabeled) in the prepared label. Each original tail triplet, source slot/name, and reason remains in the manifest. The other ten points remain usable. This retains 253 otherwise usable objects instead of excluding two weight classes. Tail-base still has supervision from the other fourteen top classes.

The three previously identified augmented `IMG_6455` top training images have source point 7 y = `-0.0041097966`. Their exact source label hashes are listed as exclusions. They are recorded in the manifest, including original tokens, weight class, and reason, but their images/labels are omitted from the prepared training tree. No coordinate is clamped. Unknown negative coordinates, classes, incomplete/duplicate permutations, unknown aliases, changed reviewed evidence, orphan files, and exact image duplicates across splits cause rejection before creating output.

## Evidence and confidence

The [prior Roboflow audit](roboflow-schema-audit.md) records current named sequences for all classes and exact original/export correspondence for side `16_side`, `18_side`, and `38_side`. This preparation additionally reviewed **two local indexed overlays for each of the 29 exported classes**, covering head-left and head-right side examples and varied top orientations. Broad head, trunk, tail, front/rear leg placement supports the class-specific order. This is representative verification, not an exhaustive certification of every annotation.

Read-only Chrome inspection used browser `4`, profile `Anthony John`, existing Roboflow tab `1347450107`. It inspected these top Annotation Data views and reconfirmed the class-36 named skeleton dialog, dismissed with Cancel:

- [Top IMG_1817 / 16KG_Top](https://app.roboflow.com/maria-antonette-efren/pigweight_top-aizjl/images/UvM8x4Bhc2GZYorFr3c9): all 11 original points match local slots after `(x + 504) / 4032, y / 4032`, with maximum coordinate residual `1.1102230246251565e-16`.
- [Top IMG_6451 / 36-TOP](https://app.roboflow.com/maria-antonette-efren/pigweight_top-aizjl/images/5PGGQ2JIOdvuUfWttfms): the ten present original IDs `0..7,9,10` match corresponding local slots with the same maximum residual. Point ID 8 is absent from the current raw array but present in the local version named `prefill`; its original-to-export correspondence is **not** claimed. Preserve the existing local annotation rather than inventing a source point or shifting IDs 9/10 into slots 8/9. The current class dialog still has eleven names in exactly the audited sequence.

These checks support a practical conversion under the user's canonical-source decision. They do not prove a general array-position exporter rule: side class 16 has noncontiguous original IDs, while top class 36 has a missing current raw point. The tool applies reviewed local slot permutations; it never derives them by sorting IDs, compacting missing IDs, or imposing the historical guide.

Some named ventral torso placements may be noisy, and class-36 top left/right labels appear different under an anatomical viewing convention. The source name/slot association is retained exactly; preparation does not silently correct anatomy from an image interpretation. Those are annotation-quality issues for later validation, not a reason to discard the entire annotation effort or block all pose training. Flip semantics remain uncertified, so both training flips stay disabled.

## Coverage

| View | Retained images train / valid / test | Retained objects train / valid / test | Excluded | Masked points train / valid / test |
|---|---|---|---|---|
| Top | 2100 / 147 / 150 | 2106 / 147 / 151 | 3 train images and objects | 222 / 16 / 15 tail-base targets |
| Side | 1764 / 124 / 127 | 1764 / 124 / 127 | None | 0 / 0 / 0 |

All original splits and filenames are preserved; no cross-view pairing is invented. All retained and excluded objects keep their original weight class and numeric scale-weight string in `manifest.json`. The source datasets remain unpaired. Pose training does not require paired weight calibration; subsequent paired-photo weight estimation and marker geometry still require separate empirical evidence and held-out validation.

## Tools and commands

The standard-library [preparer](../../training/prepare_pose.py) defaults to a read-only dry run. It completes validation before creating a **new** output directory and refuses existing outputs or source overlap. Images are independent byte copies, never hardlinks. A trainer can later repair prepared JPEGs or write caches without changing originals. Partial failures lack `PREPARATION_COMPLETE` and fail validation; choose a fresh output name after any failure. The [validator](../../training/validate_prepared.py) rechecks source hashes, exact target triplets and masks, original weight/split records, images, independent file identity, complete YAML metadata, and unexpected/missing files. Validate before training, since trainers normally add cache files afterward.

Run from `D:/pigweigh-web` in PowerShell:

```powershell
& 'C:/Python314/python.exe' -B -m unittest discover -s training -p test_prepare_pose.py -v
& 'C:/Python314/python.exe' -B training/prepare_pose.py --source 'D:/pigweigh-pose-data/top-view' --output 'D:/pigweigh-pose-prepared-roboflow-v1/top-view' --view top
& 'C:/Python314/python.exe' -B training/prepare_pose.py --source 'D:/pigweigh-pose-data/side-view' --output 'D:/pigweigh-pose-prepared-roboflow-v1/side-view' --view side
```

For the first preparation only, add `--write` to each prepare command. Existing prepared directories are intentionally refused; these commands do not overwrite or resume a prior output. Verify an existing prepared copy:

```powershell
& 'C:/Python314/python.exe' -B training/validate_prepared.py 'D:/pigweigh-pose-prepared-roboflow-v1/top-view'
& 'C:/Python314/python.exe' -B training/validate_prepared.py 'D:/pigweigh-pose-prepared-roboflow-v1/side-view'
```

User-run training, sequentially after preparation validation:

```powershell
& 'C:/Python314/Scripts/yolo.exe' pose train model=yolo26s-pose.pt data='D:/pigweigh-pose-prepared-roboflow-v1/top-view/data.yaml' epochs=200 patience=40 imgsz=640 batch=16 device=0 workers=4 cache=ram amp=True fliplr=0.0 flipud=0.0 project='D:/pigweigh-pose-runs' name=top-roboflow-canonical-v1
& 'C:/Python314/Scripts/yolo.exe' pose train model=yolo26s-pose.pt data='D:/pigweigh-pose-prepared-roboflow-v1/side-view/data.yaml' epochs=200 patience=40 imgsz=640 batch=16 device=0 workers=4 cache=ram amp=True fliplr=0.0 flipud=0.0 project='D:/pigweigh-pose-runs' name=side-roboflow-canonical-v1
```

The prepared YAML already defines class 0 as `pig`; `single_cls=True` is unnecessary. Batch 16 is a starting choice, not a memory/performance benchmark. Reduce to 8 for OOM, use workers 0 for loader problems or cache False for RAM pressure. Preserve the audited global Python/Ultralytics/Torch environment. Model weights may download on the user's first run. No training command above was invoked during preparation.

## Verification record

Eleven native Python tests pass: exact permutation and numeric strings/visibility, explicit masks and original triplets, source byte preservation and independent copies, metadata/label tampering, hardlink rejection, duplicate JSON keys, invalid coordinates/classes/visibility, unknown/unverified/incomplete/duplicate mappings, exclusions, changed evidence, orphans, dry-run behavior, and overwrite/source-overlap rejection. Full-dataset dry checks pass at the coverage above. Independent review corrected full-YAML validation and added source-hardlink rejection before any prepared output was created.

Actual preparation completed at `D:/pigweigh-pose-prepared-roboflow-v1/top-view` and `D:/pigweigh-pose-prepared-roboflow-v1/side-view`, at the coverage above. Independent manifest validation passed for both trees, comparing every original image/label hash and exact target transform. Original source files remain unchanged, including the three excluded labels. Manifests retain all 4,422 original objects (2,407 top including exclusions; 2,015 side).

The existing Ultralytics **8.4.9** `check_det_dataset` and `YOLODataset(task="pose")` accepted all **4,412 prepared images and 4,419 objects** across both views and all three splits, with zero corrupt/background images and the expected one `pig` class and `[11,3]` / `[13,3]` keypoint arrays. No model was loaded and no CUDA APIs or training were invoked. The [CPU loader check](../../training/check_installed_loader.py) suppresses font downloads and cache-file persistence while retaining the native in-memory cache-version metadata. Source/target manifest validation passed again afterward; no image repair or prepared/source byte changes occurred.

Reproduce the installed-loader verification with the preserved global environment:

```powershell
& 'C:/Python314/python.exe' -B training/check_installed_loader.py 'D:/pigweigh-pose-prepared-roboflow-v1/top-view'
& 'C:/Python314/python.exe' -B training/check_installed_loader.py 'D:/pigweigh-pose-prepared-roboflow-v1/side-view'
```

These checks establish software/data compatibility, not landmark accuracy, weight accuracy, GPU kernel support, pig/session split independence, or a calibrated physical measurement. Pose training can proceed on the prepared copies without reannotating the original projects. The remaining tail-name ambiguity and annotation noise are explicit limits for evaluation; calibrated weight inference remains separate work.
