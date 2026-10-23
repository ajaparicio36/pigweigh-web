import unittest
from pathlib import Path
import tempfile

from export_bundle import bundle_identifier, check_contract, export_bundle


class ExportContractTests(unittest.TestCase):
    def test_bundle_identifier_binds_weights_and_configuration_not_folder_name(self):
        from copy import deepcopy
        manifest = {"schema_version": 1, "method": "attached-marker-ellipse-11900-v1",
                    "formula_divisor": 11900, "marker": {"id": 0, "side_mm": 100},
                    "models": {"top": {"sha256": "a" * 64, "keypoints": ["ear", "tail"]}}}
        identity = bundle_identifier(manifest)
        self.assertEqual(identity, bundle_identifier(dict(reversed(list(manifest.items())))))
        self.assertEqual(identity, bundle_identifier({**manifest, "bundle_id": "other-folder"}))
        for field in ("weight", "marker", "names", "formula"):
            changed = deepcopy(manifest)
            if field == "weight":
                changed["models"]["top"]["sha256"] = "b" * 64
            elif field == "marker":
                changed["marker"]["side_mm"] = 200
            elif field == "names":
                changed["models"]["top"]["keypoints"].reverse()
            else:
                changed["formula_divisor"] = 1
            with self.subTest(field=field):
                self.assertNotEqual(identity, bundle_identifier(changed))

    def test_existing_bundle_rejected_before_runtime_imports(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "never overwritten"):
                export_bundle(Path(directory), Path("unused"), Path("unused"), Path("unused"), Path("unused"))

    def test_private_outputs_inside_repository_rejected(self):
        output = Path(__file__).resolve().parent / "never-create-private-artifacts"
        with self.assertRaisesRegex(ValueError, "outside the repository"):
            export_bundle(output, Path("unused"), Path("unused"), Path("unused"), Path("unused"))

    def test_exact_end_to_end_pose_contract(self):
        metadata = {"names": "{0: 'pig'}", "kpt_shape": "[2, 3]",
                    "kpt_names": "{0: ['ear', 'tail']}", "end2end": "True", "task": "pose"}
        check_contract(metadata, ["ear", "tail"], [1, 3, 640, 640], [1, 300, 12], "tensor(float)")
        for key, replacement in (("names", "{0: 'weight'}"), ("kpt_shape", "[3,3]"),
                                 ("kpt_names", "{0: ['tail', 'ear']}"), ("end2end", "False"), ("task", "detect")):
            with self.subTest(key=key), self.assertRaises(ValueError):
                check_contract({**metadata, key: replacement}, ["ear", "tail"],
                               [1, 3, 640, 640], [1, 300, 12], "tensor(float)")
        for shape, output, dtype in (([1, 3, 320, 640], [1, 300, 12], "tensor(float)"),
                                     ([1, 3, 640, 640], [1, 12, 8400], "tensor(float)"),
                                     ([1, 3, 640, 640], [1, 300, 12], "tensor(float16)")):
            with self.subTest(shape=shape, output=output, dtype=dtype), self.assertRaises(ValueError):
                check_contract(metadata, ["ear", "tail"], shape, output, dtype)


if __name__ == "__main__":
    unittest.main()
