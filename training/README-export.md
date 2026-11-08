# CPU ONNX serving bundle

## Side-only canonical v3 candidate (2026-11-08)

The repository candidate replaces only the side model with the user's newly trained, single-class checkpoint. The top ONNX stays byte-for-byte unchanged. The bundle ID is `attached-marker-ellipse-14451-v1-845afb1a5f873783`, the side SHA-256 is `558c18e39b796ca7e0f0d7de591464cf668f44a3422c8dfc7c92b2c86ca789e4`, and the top SHA-256 is `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa`. This local export does not itself establish a deployed release.

The checkpoint SHA-256 is `000dab3f05dccaa41e50de5e6b4f088318d99fb48f7571e7e5d0b39735420e91`. Its own metadata and the prepared dataset YAML both specify one `pig` class, 13 points and the canonical side order; the checkpoint's recorded training YAML points to that dataset. The dataset manifest, YAML and preparation policy hashes are bound into the side manifest entry and bundle ID. Preparation's class-specific source-label mappings were applied **before training**; no v2 serving adapter or class-based landmark permutation is attached to this model. The prepared dataset and policy record ordering evidence, not anatomical correctness of all annotations.

`export_side_canonical.py` checks the expected source and prepared-manifest hashes, policy agreement, source dataset records and unchanged top bytes. It copies the checkpoint into a fresh private directory, disables automatic installation, and exports CPU-only. The ONNX checker and CPU Runtime passed the fixed float32 `[1,3,640,640]` input, end-to-end `[1,300,45]` output, opset 17, single-class and named-point metadata checks. Original checkpoint, dataset metadata, policy, selected sample bytes, fixture, existing manifest and top model remained unchanged.

Selected detections matched PyTorch on the generated side fixture and one prepared validation image from each of the 13 original source classes (`rtol=1e-4`, `atol=0.05`; maximum absolute difference `0.000091552734375`). The generated fixture and 12 of the 13 validation samples had one qualifying row and passed the existing side pose gate. One `35_side` validation sample produced two qualifying rows and was rejected as `pig_count`; neither rows nor thresholds were altered. These samples do not establish a rejection rate or weight accuracy. The private evidence at `D:/pigweigh-inference-artifacts/side-v3-canonical-20261108/parity-private.json` contains individual sample hashes and gate results.

The unchanged top model and new side model both passed the generated-photo validation endpoints. An actual `POST /api/estimates` TestClient check using both models, marker detection, projection and the 14451 formula returned `58.06` kg, length `96.44` cm, width `30.62` cm, depth `28.75` cm and girth `93.28` cm. Unrounded projected values reproduced the formula; an absent price was stubbed, and a blank top image returned `422 marker_missing`. This is a functional generated-fixture result, not a pig measurement or database/price proof. The full private result is `D:/pigweigh-inference-artifacts/side-v3-canonical-20261108/fixture-proof-private.json`.

Reproduce only with a **new** private output directory and the verified source inputs; existing outputs are never overwritten:

```powershell
& 'D:/pigweigh-export-env/Scripts/python.exe' -B training/export_side_canonical.py `
  --output 'D:/pigweigh-inference-artifacts/<new-private-directory>' `
  --source 'D:/pigweigh-pose-runs/side-roboflow-canonical-v32/weights/best.pt' `
  --dataset 'D:/pigweigh-pose-prepared-roboflow-v3/side-view' `
  --policy 'training/config/roboflow-side-v3.json' `
  --existing-manifest 'server/models/v1/manifest.json' `
  --fixture 'D:/pigweigh-pose-data/test/Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg' `
  --expected-source-sha256 '000dab3f05dccaa41e50de5e6b4f088318d99fb48f7571e7e5d0b39735420e91' `
  --expected-dataset-manifest-sha256 '593d8c6881ada950aabaa89544264f1eb8ea9592114a6ea5c2d7310fe8de1609'
```

The first export used the same policy bytes from `D:/pigweigh-web/training/config/roboflow-side-v3.json`. The checkpoint, private dataset/manifest, photos and `source-copies/` remain outside Git; only the three approved serving files may be packaged. No training, GPU operation, package upgrade or download occurred during this export.

## Side-only v2 candidate (2026-11-06)

The earlier local candidate replaced only `side.onnx`; `top.onnx` was copied unchanged from the existing bundle. Its ID was `attached-marker-ellipse-14451-v1-35164d7e48c146d1`, with side SHA-256 `948c2c9d9849d84003a69f43f91cb1aa483d5afdd7752781acd24dc10fc0640f` and top SHA-256 `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa`. It was superseded locally by the v3 candidate above. The earlier November 3 release remains historical deployment evidence.

`export_side_adapter.py` validates the trusted checkpoint, source YAML/README and existing top hashes, copies the checkpoint into a fresh private directory, and exports a CPU ONNX source model with auto-install disabled. It appends an ONNX graph that chooses a canonical point permutation from the source prediction's class. It preserves row order, bounding boxes, scores and point values; it emits class 0 for valid source classes and a non-finite class sentinel for invalid IDs so the existing capture gate rejects them. It does not apply NMS, combine scores, deduplicate rows, infer weight from class, or relax the exactly-one threshold. The manifest binds the mapping, source checkpoint, dataset metadata and reviewed source policy hashes into the bundle ID. Mapping and policy hashes use sorted compact JSON with ASCII-escaped UTF-8, independent of line endings; checkpoint and dataset YAML/README hashes cover the exact private source bytes. The source classes and permutations are in `training/config/side-adapter-v2.json`.

The checkpoint was trained with 13 weight-class labels and one shared keypoint head, not the previous prepared single-class dataset. Current named Roboflow class templates, matched v1/v2 coordinate lineage for 839 source images and a frozen v2 class-34 raw annotation support the mapping. Frozen v2 names were not exhaustively proved. A wrong predicted class can select a wrong point order; the preserved source score is a weight-class score, not pig certainty or weight accuracy. Multiple high-scoring source class rows remain multiple rows and are rejected by the existing gate.

The private candidate was made in `D:/pigweigh-inference-artifacts/side-adapter-v2-canonical-20261106`; its `source-copies/` and `parity-private.json` are not serving artifacts and stay out of Git. Reproduce only with a new output directory, the same audited source inputs, the isolated export environment, and an existing verified manifest:

```powershell
& 'D:/pigweigh-export-env/Scripts/python.exe' -B training/export_side_adapter.py `
  --output 'D:/pigweigh-inference-artifacts/<new-private-directory>' `
  --source 'D:/pigweigh-pose-runs/side-roboflow-canonical-v2/weights/best.pt' `
  --dataset 'D:/pigweigh-pose-data/side-view-v2' `
  --existing-manifest 'server/models/v1/manifest.json'
```

The raw model and wrapped model passed ONNX checker, CPU metadata/shape checks and the unchanged backend loader warmup. On one validation image per source class, all 13 selected exactly one row at score ≥0.5, predicted the same class as the label, and passed the existing side pose gate. These image-level checks do not establish marker/capture validity or accuracy. Selected-row raw PyTorch/ONNX parity had maximum absolute difference `0.0001068115234375` (`rtol=1e-4`, `atol=0.05`); all 300 wrapped rows matched the NumPy remapping oracle exactly for each sample. Full raw 300-row arrays were not elementwise equal because low-score top-k ordering/class rows differed; no full-output parity is claimed. The detailed private report stores source image/label hashes and individual results without adding the images to Git.

| Known source class | Predicted source class | Rows ≥0.5 | Side pose gate |
|---|---|---:|---|
| `16_side` | `16_side` | 1 | passed |
| `17_side` | `17_side` | 1 | passed |
| `18_side` | `18_side` | 1 | passed |
| `19_side` | `19_side` | 1 | passed |
| `20_side` | `20_side` | 1 | passed |
| `23_side` | `23_side` | 1 | passed |
| `27_side` | `27_side` | 1 | passed |
| `28_side` | `28_side` | 1 | passed |
| `29_side` | `29_side` | 1 | passed |
| `34_side` | `34_side` | 1 | passed |
| `35_side` | `35_side` | 1 | passed |
| `36_side` | `36_side` | 1 | passed |
| `38_side` | `38_side` | 1 | passed |

The two generated-photo validation endpoints also passed against this candidate as part of 46 focused photo-validation tests. A separate `POST /api/estimates` TestClient check on the same hash-verified generated pair used actual models, marker detection, projection and formula but stubbed the price read as absent. It returned `56.27` kg with length `96.44` cm, width `30.62` cm, depth `27.81` cm and girth `91.83` cm; the unrounded projected values reproduced the 14451 formula. A blank top image returned `422 marker_missing`. This is a functional fixture result, not an animal measurement or database/price integration proof. Original checkpoint, dataset YAML/README, selected sample files, existing manifest and original top model hashes were checked before and after export; the private and worktree top hashes match the approved bytes. These are software/fixture checks, not physical-scale, same-pig, landmark-placement or weight-accuracy validation.

```powershell
& 'D:/pigweigh-export-env/Scripts/python.exe' -B -m unittest discover -s training -p test_side_adapter.py -v
```

## Earlier two-checkpoint export

The original private export and October parity evidence below used the 11900 method. The manifest was subsequently revised to the 14451 baseline without changing those original ONNX model bytes. This section describes the historical two-checkpoint exporter.

`export_bundle.py` exports the user's trusted local top/side pose checkpoints into a new private directory outside this repository. It copies checkpoints before exporting, preserves originals, disables Ultralytics auto-installation through process-local `YOLO_AUTOINSTALL=false`, and runs CPU only with bounded threads. It refuses existing output directories and publishes `manifest.json` only after both models pass validation, mock-image parity, and original-file hash checks. A partial output without a manifest is not a serving bundle; use a new directory name after fixing an export failure.

The export environment is separate from both backend and global training environments. Actual setup used:

```powershell
uv venv --python C:/Python314/python.exe --system-site-packages D:/pigweigh-export-env
uv pip install --python D:/pigweigh-export-env/Scripts/python.exe 'onnx==1.23.2'
```

The new environment inherits existing Torch/Ultralytics read-only. ONNX and its dependencies install only in that environment; no global package is upgraded. Actual inherited versions: Ultralytics 8.4.9, Torch 2.10.0+cu128, ONNX Runtime 1.24.4 and OpenCV 4.13.0.90. Required local dependencies include NumPy, protobuf, typing-extensions and ml-dtypes; the ONNX installer resolves them. Serving uses the backend's independent CPU ONNX Runtime and sole headless OpenCV provider; the CUDA-enabled inherited Torch package is used only with `device='cpu'` during export/parity.

Actual successful command, run from `D:/pigweigh-web`:

```powershell
& 'D:/pigweigh-export-env/Scripts/python.exe' -B training/export_bundle.py `
  --output 'D:/pigweigh-inference-artifacts/v1' `
  --top 'D:/pigweigh-pose-runs/top-roboflow-canonical-v1/weights/best.pt' `
  --side 'D:/pigweigh-pose-runs/side-roboflow-canonical-v1/weights/best.pt' `
  --top-image 'D:/pigweigh-pose-data/test/Gemini_Generated_Image_wfs237wfs237wfs2.jpg' `
  --side-image 'D:/pigweigh-pose-data/test/Gemini_Generated_Image_mcndf9mcndf9mcnd.jpg'
```

That directory already exists and will be refused on a repeat. Choose a fresh output such as `D:/pigweigh-inference-artifacts/v2` for a later export. Do not delete or overwrite an existing working bundle to rerun the tool. Runtime `PIGWEIGH_MODEL_BUNDLE` points to a manifest, not a model directory. Later explicit user approval permits ordinary Git (no LFS) for only the verified release copies `server/models/v1/manifest.json`, `top.onnx` and `side.onnx`. Copy these three files after export/hash verification; keep the private output, `source-copies/`, `.pt` checkpoints, test images and other intermediates excluded. Local serving from `server/` uses `models/v1/manifest.json`; the image uses `/app/models/v1/manifest.json`. See [delivery decision/runbook](../docs/inference.md).

Manifest schema 1 binds method `attached-marker-ellipse-14451-v1`, divisor 14451, marker `DICT_4X4_50` / ID 0 / black-square side 100 mm, and per-view relative model path, SHA256, canonical named keypoints, input/output layout and original-checkpoint SHA256. The stable `bundle_id` is the method prefix plus the first sixteen SHA256 hex characters of canonical JSON containing schema version, method, divisor, marker and complete model entries; it identifies actual weights/configuration rather than a folder name. Export flags and mock-image parity evidence are retained. Source copies and intermediate ONNX files remain in the private `source-copies/` directory for provenance; serving loads only `top.onnx` and `side.onnx` declared in the manifest.

Fixed export: CPU, opset 17, float32, batch 1, 640 square, `dynamic=False`, `half=False`, `simplify=False`, `nms=False`, `end2end=True`. Input is RGB NCHW normalized by 255 with centered letterbox fill 114. Resize with OpenCV linear interpolation; use `round(dw±0.1)` / `round(dh±0.1)` for padding and retain scale/padding for inverse coordinates. Output is end-to-end `[1,300,39]` top / `[1,300,45]` side: `xyxy, class_score, class_id, flattened (x,y,visibility)` in input pixels. Keypoint visibility is already sigmoid; do not apply sigmoid again, transpose into a YOLOv8 raw layout, or add NMS. Metadata class/point names, dimensions, task and end-to-end mode must all agree.

Actual ONNX checker and CPU Runtime metadata/shape validation passed. On each matching mock image, exactly one score≥0.5 pig matched PyTorch; the maximum selected-output absolute difference was `4.57763671875e-05` at 640 input coordinates for each view. Comparison uses `rtol=1e-4, atol=0.05`. The export emitted a generic advanced-indexing warning about negative indices; this end-to-end model gathers nonnegative top-k indices, and actual parity passed. Original image/checkpoint SHA256 values were unchanged afterward. Global ONNX remained absent and global training package versions remained unchanged.

These are functional/export-equivalence checks on two mock images, not annotation, metric-measurement or weight-accuracy validation. No training or GPU prediction was invoked.

Standard-library contract tests need no model, Torch import or GPU:

```powershell
& 'C:/Python314/python.exe' -B -m unittest discover -s training -p test_export_bundle.py -v
```
