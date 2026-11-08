"""Export a named, single-class side checkpoint while preserving the approved top model.

Run in the isolated export environment. Outputs and source photos stay private.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
from pathlib import Path
import shutil
import sys

from export_bundle import bundle_identifier, check_contract, sha256

ROOT = Path(__file__).resolve().parents[1]
TOP_SHA256 = "370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa"
METHOD = "attached-marker-ellipse-14451-v1"
MARKER = {"dictionary": "DICT_4X4_50", "id": 0, "side_mm": 100}


def selected_samples(dataset: Path, prepared: dict) -> list[tuple[str, Path, Path]]:
    """Select one validated image per original class from the prepared validation split."""
    classes = prepared["source_class_names"]
    if not classes or len(set(classes)) != len(classes):
        raise ValueError("Prepared dataset source classes must be unique")
    chosen = {}
    for record in sorted(prepared["records"], key=lambda row: row["source_image"]):
        if record["split"] != "valid":
            continue
        objects = record["objects"]
        if len(objects) != 1 or objects[0]["source_weight_class"] not in classes:
            raise ValueError("Expected one known source class per validation image")
        name = objects[0]["source_weight_class"]
        if name in chosen:
            continue
        image = (dataset / record["source_image"]).resolve()
        label = (dataset / record["source_label"]).resolve()
        if (dataset not in image.parents or dataset not in label.parents
                or not image.is_file() or not label.is_file()
                or sha256(image) != record["source_image_sha256"]
                or label.read_text(encoding="utf-8") != record["prepared_label_text"]):
            raise ValueError("Prepared validation sample differs from its manifest")
        chosen[name] = (name, image, label)
    if set(chosen) != set(classes):
        raise ValueError("Validation split does not cover each source class")
    return [chosen[name] for name in classes]


def check_existing_manifest(manifest: dict, manifest_path: Path) -> Path:
    if (manifest.get("bundle_id") != bundle_identifier(manifest)
            or manifest.get("method") != METHOD or manifest.get("formula_divisor") != 14451
            or manifest.get("marker") != MARKER):
        raise ValueError("Existing manifest method or identity is invalid")
    top = (manifest_path.parent / manifest["models"]["top"]["file"]).resolve(strict=True)
    if (top.parent != manifest_path.parent or manifest["models"]["top"]["sha256"] != TOP_SHA256
            or sha256(top) != TOP_SHA256):
        raise ValueError("Existing top model differs from approved bytes")
    return top


def export_side(output: Path, source: Path, dataset: Path, policy_path: Path,
                existing_manifest: Path, fixture: Path, expected_source: str,
                expected_dataset_manifest: str) -> None:
    output, source, dataset, policy_path, existing_manifest, fixture = (
        p.resolve() for p in (output, source, dataset, policy_path, existing_manifest, fixture)
    )
    if output.exists():
        raise ValueError("Choose a fresh output directory")
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Private output must remain outside the repository")
    if any(output == p or output in p.parents or p in output.parents
           for p in (source, dataset, policy_path, existing_manifest, fixture)):
        raise ValueError("Output must not overlap the source or input directories")
    dataset_yaml, dataset_manifest = dataset / "data.yaml", dataset / "manifest.json"
    sources = [source, dataset_yaml, dataset_manifest, policy_path, existing_manifest, fixture]
    if not all(path.is_file() for path in sources):
        raise ValueError("Missing checkpoint, dataset metadata, policy, manifest or fixture")
    if sha256(source) != expected_source or sha256(dataset_manifest) != expected_dataset_manifest:
        raise ValueError("Source checkpoint or prepared dataset manifest hash differs from expected")
    policy = json.loads(policy_path.read_text(encoding="utf-8"))["views"]["side"]
    prepared = json.loads(dataset_manifest.read_text(encoding="utf-8"))
    names = policy["canonical_keypoints"]
    if (prepared["view"] != "side" or prepared["canonical_keypoints"] != names
            or prepared["policy"] != policy or prepared["policy_sha256"] != sha256(policy_path)):
        raise ValueError("Prepared dataset and source policy disagree")
    old = json.loads(existing_manifest.read_text(encoding="utf-8"))
    top = check_existing_manifest(old, existing_manifest)
    samples = selected_samples(dataset, prepared)
    sources += [top] + [path for _, image, label in samples for path in (image, label)]
    hashes_before = {str(path): sha256(path) for path in sources}

    # Set before importing Torch or Ultralytics; never download or use a GPU.
    os.environ["YOLO_AUTOINSTALL"] = "false"
    os.environ["CUDA_VISIBLE_DEVICES"] = ""
    os.environ["OMP_NUM_THREADS"] = "2"
    os.environ["MKL_NUM_THREADS"] = "2"
    import cv2
    import numpy as np
    import onnx
    import onnxruntime as ort
    from PIL import Image, ImageOps
    import torch
    from ultralytics import YOLO, __version__ as ultralytics_version
    import yaml

    dataset_info = yaml.safe_load(dataset_yaml.read_text(encoding="utf-8"))
    if (dataset_info.get("nc") != 1 or dataset_info.get("names") != ["pig"]
            or dataset_info.get("kpt_shape") != [13, 3] or dataset_info.get("kpt_names") != {0: names}):
        raise ValueError("Prepared YAML class or named keypoint schema differs")
    output.mkdir(parents=True, exist_ok=False)
    staging = output / "source-copies"
    staging.mkdir()
    copied = staging / "side.pt"
    shutil.copyfile(source, copied)
    shutil.copyfile(top, output / "top.onnx")
    if sha256(copied) != expected_source or sha256(output / "top.onnx") != TOP_SHA256:
        raise ValueError("Copied source or top model differs")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(1)
    model = YOLO(str(copied), task="pose")
    if (model.names != {0: "pig"} or model.model.kpt_shape != [13, 3]
            or getattr(model.model, "kpt_names", None) != {0: names}
            or Path(model.ckpt["train_args"]["data"]).resolve() != dataset_yaml):
        raise ValueError("Checkpoint class, named schema or training dataset differs")
    exported = Path(model.export(format="onnx", device="cpu", imgsz=640, batch=1, dynamic=False,
                                 half=False, simplify=False, nms=False, end2end=True, opset=17))
    target = output / "side.onnx"
    shutil.copyfile(exported, target)
    graph = onnx.load(str(target), load_external_data=False)
    if [(entry.domain, entry.version) for entry in graph.opset_import if entry.domain in ("", "ai.onnx")] != [("", 17)]:
        raise ValueError("Expected default ONNX opset 17")
    onnx.checker.check_model(str(target))
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(target), sess_options=options, providers=["CPUExecutionProvider"])
    inputs, outputs = session.get_inputs(), session.get_outputs()
    if len(inputs) != 1 or len(outputs) != 1 or outputs[0].type != "tensor(float)":
        raise ValueError("Expected one float32 ONNX input and output")
    check_contract(session.get_modelmeta().custom_metadata_map, names, inputs[0].shape,
                   outputs[0].shape, inputs[0].type)
    sys.path.insert(0, str(ROOT / "server"))
    from pigweigh.inference import CaptureRejected, SIDE_POINTS, required_pose

    model.model.cpu().eval()
    results = []
    for category, image, label in [("generated-fixture", fixture, None)] + samples:
        with Image.open(image) as opened:
            rgb = np.asarray(ImageOps.exif_transpose(opened).convert("RGB"))
        height, width = rgb.shape[:2]
        scale = min(640 / height, 640 / width)
        resized = cv2.resize(rgb, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_LINEAR)
        dw, dh = (640 - resized.shape[1]) / 2, (640 - resized.shape[0]) / 2
        left, top_pad = round(dw - .1), round(dh - .1)
        padded = cv2.copyMakeBorder(resized, top_pad, round(dh + .1), left, round(dw + .1),
                                    cv2.BORDER_CONSTANT, value=(114, 114, 114))
        tensor = np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32) / 255
        actual = session.run(None, {inputs[0].name: tensor})[0]
        with torch.inference_mode():
            reference = model.model(torch.from_numpy(tensor))[0].numpy()
        if not np.isfinite(actual).all() or not np.isfinite(reference).all():
            raise ValueError(f"Non-finite model output: {category}")
        selected = actual[0][actual[0, :, 4] >= .5]
        expected = reference[0][reference[0, :, 4] >= .5]
        selected, expected = selected[np.argsort(-selected[:, 4])], expected[np.argsort(-expected[:, 4])]
        if (selected.shape != expected.shape or not np.allclose(selected, expected, rtol=1e-4, atol=.05)
                or (len(selected) and not np.all(selected[:, 5] == 0))):
            raise ValueError(f"PyTorch/ONNX selected-row parity failed: {category}")
        try:
            required_pose(actual, rgb.shape, SIDE_POINTS, ("withers", "sternum"), scale, left, top_pad, "side")
            gate = "passed"
        except CaptureRejected as error:
            gate = error.code
        results.append({"sample": category, "image_sha256": hashes_before[str(image)],
                        "label_sha256": hashes_before[str(label)] if label else None,
                        "detections_at_score_0_5": len(selected), "pose_gate": gate,
                        "max_abs_difference": float(np.max(np.abs(selected - expected))) if len(selected) else None})
        print(json.dumps({"sample": category, "detections": len(selected), "pose_gate": gate}), flush=True)
    if hashes_before != {str(path): sha256(path) for path in sources}:
        raise ValueError("A source file changed during export")
    diffs = [result["max_abs_difference"] for result in results if result["max_abs_difference"] is not None]
    manifest = copy.deepcopy(old)
    manifest["models"]["side"] = {"file": "side.onnx", "sha256": sha256(target), "keypoints": names,
        "input_size": 640, "input_shape": inputs[0].shape, "output_shape": outputs[0].shape, "end2end": True,
        "source_checkpoint_sha256": hashes_before[str(source)],
        "training_source": {"prepared_dataset_yaml_sha256": hashes_before[str(dataset_yaml)],
                            "prepared_dataset_manifest_sha256": hashes_before[str(dataset_manifest)],
                            "preparation_policy_sha256": hashes_before[str(policy_path)],
                            "class_names": ["pig"]}}
    manifest["export"].pop("side_adapter", None)
    manifest["export"]["side"] = {"ultralytics": ultralytics_version, "torch": torch.__version__,
        "onnx": onnx.__version__, "onnxruntime": ort.__version__, "device": "cpu", "opset": 17,
        "imgsz": 640, "batch": 1, "dynamic": False, "half": False,
        "simplify": False, "nms": False, "end2end": True}
    manifest["parity"]["side"] = {"samples": len(results), "validation_source_classes": len(samples),
        "samples_with_selected_rows": len(diffs), "max_abs_selected_difference": max(diffs, default=None),
        "rtol": 1e-4, "atol": .05,
        "scope": "selected rows on one generated fixture and one validation image per original class; not weight accuracy"}
    manifest["bundle_id"] = bundle_identifier(manifest)
    (output / "parity-private.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"bundle_id": manifest["bundle_id"], "top_sha256": sha256(output / "top.onnx"),
                      "side_sha256": sha256(target), "pose_gates_passed": sum(r["pose_gate"] == "passed" for r in results),
                      "samples": len(results), "manifest": str(output / "manifest.json")}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--policy", required=True, type=Path)
    parser.add_argument("--existing-manifest", required=True, type=Path)
    parser.add_argument("--fixture", required=True, type=Path)
    parser.add_argument("--expected-source-sha256", required=True)
    parser.add_argument("--expected-dataset-manifest-sha256", required=True)
    args = parser.parse_args()
    export_side(args.output, args.source, args.dataset, args.policy, args.existing_manifest, args.fixture,
                args.expected_source_sha256, args.expected_dataset_manifest_sha256)
