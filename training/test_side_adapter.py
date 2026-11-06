"""Exercise all source classes and fail-closed adapter behavior on CPU."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import sys

import numpy as np
import onnx
import onnxruntime as ort
from onnx import TensorProto, helper

from side_adapter import adapted_reference, append_adapter, canonical_json_sha256, load_mapping

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / "training/config/side-adapter-v2.json"
POLICY = ROOT / "training/config/roboflow-pose-v1.json"


class SideAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.config = load_mapping(CONFIG, POLICY)
        graph = helper.make_graph([], "adapter", [helper.make_tensor_value_info("raw", TensorProto.FLOAT, [1, 300, 45])],
                                  [helper.make_tensor_value_info("raw", TensorProto.FLOAT, [1, 300, 45])])
        append_adapter(graph, cls.config["output_to_source"], "raw")
        model = helper.make_model(graph, opset_imports=[helper.make_opsetid("", 17)], ir_version=10)
        onnx.checker.check_model(model)
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        cls.session = ort.InferenceSession(model.SerializeToString(), sess_options=opts, providers=["CPUExecutionProvider"])

    def test_all_thirteen_classes_preserve_rows_scores_boxes_and_padding(self):
        raw = np.zeros((1, 300, 45), dtype=np.float32)
        for index in range(13):
            raw[0, index, :5] = [index, index + 1, index + 2, index + 3, .75]
            raw[0, index, 5] = index
            raw[0, index, 6:] = np.arange(39, dtype=np.float32) + index * 100
        actual = self.session.run(None, {"raw": raw})[0]
        expected = adapted_reference(raw, self.config["output_to_source"])
        np.testing.assert_array_equal(actual, expected)
        np.testing.assert_array_equal(actual[0, :, :5], raw[0, :, :5])
        np.testing.assert_array_equal(actual[0, 13:], np.zeros((287, 45), dtype=np.float32))
        self.assertEqual(len({tuple(x) for x in self.config["output_to_source"]}), 3)

    def test_invalid_classes_and_nonfinite_raw_values_remain_rejectable(self):
        for bad in (-1, 13, 1.5, float("nan"), float("inf"), -float("inf")):
            with self.subTest(bad=bad):
                raw = np.zeros((1, 300, 45), dtype=np.float32)
                raw[0, 0, 5] = bad
                output = self.session.run(None, {"raw": raw})[0]
                self.assertTrue(np.isnan(output[0, 0, 5]))
                self.assertFalse(np.isfinite(output).all())
        for column in (0, 4, 6, 44):
            raw = np.zeros((1, 300, 45), dtype=np.float32)
            raw[0, 0, column] = float("nan")
            self.assertFalse(np.isfinite(self.session.run(None, {"raw": raw})[0]).all())

    def test_existing_gate_rejects_duplicate_and_invalid_low_score_rows(self):
        sys.path.insert(0, str(ROOT / "server"))
        from pigweigh.inference import CaptureRejected, SIDE_POINTS, required_pose
        raw = np.zeros((1, 300, 45), dtype=np.float32)
        raw[0, 0, :6] = [10, 10, 100, 100, .9, 1]
        raw[0, 1, :6] = [10, 10, 100, 100, .8, 3]
        adapted = self.session.run(None, {"raw": raw})[0]
        with self.assertRaises(CaptureRejected) as error:
            required_pose(adapted, (640, 640, 3), SIDE_POINTS, ("withers", "sternum"), 1, 0, 0, "side")
        self.assertEqual(error.exception.code, "pig_count")
        raw[0, 1, 4] = 0
        raw[0, 299, 5] = 1.5
        adapted = self.session.run(None, {"raw": raw})[0]
        with self.assertRaises(CaptureRejected) as error:
            required_pose(adapted, (640, 640, 3), SIDE_POINTS, ("withers", "sternum"), 1, 0, 0, "side")
        self.assertEqual(error.exception.code, "invalid_pose")

    def test_mapping_hash_ignores_platform_json_line_endings(self):
        with tempfile.TemporaryDirectory() as tmp:
            first, second = Path(tmp) / "lf.json", Path(tmp) / "crlf.json"
            value = json.dumps(self.config, indent=2) + "\n"
            first.write_bytes(value.encode("utf-8"))
            second.write_bytes(value.replace("\n", "\r\n").encode("utf-8"))
            self.assertEqual(canonical_json_sha256(first), canonical_json_sha256(second))

    def test_direct_graph_rejects_noninteger_permutations(self):
        for bad in (True, 1.0, -1, 13):
            mapping = copy.deepcopy(self.config["output_to_source"])
            mapping[0][1] = bad
            graph = helper.make_graph([], "bad", [], [])
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                append_adapter(graph, mapping, "raw")

    def test_invalid_and_unreviewed_mappings_are_rejected(self):
        for transform in (lambda c: c["output_to_source"][0].__setitem__(0, 1),
                          lambda c: c["output_to_source"][0].__setitem__(0, True),
                          lambda c: c["output_to_source"].pop(),
                          lambda c: c["source_classes"].reverse(),
                          lambda c: c.__setitem__("source_policy_sha256", "0" * 64)):
            changed = copy.deepcopy(self.config)
            transform(changed)
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "bad.json"
                path.write_text(json.dumps(changed), encoding="utf-8")
                with self.assertRaises(ValueError):
                    load_mapping(path, POLICY)


if __name__ == "__main__":
    unittest.main()
