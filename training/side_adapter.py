"""Deterministic ONNX adapter for a 13-class source pose model.

Source class IDs select a reviewed point permutation; scores and rows are never
combined. Invalid class IDs become NaN so the existing pose gate rejects them.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper


EXPECTED_CLASSES = [f"{n}_side" for n in (16, 17, 18, 19, 20, 23, 27, 28, 29, 34, 35, 36, 38)]
PREFIX = "pigweigh_side_adapter_"


def sha256(path: Path) -> str:
    with path.open("rb") as file:
        digest = hashlib.sha256()
        for block in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(block)
        return digest.hexdigest()


def canonical_json_sha256(path: Path) -> str:
    """Hash semantic JSON independent of platform line endings and whitespace."""
    value = json.loads(path.read_text(encoding="utf-8"))
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def load_mapping(path: Path, policy_path: Path) -> dict:
    config = json.loads(path.read_text(encoding="utf-8"))
    policy = json.loads(policy_path.read_text(encoding="utf-8"))["views"]["side"]
    if config.get("schema_version") != 1 or config.get("adapter_version") != "side-roboflow-v2-class-map-v1":
        raise ValueError("Unknown adapter configuration")
    if config.get("source_classes") != EXPECTED_CLASSES or config.get("canonical_keypoints") != policy["canonical_keypoints"]:
        raise ValueError("Source classes or canonical names differ from the reviewed policy")
    if config.get("source_policy_sha256") != canonical_json_sha256(policy_path):
        raise ValueError("Reviewed policy hash changed")
    maps = config.get("output_to_source")
    if not isinstance(maps, list) or len(maps) != len(EXPECTED_CLASSES):
        raise ValueError("Expected one permutation per source class")
    for name, mapping in zip(EXPECTED_CLASSES, maps, strict=True):
        if (not isinstance(mapping, list) or len(mapping) != 13
                or any(type(index) is not int for index in mapping)
                or sorted(mapping) != list(range(13))
                or mapping != policy["classes"][name]["output_to_input"]):
            raise ValueError(f"Invalid or unreviewed permutation for {name}")
    return config


def append_adapter(graph: onnx.GraphProto, mapping: list[list[int]], raw_output: str) -> str:
    """Append class-indexed remapping to a static [1,300,45] pose output."""
    if (not isinstance(mapping, list) or len(mapping) != 13
            or any(not isinstance(row, list) or len(row) != 13
                   or any(type(index) is not int for index in row)
                   or sorted(row) != list(range(13)) for row in mapping)):
        raise ValueError("Each source class needs a complete integer permutation")
    occupied = {name for node in graph.node for name in (*node.input, *node.output)}
    occupied.update(value.name for value in (*graph.input, *graph.output, *graph.initializer))
    if any(name.startswith(PREFIX) for name in occupied):
        raise ValueError("Adapter graph namespace is already in use")
    def n(name: str) -> str:
        return PREFIX + name
    constants = {
        "box_indices": np.arange(5, dtype=np.int64),
        "class_index": np.array([5], dtype=np.int64),
        "point_indices": np.arange(6, 45, dtype=np.int64),
        "point_shape": np.array([1, 300, 13, 3], dtype=np.int64),
        "flat_shape": np.array([1, 300, 39], dtype=np.int64),
        "squeeze_axis": np.array([2], dtype=np.int64),
        "unsqueeze_axis": np.array([3], dtype=np.int64),
        "repeats": np.array([1, 1, 1, 3], dtype=np.int64),
        "mapping": np.asarray(mapping, dtype=np.int64),
        "zero": np.array(0, dtype=np.float32),
        "limit": np.array(13, dtype=np.float32),
        "invalid": np.array(np.nan, dtype=np.float32),
    }
    graph.initializer.extend(numpy_helper.from_array(value, n(key)) for key, value in constants.items())
    specs = [
        ("Gather", [raw_output, n("box_indices")], [n("boxes_scores")], {"axis": 2}),
        ("Gather", [raw_output, n("class_index")], [n("class")], {"axis": 2}),
        ("Gather", [raw_output, n("point_indices")], [n("points_flat")], {"axis": 2}),
        ("GreaterOrEqual", [n("class"), n("zero")], [n("lower_ok")], {}),
        ("Less", [n("class"), n("limit")], [n("upper_ok")], {}),
        ("Floor", [n("class")], [n("class_floor")], {}),
        ("Equal", [n("class"), n("class_floor")], [n("integer_ok")], {}),
        ("And", [n("lower_ok"), n("upper_ok")], [n("range_ok")], {}),
        ("And", [n("range_ok"), n("integer_ok")], [n("valid_class")], {}),
        ("Where", [n("valid_class"), n("class"), n("zero")], [n("safe_class")], {}),
        ("Cast", [n("safe_class")], [n("class_int")], {"to": TensorProto.INT64}),
        ("Squeeze", [n("class_int"), n("squeeze_axis")], [n("class_rows")], {}),
        ("Gather", [n("mapping"), n("class_rows")], [n("point_order")], {"axis": 0}),
        ("Unsqueeze", [n("point_order"), n("unsqueeze_axis")], [n("point_order_dim")], {}),
        ("Tile", [n("point_order_dim"), n("repeats")], [n("point_order_xyz")], {}),
        ("Reshape", [n("points_flat"), n("point_shape")], [n("points")], {}),
        ("GatherElements", [n("points"), n("point_order_xyz")], [n("ordered_points")], {"axis": 2}),
        ("Reshape", [n("ordered_points"), n("flat_shape")], [n("ordered_flat")], {}),
        ("Where", [n("valid_class"), n("zero"), n("invalid")], [n("serving_class")], {}),
        ("Concat", [n("boxes_scores"), n("serving_class"), n("ordered_flat")], [n("output")], {"axis": 2}),
    ]
    graph.node.extend(helper.make_node(op, inputs, outputs, name=n(f"node_{i}"), **attrs)
                      for i, (op, inputs, outputs, attrs) in enumerate(specs))
    del graph.output[:]
    graph.output.append(helper.make_tensor_value_info(n("output"), TensorProto.FLOAT, [1, 300, 45]))
    return n("output")


def adapted_reference(raw: np.ndarray, mapping: list[list[int]]) -> np.ndarray:
    """Independent NumPy oracle for the emitted ONNX adapter."""
    if raw.shape != (1, 300, 45):
        raise ValueError("Unexpected source output shape")
    output = raw.copy()
    for i, row in enumerate(raw[0]):
        value = row[5]
        if not np.isfinite(value) or value != np.floor(value) or not 0 <= value < 13:
            output[0, i, 5] = np.nan
            continue
        output[0, i, 5] = 0
        output[0, i, 6:] = row[6:].reshape(13, 3)[mapping[int(value)]].reshape(39)
    return output
