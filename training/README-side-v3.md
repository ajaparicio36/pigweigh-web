# Side-view v3 preparation and training

The prepared side dataset is `D:/pigweigh-pose-prepared-roboflow-v3/side-view`.
The original `D:/pigweigh-pose-data/side-view-v3` remains unchanged. Despite
the local folder name, its `data.yaml` identifies **version 2 of the Roboflow
workspace copy** `anthonys-workspace-sutmr/pigweight_side-znzvb-dcmau`.
Its README describes 640-pixel fit/black-edge resizing, auto-orientation and
five brightness/exposure variants. No remote operation was needed.

## Mapping and coverage

[The versioned policy](config/roboflow-side-v3.json) records the previously
reviewed named schema, exact class-specific output-to-input permutations and
26 fresh v3/v2 evidence pairs with image and label hashes. The preparer
enforces the v3 hashes; the v2 hashes document this audit. All 839 class/source basenames
are shared with local `side-view-v2`: their class and all 43 other label
tokens match exactly, including each of the 13 point triplets. Variants of
each source have identical labels. All 251 validation/test images also match
v2 byte-for-byte, with both splits covering every class. The prior v1 named
policy's 13 permutations agree exactly with the v2 adapter. An independent
reviewer inspected one indexed v3 overlay per class across both head directions
and all three order patterns; broad placement supported those permutations.
This establishes bounded ordering continuity, not correctness of every
annotation or physical accuracy. Some landmarks remain occluded or noisy.

Canonical side order is `snout-tip, eye, ear-tip, withers, mid-point-peak,
loin, tail-base, front-shoulder-joint, front-hoof, rear-hip-joint, rear-hoof,
sternum, belly-lowest-part`. In zero-based canonical-output to source-input
indices, the policy uses:

- `16_side`: `[0,1,2,3,6,4,5,7,8,9,10,11,12]`.
- `17_side`, `18_side`, `23_side`: `[0,1,2,3,4,5,6,7,8,11,12,10,9]`.
- `19_side`, `20_side`, `27_side`, `28_side`, `29_side`, `34_side`,
  `35_side`, `36_side`, `38_side`: `[0,1,2,3,4,5,6,11,12,7,8,9,10]`.

Each image has one object. The table counts source weight classes, which the
private manifest preserves even though every prepared class ID is 0 (`pig`).

| Source class | Train | Validation | Test |
|---|---:|---:|---:|
| 16_side | 170 | 7 | 7 |
| 17_side | 155 | 6 | 7 |
| 18_side | 215 | 9 | 9 |
| 19_side | 255 | 11 | 11 |
| 20_side | 175 | 8 | 7 |
| 23_side | 205 | 9 | 9 |
| 27_side | 270 | 11 | 12 |
| 28_side | 250 | 11 | 11 |
| 29_side | 250 | 10 | 11 |
| 34_side | 200 | 8 | 9 |
| 35_side | 305 | 13 | 13 |
| 36_side | 240 | 11 | 10 |
| 38_side | 250 | 10 | 11 |
| **Total** | **2,940** | **124** | **127** |

All 3,191 image/label pairs have 44 finite columns, valid class IDs, boxes and
13 in-bounds points. Box edges are also within the image. Visibility counts
are 1,210 at `1`, 40,273 at `2`, and none at `0`. No point was masked, no
image excluded and no coordinate clamped. Exact image hashes, full basenames,
and case-folded basenames after removing Roboflow suffixes and repeated image
extension suffixes had zero cross-split collisions. Those checks cannot rule
out visually similar images with different names, or pig/session leakage.

## Verification and commands

On 2026-11-08 the existing preparer's dry run passed before writing, and all
11 preparation unit tests passed. The written copy passed independent
`validate_prepared.py` validation and the installed Ultralytics 8.4.9 CPU
pose loader across all three splits: 3,191 images/objects, no corrupt or
background images. The loader helper validates source and target both before
and after, disables font downloads and cache-file persistence, and loaded no
model. The prepared YAML names one `pig` class and all 13 canonical points.
The manifest records source hashes, original weight labels, raw triplets,
splits and exact transforms; images are independent copies, not links.

All 6,384 source files, including metadata, matched the private pre-write hash
snapshot after loader verification. The SHA-256 of the concatenation of each
case-sensitive lexicographically sorted POSIX relative path, NUL, lowercase
file SHA-256, and newline is
`713dd4d97c168d332f19a885c736448254ee98eebaa09d0dc9b7b773c0abbacc`.
The private source snapshot and aggregate audit are in
`D:/pigweigh-pose-v3-audit`; the prepared manifest contains photo records and
must also remain outside Git. No training, GPU operation, package upgrade or
weight download was performed.

Recheck the existing output **before training** (trainer-created cache files
would cause the strict validator to reject a post-training tree):

```powershell
& 'C:/Python314/python.exe' -B training/validate_prepared.py 'D:/pigweigh-pose-prepared-roboflow-v3/side-view'
& 'C:/Python314/python.exe' -B training/check_installed_loader.py 'D:/pigweigh-pose-prepared-roboflow-v3/side-view'
```

To reproduce preparation, first choose a **new**, non-overlapping output
directory; the preparer rejects an existing destination. Run without `--write`
for the dry run, then repeat with `--write`:

```powershell
& 'C:/Python314/python.exe' -B training/prepare_pose.py --source 'D:/pigweigh-pose-data/side-view-v3' --output 'D:/pigweigh-pose-prepared-roboflow-v3/<new-directory>' --view side --config training/config/roboflow-side-v3.json
```

User-run training command, matching the latest side-v2 run's 100 epochs and
recorded augmentation settings. Both flips remain disabled because their
landmark semantics are not certified. The prepared YAML already has one class,
so `single_cls` is unnecessary. The named run directory did not exist when
checked. The model path points to an existing local `yolo26s-pose.pt`, avoiding
dependence on the current directory. The v2 args record only that basename,
so they do not independently establish the identity of the earlier model file.

```powershell
& 'C:/Python314/Scripts/yolo.exe' pose train model='C:/Windows/System32/yolo26s-pose.pt' data='D:/pigweigh-pose-prepared-roboflow-v3/side-view/data.yaml' epochs=100 patience=40 imgsz=640 batch=16 device=0 workers=4 cache=ram amp=True fliplr=0.0 flipud=0.0 project='D:/pigweigh-pose-runs' name=side-roboflow-canonical-v3 close_mosaic=10 hsv_h=0.015 hsv_s=0.7 hsv_v=0.4 degrees=0.0 translate=0.1 scale=0.5 shear=0.0 perspective=0.0 bgr=0.0 mosaic=1.0 mixup=0.0 cutmix=0.0 copy_paste=0.0 copy_paste_mode=flip auto_augment=randaugment erasing=0.4 multi_scale=0.0
```

Batch 16 is inherited from the prior run, not a new GPU memory or performance
measurement. Pose quality and weight-estimation accuracy remain unmeasured.
