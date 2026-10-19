# Pose dataset audit and user-run training

> **Current update, 2026-10-19:** The user selected Roboflow as canonical and authorized separate reversible preparation. Reviewed, validated copies now exist at `D:/pigweigh-pose-prepared-roboflow-v1/{top-view,side-view}`. Pose training may proceed on **those prepared copies** using the commands in [pose preparation](pose-preparation.md): 2,397 top images and 2,015 side images, one `pig` class per view, explicit per-class permutations, 253 ambiguous tail targets masked and three known negative-coordinate top images excluded. All originals and scale-weight provenance are preserved. Eleven preservation tests and the installed Ultralytics 8.4.9 CPU loader checks passed across all splits. No training or GPU execution occurred. The historical source-export hold and conditional source commands below remain evidence of the earlier audit; they are not a current global hold on the reviewed prepared copies. Pose readiness does not establish calibrated weight inference.

Format audit completed 2026-10-19. **Training recommendation ON HOLD pending reviewed canonical mapping and anatomical validation.** The [Roboflow audit](roboflow-schema-audit.md) found differing current per-class skeleton sequences and exact source-array-to-export positional correspondence in three side samples. The local export is not proven faulty; a universal guide-index interpretation is unsafe. Current metadata is not a certified frozen version-1 schema, and anatomical placement has not been exhaustively audited. Three candidate permutations remain unapplied. Dataset inspection performed no training, CUDA-kernel benchmark, annotation mutation, training-environment upgrade, or training dependency installation. The user runs training. Pose checkpoints alone do not establish physical measurements or live-weight calibration.

## Dataset findings

| Dataset under `D:/pigweigh-pose-data/` | Images (train / valid / test) | Objects (train / valid / test) | Source classes | Keypoints | Label columns |
|---|---|---|---|---|---|
| `top-view/` | 2400 (2103 / 147 / 150) | 2407 (2109 / 147 / 151) | 16 | `[11,3]` | 38 |
| `side-view/` | 2015 (1764 / 124 / 127) | 2015 (1764 / 124 / 127) | 13 | `[13,3]` | 44 |

No malformed class/visibility/box labels, missing/orphan files, exact SHA256 cross-split duplicates, or source-basename cross-split duplicates were found. These checks do not resolve pig/session leakage; confirm animal/session identities before interpreting held-out metrics.

Interview update: the user confirms these source classes are the pigs' actual scale weights. Top-view and side-view pigs may differ; the datasets are not paired. Preserve each source class/weight association and image provenance outside the collapsed pose target. These labels are useful per-view supervision/provenance, not independently validated same-pig paired records for calibration or fusion. Runtime capture pairs still mean two views of the same pig.

Three augmented top-view training labels derived from `IMG_6455` contain keypoint 7 with y = `-0.0041097966`, visibility 1. The installed parser tolerates coordinates down to -0.01, but these annotations need review; do not silently clamp them.

Affected files under `D:/pigweigh-pose-data/top-view/train/labels/`:

- `IMG_6455_jpeg_jpeg.rf.7a90838496716f8f07b8c3e86e1dc131.txt`
- `IMG_6455_jpeg_jpeg.rf.917715f283035b6c620fe3225a741f27.txt`
- `IMG_6455_jpeg_jpeg.rf.db3b6730c7be75d9f7a621b39fff0228.txt`

Neither YAML provides `kpt_names` or skeleton metadata. Point counts do not establish anatomy. Top `flip_idx` is `[0,7,6,5,4,3,2,1,8,10,9]`; its mapping is visually suspicious, and side's identity mapping is also uncertified. Disable flips until semantics are confirmed.

Disabling flips leaves existing per-class slot meanings unchanged. `single_cls=True` merges class targets but does not reconcile anatomical point order; merging different per-class meanings into one supervision schema would be unsafe. Verify one consistent per-view schema across classes and orientations before training. Preserve original files and weight metadata; any conversion belongs in a separately reviewed prepared dataset.

### Guide/export conflicts: sampled evidence

The user-supplied guide `D:/pigweigh-web/docs/conversations/landmarks.md` declares side index 10 rear hoof at line 43, index 12 belly at line 45, and indices 7/8 front leg at lines 40–41. Observations below are from visual inspection of the images with their corresponding label points; coordinates are normalized `(x,y)`.

| Side-view validation basename | Observed points | Implication |
|---|---|---|
| `IMG_1556_jpeg_jpeg.rf.d047d6b9ad83361b6625d09854088f01` | kp10 `(0.358,0.518)` ventral torso; kp12 `(0.317,0.682)` rear hoof; kp11 `(0.275,0.457)` rear hip | Conflicts with declared 10/12 anatomy. |
| `IMG_1865_jpeg_jpeg.rf.97d43a9fdb58370efdf5800d70777a2e` (class 0) | kp10 `(0.281,0.684)` rear hoof; kp12 `(0.479,0.615)` ventral torso | Refutes a universal 9–12 reordering inferred from the preceding sample. |
| `IMG_3517_jpeg_jpeg.rf.9f6c474b80cd5106bb6072e8c6917f30` (class 12; head left) | kp7/8 lie on the rear leg | Conflicts with declared front-leg meaning; orientation/class-specific semantics require investigation. |

Exact image paths are `D:/pigweigh-pose-data/side-view/valid/images/<basename>.jpg`; corresponding labels are `D:/pigweigh-pose-data/side-view/valid/labels/<basename>.txt`. These samples establish a guide/export conflict, not the correct replacement mapping for every class or orientation.

The guide's top flip mapping at line 23 is `[0,2,1,4,3,6,5,8,7,9,10]`, whereas `D:/pigweigh-pose-data/top-view/data.yaml` supplies `[0,7,6,5,4,3,2,1,8,10,9]`. Current Roboflow dialogs expose different sequences across top classes; neither one universal flip mapping nor one universal guide order is certified for the frozen export. Preserve weight provenance and verify per-class IDs/names, coordinate correspondence, and actual anatomy before deriving canonical flip semantics. No automatic remapping or annotation edits have been performed.

Initial unauthenticated Roboflow requests returned HTTP 403. The subsequently authorized plugin/browser audit accessed both projects and read all 16 current top and 14 current side class sequences; current `31_side` is absent from the local version-1 YAML's 13 side classes. Current dialogs do not certify frozen named skeletons. Original raw point arrays for `IMG_1556` (`18_side`), `IMG_1865` (`16_side`), and `IMG_3517` (`38_side`) match every local exported coordinate after the 4032x3024-to-640x640 letterbox transform, with maximum normalized residual `1.1102230246251565e-16` per sample. `16_side` source IDs are noncontiguous; local slots follow array position, not those original numeric IDs. This bounds the discrepancy without proving the export or every original anatomical label wrong.

The [audit's proposed conversion table](roboflow-schema-audit.md) covers only those three side examples. Remaining work is frozen named ID/schema confirmation across classes, top coordinate crosschecks, and visual validation of anatomical placement and both orientations. Review ambiguous aliases such as `tail-tip` versus `tail-base` rather than treating them as equivalent automatically. Preserve `D:/pigweigh-web/docs/conversations/landmarks.md` unchanged; no candidate permutation has been applied.

## Existing training environment

Global tools: `C:/Python314/python.exe` (Python 3.14.2), `C:/Python314/Scripts/yolo.exe`; Ultralytics 8.4.9; Torch 2.10.0+cu128; TorchVision 0.25.0+cu128. Torch is not marked nightly/dev. Reported GPU: RTX 5060 Ti, 16311 MiB, capability 12.0 (`sm_120`), driver 617.42. Preserve this environment; inventory does not prove that a training kernel has run successfully.

The backend's uv Python 3.13.12 environment is separate from these global training tools; ongoing backend implementation does not change this audited training-environment inventory.

## Conditional commands — do not run while training is on hold

These commands are statically compatible with the installed tool and existing YAMLs, but are not a current training recommendation. Use them only after consistent anatomical ordering across classes/orientations has been confirmed or reconciled through an agreed, reviewed process. Then run sequentially in PowerShell. `single_cls=True` collapses weight-derived source classes for pose training; the installed loader names class 0 `item`. Record its semantic meaning as pig in the serving artifact manifest rather than requiring an unprepared class-name rewrite.

```powershell
& 'C:\Python314\Scripts\yolo.exe' pose train model=yolo26s-pose.pt data='D:\pigweigh-pose-data\top-view\data.yaml' single_cls=True epochs=200 patience=40 imgsz=640 batch=16 device=0 workers=4 cache=ram amp=True fliplr=0.0 flipud=0.0 project='D:\pigweigh-pose-runs' name=top-yolo26s-pose-v1
```

After the top run finishes:

```powershell
& 'C:\Python314\Scripts\yolo.exe' pose train model=yolo26s-pose.pt data='D:\pigweigh-pose-data\side-view\data.yaml' single_cls=True epochs=200 patience=40 imgsz=640 batch=16 device=0 workers=4 cache=ram amp=True fliplr=0.0 flipud=0.0 project='D:\pigweigh-pose-runs' name=side-yolo26s-pose-v1
```

Batch 16 is a conservative initial proposal, not a benchmark result. For out-of-memory use `batch=8`; for loader problems use `workers=0`; for RAM pressure use `cache=False`. The user may benchmark batch 32 or AutoBatch later. Training can download weights and create cache/output files; inspection did not modify original datasets. A prepared copy with a permanent class-0 `pig` name is optional later, not a prerequisite for these commands.

All command flags and the existing YAML resolution were checked statically against installed Ultralytics 8.4.9. Relevant source under `C:/Python314/Lib/site-packages/ultralytics/`: `engine/trainer.py:665–668` sets single-class metadata, `data/base.py:207–208` collapses class IDs in memory, `models/yolo/pose/train.py:75,86–90` reads keypoint shape and supplies numeric-name fallback, and `data/utils.py:434–446` handles relative path resolution. There was no existing dataset cache. A future training run normally writes label caches even with `cache=False` for image caching and may repair malformed JPEGs; these commands have not been executed.

Preserve each run's arguments, checkpoint/version, per-view point count/order, original class-to-scale-weight mapping, and image/split provenance. `single_cls=True` is for pose targets, not permission to discard weight metadata or manufacture cross-view animal pairs. Evaluate pose performance separately from subsequent handheld empirical calibration and held-out weight validation.

## Primary references

- [Ultralytics YOLO26](https://docs.ultralytics.com/models/yolo26/)
- [Pose task](https://docs.ultralytics.com/tasks/pose/)
- [Training settings](https://docs.ultralytics.com/modes/train/)
- [Pose dataset format](https://docs.ultralytics.com/datasets/pose/)
- [PyTorch 2.7 release: Blackwell support context](https://pytorch.org/blog/pytorch-2-7/) — environment inventory above is the evidence for the installed versions; this release note is not proof of this machine's runtime execution.
