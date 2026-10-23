# CPU ONNX serving bundle

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

Manifest schema 1 binds method `attached-marker-ellipse-11900-v1`, divisor 11900, marker `DICT_4X4_50` / ID 0 / black-square side 100 mm, and per-view relative model path, SHA256, canonical named keypoints, input/output layout and original-checkpoint SHA256. The stable `bundle_id` is the method prefix plus the first sixteen SHA256 hex characters of canonical JSON containing schema version, method, divisor, marker and complete model entries; it identifies actual weights/configuration rather than a folder name. Export flags and mock-image parity evidence are retained. Source copies and intermediate ONNX files remain in the private `source-copies/` directory for provenance; serving loads only `top.onnx` and `side.onnx` declared in the manifest.

Fixed export: CPU, opset 17, float32, batch 1, 640 square, `dynamic=False`, `half=False`, `simplify=False`, `nms=False`, `end2end=True`. Input is RGB NCHW normalized by 255 with centered letterbox fill 114. Resize with OpenCV linear interpolation; use `round(dw±0.1)` / `round(dh±0.1)` for padding and retain scale/padding for inverse coordinates. Output is end-to-end `[1,300,39]` top / `[1,300,45]` side: `xyxy, class_score, class_id, flattened (x,y,visibility)` in input pixels. Keypoint visibility is already sigmoid; do not apply sigmoid again, transpose into a YOLOv8 raw layout, or add NMS. Metadata class/point names, dimensions, task and end-to-end mode must all agree.

Actual ONNX checker and CPU Runtime metadata/shape validation passed. On each matching mock image, exactly one score≥0.5 pig matched PyTorch; the maximum selected-output absolute difference was `4.57763671875e-05` at 640 input coordinates for each view. Comparison uses `rtol=1e-4, atol=0.05`. The export emitted a generic advanced-indexing warning about negative indices; this end-to-end model gathers nonnegative top-k indices, and actual parity passed. Original image/checkpoint SHA256 values were unchanged afterward. Global ONNX remained absent and global training package versions remained unchanged.

These are functional/export-equivalence checks on two mock images, not annotation, metric-measurement or weight-accuracy validation. No training or GPU prediction was invoked.

Standard-library contract tests need no model, Torch import or GPU:

```powershell
& 'C:/Python314/python.exe' -B -m unittest discover -s training -p test_export_bundle.py -v
```
