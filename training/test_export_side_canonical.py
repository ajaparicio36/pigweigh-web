from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from export_bundle import bundle_identifier, sha256
from export_side_canonical import MARKER, METHOD, check_existing_manifest, export_side, selected_samples


class CanonicalSideExportTests(unittest.TestCase):
    def test_sample_selection_covers_original_classes_and_checks_prepared_bytes(self):
        with tempfile.TemporaryDirectory() as directory:
            dataset = Path(directory).resolve()
            records = []
            for name in ("16_side", "17_side"):
                image = dataset / f"{name}.jpg"
                label = dataset / f"{name}.txt"
                image.write_bytes(name.encode())
                label.write_text("0 canonical\n", encoding="utf-8")
                records.append({"split": "valid", "source_image": image.name, "source_label": label.name,
                                "source_image_sha256": sha256(image), "prepared_label_text": "0 canonical\n",
                                "objects": [{"source_weight_class": name}]})
            prepared = {"source_class_names": ["16_side", "17_side"], "records": records}
            self.assertEqual([sample[0] for sample in selected_samples(dataset, prepared)], prepared["source_class_names"])
            (dataset / "17_side.txt").write_text("changed\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "differs from its manifest"):
                selected_samples(dataset, prepared)
            records[1]["split"] = "test"
            with self.assertRaisesRegex(ValueError, "does not cover"):
                selected_samples(dataset, prepared)

    def test_existing_bundle_identity_and_top_bytes_are_verified(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory).resolve()
            top = path / "top.onnx"
            top.write_bytes(b"approved top")
            manifest = {"schema_version": 1, "method": METHOD, "formula_divisor": 14451,
                        "marker": MARKER, "models": {"top": {"file": top.name, "sha256": sha256(top)}}}
            manifest["bundle_id"] = bundle_identifier(manifest)
            with patch("export_side_canonical.TOP_SHA256", sha256(top)):
                self.assertEqual(check_existing_manifest(manifest, path / "manifest.json"), top)
                top.write_bytes(b"changed top")
                with self.assertRaisesRegex(ValueError, "differs from approved"):
                    check_existing_manifest(manifest, path / "manifest.json")
                manifest["formula_divisor"] = 11900
                with self.assertRaisesRegex(ValueError, "identity is invalid"):
                    check_existing_manifest(manifest, path / "manifest.json")

    def test_existing_output_is_refused_before_runtime_imports(self):
        with tempfile.TemporaryDirectory() as directory:
            unused = Path("unused")
            with self.assertRaisesRegex(ValueError, "fresh output"):
                export_side(Path(directory), unused, unused, unused, unused, unused, "unused", "unused")


if __name__ == "__main__":
    unittest.main()
