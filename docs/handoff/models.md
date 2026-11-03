# Models and production inference

The repository contains the approved CPU serving export in `server/models/v1/`: `manifest.json`, `top.onnx` and `side.onnx`. They are the **only** model artifacts approved for ordinary Git, without LFS. Source `.pt` checkpoints, original photographs, datasets, credentials and export intermediates stay outside Git and deployment archives. See [export provenance](../../training/README-export.md) for the isolated export workflow.

The manifest identifies `attached-marker-ellipse-14451-v1-08661ffdf08ae1cc`, method `attached-marker-ellipse-14451-v1`, and divisor 14451. The [November 3 Railway release](../deployment.md#14451-api-and-web-release-2026-11-03) verified the deployed bundle hashes, readiness and generated-fixture inference. The earlier October release used the 11900 manifest; the ONNX binaries are unchanged by this formula-only revision.

## Loading and operation

The API reads `PIGWEIGH_MODEL_BUNDLE` once at process startup. From `server/`, the checked-in example is `models/v1/manifest.json`. The Dockerfile copies `models/` into the image and sets `/app/models/v1/manifest.json`; production does not fetch models from a public URL or load a developer's local `D:/...` path. A new manifest or model needs an API restart or new deployment. There is no hot reload.

CPU ONNX Runtime runs the two pose models. The server checks the manifest contract, paths, model hashes, input/output metadata and a finite warmup. Missing or invalid configuration keeps inference unavailable; it does not invent a weight or load an unrelated model. `/api/inference/readiness` reports the inference state separately from `/api/health`, which checks PostgreSQL. At most one photo check or estimate runs per API process; a competing request gets `429` and can be retried. This is a functional design limit, not a throughput guarantee.

Each view needs one complete, flat `DICT_4X4_50`, ID 0 card with a **100 mm black square** (white margin excluded), located near the measured back/flank region. Each image is processed using its own marker-plane homography and required landmarks. Projected top length and chest width plus side chest depth yield ellipse-estimated girth; the baseline is `G_cm² × L_cm / 14451`. These are 2D projected proxies, not a direct tape path or a 3D reconstruction. Correct identity, physical print size and placement are not automatically certified. Both capture checks and weight results remain experimental; scale-weight error is unevaluated. The thesis proposes a stand beside the pig, a different acquisition setup that has not been adopted by this change; see [thesis review](thesis-review.md#thesis-alignment-and-remaining-work).

## Release hash check

In PowerShell from the repository root, compute all three files and compare to the approved release values before a release:

```powershell
Get-FileHash server/models/v1/manifest.json, server/models/v1/top.onnx, server/models/v1/side.onnx -Algorithm SHA256 |
  Select-Object Path, Hash
```

| File | SHA-256 for the 14451 release |
|---|---|
| `manifest.json` | `7c17d197691d304f311a58634f985e0a0a1d9122e5c50b2fe95ae5fae017760f` |
| `top.onnx` | `370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa` |
| `side.onnx` | `ed40cb8d60da95b1f8eb1c955b7e52fc70bfb00bf798eb2a57a52a2d4e175c72` |

Compare the two ONNX hashes with the values inside the reviewed manifest, too. The manifest has changed with the formula version even though the binary hashes have not. The [November 3 release evidence](../deployment.md#14451-api-and-web-release-2026-11-03) records the matching deployed hashes and readiness; repeat the comparison for each later release. The loader checks model hashes and recomputes the exporter's canonical bundle ID from the schema version, method, divisor, marker and model configuration; it rejects a mismatch.

For a future model replacement, use the documented isolated export process, retain source provenance privately, generate and review the new manifest, verify binary hashes and model/schema compatibility, test both backend and frontend contract, and only then release the approved serving files. Never add photos or checkpoints to make inference appear available. See the detailed [inference runbook](../inference.md) for inputs, gates and error handling, and [deployment](deployment.md) for operational status and history.
