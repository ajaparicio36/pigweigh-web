"""Create a fresh private side-only CPU bundle from the audited v2 checkpoint.

No training, GPU, downloads, in-repo intermediates, or source writes. The
existing top ONNX is copied byte-for-byte, never re-exported.
"""
from __future__ import annotations

import argparse
import ast
import copy
import json
import os
from pathlib import Path
import shutil
import sys

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

from export_bundle import bundle_identifier, check_contract
from side_adapter import EXPECTED_CLASSES, adapted_reference, append_adapter, canonical_json_sha256, load_mapping, sha256

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "training/config/side-adapter-v2.json"
POLICY = ROOT / "training/config/roboflow-pose-v1.json"
TOP_SHA256 = "370a4b6563bde3fc093e8716e7925c11135e0988628fa591c875ad829dd389aa"


def session(path: Path) -> ort.InferenceSession:
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 2
    opts.inter_op_num_threads = 1
    return ort.InferenceSession(str(path), sess_options=opts, providers=["CPUExecutionProvider"])


def validate_source_contract(model: YOLO, config: dict) -> None:
    if model.names != dict(enumerate(EXPECTED_CLASSES)) or model.model.kpt_shape != [13, 3]:
        raise ValueError("Checkpoint class names or keypoint shape changed")
    generic = {i: [str(n) for n in range(13)] for i in range(13)}
    if getattr(model.model, "kpt_names", None) != generic:
        raise ValueError("Expected generic checkpoint keypoint names for all source classes")


def choose_samples(dataset: Path) -> list[tuple[int, Path, Path]]:
    chosen = {}
    for label in sorted((dataset / "valid/labels").glob("*.txt")):
        rows = label.read_text(encoding="utf-8").splitlines()
        if len(rows) != 1 or len(rows[0].split()) != 44:
            raise ValueError("Expected one 13-point object per validation label")
        cls = int(rows[0].split()[0])
        if cls not in range(13):
            raise ValueError("Unexpected dataset class")
        image = dataset / "valid/images" / (label.stem + ".jpg")
        if not image.is_file():
            raise ValueError("Validation image is missing")
        chosen.setdefault(cls, (cls, image, label))
    if set(chosen) != set(range(13)):
        raise ValueError("Validation split does not cover every source class")
    return [chosen[i] for i in range(13)]


def tensor_for_image(path: Path) -> tuple[np.ndarray, tuple[int, ...], float, int, int]:
    with Image.open(path) as image:
        rgb = np.asarray(ImageOps.exif_transpose(image).convert("RGB"))
    height, width = rgb.shape[:2]
    scale = min(640 / height, 640 / width)
    resized = cv2.resize(rgb, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_LINEAR)
    dw, dh = (640 - resized.shape[1]) / 2, (640 - resized.shape[0]) / 2
    left, top = round(dw - .1), round(dh - .1)
    padded = cv2.copyMakeBorder(resized, top, round(dh + .1), left, round(dw + .1),
                                cv2.BORDER_CONSTANT, value=(114, 114, 114))
    return np.ascontiguousarray(padded.transpose(2, 0, 1)[None], dtype=np.float32) / 255, rgb.shape, scale, left, top


def export_side(output: Path, source: Path, dataset: Path, existing_manifest: Path) -> None:
    config = load_mapping(CONFIG, POLICY)
    output, source, dataset, existing_manifest = (p.resolve() for p in (output, source, dataset, existing_manifest))
    if output.exists():
        raise ValueError("Choose a fresh output directory")
    if output == ROOT or ROOT in output.parents:
        raise ValueError("Private output must remain outside the repository")
    if any(output == p or output in p.parents or p in output.parents for p in (source, dataset, existing_manifest)):
        raise ValueError("Output must not overlap the source or input directories")
    inputs = [source, dataset / "data.yaml", dataset / "README.roboflow.txt", existing_manifest]
    if not all(p.is_file() for p in inputs):
        raise ValueError("Missing source checkpoint, dataset metadata or existing manifest")
    if sha256(source) != config["source_checkpoint_sha256"]:
        raise ValueError("Source checkpoint does not match audited SHA256")
    if sha256(dataset / "data.yaml") != config["source_dataset_yaml_sha256"]:
        raise ValueError("Dataset YAML does not match audited SHA256")
    if sha256(dataset / "README.roboflow.txt") != config["source_dataset_readme_sha256"]:
        raise ValueError("Dataset README does not match audited SHA256")
    old = json.loads(existing_manifest.read_text(encoding="utf-8"))
    if (old.get("bundle_id") != bundle_identifier(old)
            or old.get("method") != "attached-marker-ellipse-14451-v1" or old.get("formula_divisor") != 14451
            or old.get("marker") != {"dictionary": "DICT_4X4_50", "id": 0, "side_mm": 100}):
        raise ValueError("Existing manifest method or identity is invalid")
    top_file = (existing_manifest.parent / old["models"]["top"]["file"]).resolve(strict=True)
    if top_file.parent != existing_manifest.parent or old["models"]["top"]["sha256"] != TOP_SHA256 or sha256(top_file) != TOP_SHA256:
        raise ValueError("Existing top model differs from approved bytes")
    samples = choose_samples(dataset)
    sources = inputs + [top_file, CONFIG, POLICY] + [p for _, image, label in samples for p in (image, label)]
    hashes_before = {str(p): sha256(p) for p in sources}
    output.mkdir(parents=True, exist_ok=False)
    staging = output / "source-copies"
    staging.mkdir()
    copied = staging / "side.pt"
    shutil.copyfile(source, copied)
    if sha256(copied) != hashes_before[str(source)]:
        raise ValueError("Source checkpoint copy differs")
    shutil.copyfile(top_file, output / "top.onnx")
    if sha256(output / "top.onnx") != TOP_SHA256:
        raise ValueError("Copied top model differs")
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    cv2.setNumThreads(1)
    model = YOLO(str(copied), task="pose")
    validate_source_contract(model, config)
    exported = Path(model.export(format="onnx", device="cpu", imgsz=640, batch=1, dynamic=False,
                                 half=False, simplify=False, nms=False, end2end=True, opset=17))
    onnx.checker.check_model(str(exported))
    raw_session = session(exported)
    inputs, outputs = raw_session.get_inputs(), raw_session.get_outputs()
    metadata = raw_session.get_modelmeta().custom_metadata_map
    if (len(inputs) != 1 or inputs[0].shape != [1, 3, 640, 640] or inputs[0].type != "tensor(float)"
            or len(outputs) != 1 or outputs[0].shape != [1, 300, 45]
            or metadata.get("task") != "pose" or ast.literal_eval(metadata.get("names", "{}")) != dict(enumerate(EXPECTED_CLASSES))
            or ast.literal_eval(metadata.get("kpt_shape", "[]")) != [13, 3]
            or ast.literal_eval(metadata.get("kpt_names", "{}")) != {i: [str(n) for n in range(13)] for i in range(13)}
            or ast.literal_eval(metadata.get("end2end", "False")) is not True):
        raise ValueError("Raw ONNX source metadata or layout differs from checkpoint")
    graph = onnx.load(str(exported))
    if len(graph.graph.output) != 1:
        raise ValueError("Expected one source ONNX output")
    append_adapter(graph.graph, config["output_to_source"], graph.graph.output[0].name)
    metadata_values = {entry.key: entry.value for entry in graph.metadata_props}
    metadata_values.update({"names": str({0: "pig"}), "kpt_names": str({0: config["canonical_keypoints"]}),
                            "pigweigh_adapter": config["adapter_version"],
                            "pigweigh_source_classes": str(dict(enumerate(EXPECTED_CLASSES))),
                            "pigweigh_mapping_sha256": canonical_json_sha256(CONFIG)})
    del graph.metadata_props[:]
    for key, value in metadata_values.items():
        entry = graph.metadata_props.add()
        entry.key, entry.value = key, value
    onnx.checker.check_model(graph)
    target = output / "side.onnx"
    onnx.save_model(graph, str(target))
    wrapped_session = session(target)
    adapted_inputs, adapted_outputs = wrapped_session.get_inputs(), wrapped_session.get_outputs()
    check_contract(wrapped_session.get_modelmeta().custom_metadata_map, config["canonical_keypoints"],
                   adapted_inputs[0].shape, adapted_outputs[0].shape, adapted_inputs[0].type)
    sys.path.insert(0, str(ROOT / "server"))
    from pigweigh.inference import CaptureRejected, SIDE_POINTS, required_pose
    sample_results = []
    model.model.cpu().eval()
    for cls, image, label in samples:
        tensor, shape, scale, left, top = tensor_for_image(image)
        actual = raw_session.run(None, {inputs[0].name: tensor})[0]
        adapted = wrapped_session.run(None, {adapted_inputs[0].name: tensor})[0]
        with torch.inference_mode():
            reference = model.model(torch.from_numpy(tensor))[0].numpy()
        if not np.isfinite(actual).all() or not np.isfinite(reference).all() or not np.isfinite(adapted).all():
            raise ValueError("Model produced non-finite fixture output")
        selected = actual[0][actual[0, :, 4] >= .5]
        expected = reference[0][reference[0, :, 4] >= .5]
        if selected.shape != expected.shape or not np.allclose(selected, expected, rtol=1e-4, atol=.05):
            raise ValueError(f"Raw PyTorch/ONNX selected-row parity failed for class {cls}")
        oracle = adapted_reference(actual, config["output_to_source"])
        if not np.array_equal(adapted, oracle):
            raise ValueError(f"Wrapped ONNX remapping differs from raw-output oracle for class {cls}")
        try:
            required_pose(adapted, shape, SIDE_POINTS, ("withers", "sternum"), scale, left, top, "side")
            gate = "passed"
        except CaptureRejected as error:
            gate = error.code
        selected_classes = [int(row[5]) for row in selected]
        sample_results.append({"known_class": EXPECTED_CLASSES[cls], "image_sha256": hashes_before[str(image)],
                               "label_sha256": hashes_before[str(label)], "detections_at_score_0_5": len(selected),
                               "predicted_classes": [EXPECTED_CLASSES[i] for i in selected_classes],
                               "scores": [float(row[4]) for row in selected], "pose_gate": gate,
                               "matches_known_class": [i == cls for i in selected_classes],
                               "raw_torch_onnx_max_abs_selected": float(np.max(np.abs(selected - expected))) if len(selected) else None,
                               "raw_adapter_max_abs": float(np.max(np.abs(adapted - oracle)))})
        print(json.dumps({"known_class": EXPECTED_CLASSES[cls], "detections": len(selected), "pose_gate": gate}), flush=True)
    if hashes_before != {str(p): sha256(p) for p in sources}:
        raise ValueError("A source file changed during export")
    manifest = copy.deepcopy(old)
    manifest["models"]["side"] = {"file": "side.onnx", "sha256": sha256(target),
        "keypoints": config["canonical_keypoints"], "input_size": 640,
        "input_shape": [1, 3, 640, 640], "output_shape": [1, 300, 45], "end2end": True,
        "source_checkpoint_sha256": hashes_before[str(source)],
        "adapter": {"version": config["adapter_version"], "mapping_sha256": canonical_json_sha256(CONFIG),
                    "source_policy_sha256": canonical_json_sha256(POLICY),
                    "json_hash_canonicalization": "sorted compact JSON, ASCII-escaped UTF-8",
                    "source_dataset_yaml_sha256": hashes_before[str(dataset / "data.yaml")],
                    "source_dataset_readme_sha256": hashes_before[str(dataset / "README.roboflow.txt")],
                    "source_onnx_sha256": sha256(exported), "source_classes": config["source_classes"],
                    "output_to_source": config["output_to_source"],
                    "score_semantics": "source weight-class score preserved; not pig certainty",
                    "evidence": "current class names and v1-v2 coordinate continuity; frozen v2 names not exhaustively verified"}}
    manifest["export"]["side_adapter"] = {"ultralytics": ultralytics_version, "torch": torch.__version__,
        "onnx": onnx.__version__, "onnxruntime": ort.__version__, "device": "cpu", "opset": 17,
        "raw_flags": {"imgsz": 640, "batch": 1, "dynamic": False, "half": False,
                      "simplify": False, "nms": False, "end2end": True}, "graph": "class-indexed ONNX point permutation"}
    selected_diffs = [s["raw_torch_onnx_max_abs_selected"] for s in sample_results if s["raw_torch_onnx_max_abs_selected"] is not None]
    manifest["parity"]["side"] = {"samples": len(sample_results), "known_classes": 13,
        "samples_with_selected_rows": len(selected_diffs), "raw_torch_onnx_max_abs_selected": max(selected_diffs, default=None),
        "raw_adapter_max_abs": max(s["raw_adapter_max_abs"] for s in sample_results),
        "rtol": 1e-4, "atol": .05, "scope": "selected source rows and exact row remapping; not anatomical or weight accuracy"}
    manifest["bundle_id"] = bundle_identifier(manifest)
    (output / "parity-private.json").write_text(json.dumps(sample_results, indent=2) + "\n", encoding="utf-8")
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"bundle_id": manifest["bundle_id"], "top_sha256": sha256(output / "top.onnx"),
                      "side_sha256": sha256(target), "pose_gates_passed": sum(s["pose_gate"] == "passed" for s in sample_results),
                      "samples": len(sample_results), "manifest": str(output / "manifest.json")}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--dataset", required=True, type=Path)
    parser.add_argument("--existing-manifest", required=True, type=Path)
    args = parser.parse_args()
    export_side(args.output, args.source, args.dataset, args.existing_manifest)
