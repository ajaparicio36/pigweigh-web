---
status: accepted
---

# Serve a versioned CPU ONNX bundle

On 2026-10-23 the completed user-trained top/side pose checkpoints were exported to a private ONNX bundle for the existing FastAPI/uv Python 3.13 service. Use CPU ONNX Runtime, NumPy and one headless OpenCV provider rather than importing the global training environment into the API. Export/parity runs use the separate `D:/pigweigh-export-env`; original checkpoints/images and global training packages remain unchanged.

Schema 1 binds `attached-marker-ellipse-11900-v1`, divisor 11900, named landmark order, model hashes and fixed input/output layouts. The settled marker is `DICT_4X4_50`, ID 0, black-square side 100 mm (10 cm), excluding the white margin. Each photo gets its own marker-plane homography. The attached marker reduces local offset; its configured size and detection do not certify print scale, whole-body coplanarity or kilogram accuracy.

`PIGWEIGH_MODEL_BUNDLE` selects a manifest at API startup; absent/invalid bundles leave inference unavailable while core service health remains separate. No automatic model download or class-label weight fallback occurs. One CPU estimate runs per API process; a concurrent estimate gets 429. Snapshot the current price only after computation, using Decimal valuation of the rounded weight actually returned.

Later delivery decision, 2026-10-23: the user explicitly approved including the serving bundle in ordinary Git, without LFS. Copy only the verified `manifest.json`, `top.onnx` and `side.onnx` into `server/models/v1`; the two ONNX files are each under 41 MB. Source `.pt` checkpoints, photos, training data, private export intermediates and credentials remain excluded. This supersedes external-mount-only delivery: local startup uses `models/v1/manifest.json` from `server/`, and the backend image copies `models` into `/app/models` with `PIGWEIGH_MODEL_BUNDLE=/app/models/v1/manifest.json`. Export preparation can still occur outside the repo, followed by verified release copies.

The measurement contract is documented in [the inference runbook](../inference.md). Numerical estimates remain explicitly experimental with `accuracy_evaluated:false`; neither versioning nor export parity validates physical weight. Railway remains staged with no deployment; the packaging decision authorizes model delivery preparation, not applying cloud changes. Fresh Chrome QA is approved and follows packaging; no fresh graphical result is claimed here.
