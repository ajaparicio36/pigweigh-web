"""Export local trusted pose checkpoints to a new private CPU ONNX bundle.

Run in an isolated export environment, never the serving/training environment.
No downloads/auto-installs, GPU, training, or source-file writes are permitted.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import shutil


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bundle_identifier(manifest: dict) -> str:
    payload = {key: manifest[key] for key in ("schema_version", "method", "formula_divisor", "marker", "models")}
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return f"{manifest['method']}-{hashlib.sha256(canonical).hexdigest()[:16]}"


def check_contract(metadata: dict[str, str], keypoints: list[str], input_shape: list[int],
                   output_shape: list[int], input_type: str) -> None:
    """Reject different classes, named schemas, layouts, or model modes."""
    if input_shape != [1, 3, 640, 640] or input_type != "tensor(float)":
        raise ValueError("Expected static RGB float32 NCHW input [1,3,640,640]")
    if output_shape != [1, 300, 6 + 3 * len(keypoints)]:
        raise ValueError("Unexpected end-to-end pose output layout")
    if ast.literal_eval(metadata.get("names", "{}")) != {0: "pig"}:
        raise ValueError("Expected the single pig class")
    if ast.literal_eval(metadata.get("kpt_shape", "[]")) != [len(keypoints), 3]:
        raise ValueError("Wrong keypoint shape")
    if ast.literal_eval(metadata.get("kpt_names", "{}")) != {0: keypoints}:
        raise ValueError("Wrong canonical keypoint names or order")
    if ast.literal_eval(metadata.get("end2end", "False")) is not True:
        raise ValueError("Only end-to-end XYXY outputs are supported")
    if metadata.get("task") != "pose":
        raise ValueError("Expected pose task")


def export_bundle(output: Path, top: Path, side: Path, top_image: Path, side_image: Path) -> None:
    if output.exists():
        raise ValueError("Choose a new output directory; existing bundles are never overwritten")
    repository = Path(__file__).resolve().parents[1]
    if output.resolve() == repository or repository in output.resolve().parents:
        raise ValueError("Private model artifacts must remain outside the repository")
    paths = [top.resolve(), side.resolve(), top_image.resolve(), side_image.resolve()]
    for path in paths:
        if not path.is_file() or output.resolve() == path or output.resolve() in path.parents:
            raise ValueError(f"Invalid source/output location: {path}")
    original_hashes = {str(path): sha256(path) for path in paths}
    # Must be set before importing Ultralytics. Applies only to this process.
    os.environ["YOLO_AUTOINSTALL"] = "false"
    from PIL import Image, ImageOps
    import cv2
    import numpy as np
    import onnx
    import onnxruntime as ort
    import torch
    from ultralytics import YOLO, __version__

    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(1)
    policy = json.loads((Path(__file__).parent / "config/roboflow-pose-v1.json").read_text())
    output.mkdir(parents=True, exist_ok=False)
    staging = output / "source-copies"
    staging.mkdir()
    manifest = {"schema_version": 1,
                "method": "attached-marker-ellipse-11900-v1", "formula_divisor": 11900,
                "marker": {"dictionary": "DICT_4X4_50", "id": 0, "side_mm": 100},
                "models": {}, "export": {"ultralytics": __version__, "torch": torch.__version__,
                    "onnx": onnx.__version__, "onnxruntime": ort.__version__, "device": "cpu",
                    "imgsz": 640, "batch": 1, "dynamic": False, "half": False,
                    "simplify": False, "nms": False, "end2end": True, "opset": 17},
                "parity": {}}
    for view, checkpoint, image_path in (("top", top, top_image), ("side", side, side_image)):
        expected_names = policy["views"][view]["canonical_keypoints"]
        copied = staging / f"{view}.pt"
        shutil.copyfile(checkpoint, copied)
        if sha256(copied) != original_hashes[str(checkpoint.resolve())]:
            raise ValueError("Checkpoint copy changed")
        model = YOLO(str(copied), task="pose")
        if model.names != {0: "pig"} or model.model.kpt_shape != [len(expected_names), 3]:
            raise ValueError(f"Checkpoint class/shape mismatch: {view}")
        if getattr(model.model, "kpt_names", None) != {0: expected_names}:
            raise ValueError(f"Checkpoint named schema mismatch: {view}")
        exported = Path(model.export(format="onnx", device="cpu", imgsz=640, batch=1, dynamic=False,
                                     half=False, simplify=False, nms=False, end2end=True, opset=17))
        artifact = output / f"{view}.onnx"
        if artifact.exists():
            raise ValueError("Refusing to overwrite model")
        shutil.copyfile(exported, artifact)
        onnx.checker.check_model(str(artifact))
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(artifact), sess_options=options, providers=["CPUExecutionProvider"])
        inputs, outputs = session.get_inputs(), session.get_outputs()
        if len(inputs) != 1 or len(outputs) != 1:
            raise ValueError("Expected one input and output")
        check_contract(session.get_modelmeta().custom_metadata_map, expected_names,
                       inputs[0].shape, outputs[0].shape, inputs[0].type)
        with Image.open(image_path) as image:
            rgb = np.asarray(ImageOps.exif_transpose(image).convert("RGB"))
        height, width = rgb.shape[:2]
        scale = min(640 / height, 640 / width)
        resized = cv2.resize(rgb, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_LINEAR)
        dw, dh = (640 - resized.shape[1]) / 2, (640 - resized.shape[0]) / 2
        padded = cv2.copyMakeBorder(resized, round(dh - .1), round(dh + .1), round(dw - .1), round(dw + .1),
                                    cv2.BORDER_CONSTANT, value=(114, 114, 114))
        tensor = np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32) / 255
        actual = session.run(None, {inputs[0].name: tensor})[0]
        model.model.cpu().eval()
        with torch.inference_mode():
            reference = model.model(torch.from_numpy(tensor))[0].numpy()
        selected = actual[0][actual[0, :, 4] >= .5]
        expected = reference[0][reference[0, :, 4] >= .5]
        selected = selected[np.argsort(-selected[:, 4])]
        expected = expected[np.argsort(-expected[:, 4])]
        if len(selected) != 1 or selected.shape != expected.shape:
            raise ValueError(f"Parity fixture must have one matching pig: {view}")
        if not np.isfinite(actual).all() or not np.allclose(selected, expected, rtol=1e-4, atol=.05):
            raise ValueError(f"ONNX/PT detected-object parity failed: {view}")
        manifest["models"][view] = {"file": artifact.name, "sha256": sha256(artifact),
            "keypoints": expected_names, "input_size": 640, "input_shape": inputs[0].shape,
            "output_shape": outputs[0].shape, "end2end": True,
            "source_checkpoint_sha256": original_hashes[str(checkpoint.resolve())]}
        manifest["parity"][view] = {"image_sha256": original_hashes[str(image_path.resolve())],
            "matching_detections_at_score_0_5": len(selected),
            "max_abs_difference_input_pixels_or_score": float(np.max(np.abs(selected - expected))),
            "rtol": 1e-4, "atol": .05, "scope": "functional fixture; not measurement/weight accuracy"}
        print(json.dumps({"view": view, **manifest["models"][view], "parity": manifest["parity"][view]}), flush=True)
        del session, model
    if original_hashes != {str(path): sha256(path) for path in paths}:
        raise ValueError("Original source bytes changed")
    manifest["bundle_id"] = bundle_identifier(manifest)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Verified bundle: {output / 'manifest.json'}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--top", type=Path, required=True)
    parser.add_argument("--side", type=Path, required=True)
    parser.add_argument("--top-image", type=Path, required=True)
    parser.add_argument("--side-image", type=Path, required=True)
    args = parser.parse_args()
    export_bundle(args.output, args.top, args.side, args.top_image, args.side_image)
