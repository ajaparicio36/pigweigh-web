"""Permutation, preservation, and rejection regressions; no GPU or real data writes."""
from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
import tempfile
import unittest

from prepare_pose import (PreparationError, digest, load_json, parse_row, prepare,
                          transform_row, validate_policy, validate_prepared)


class PreparationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.output = self.root / "prepared"
        self.source.mkdir()
        (self.source / "data.yaml").write_text("names: ['16_side']\n", encoding="utf-8")
        self.row = "0 0.50 0.5000 0.40 0.300 0.1 0.200 2 0 0 0 0.3 0.40000 1"
        for split in ("train", "valid", "test"):
            (self.source / split / "images").mkdir(parents=True)
            (self.source / split / "labels").mkdir()
            (self.source / split / "images/pig.jpg").write_bytes(f"fixture-{split}".encode())
            (self.source / split / "labels/pig.txt").write_text(self.row + "\n", encoding="utf-8")
        evidence_label = self.source / "valid/labels/pig.txt"
        evidence_image = self.source / "valid/images/pig.jpg"
        self.policy = {"canonical_keypoints": ["a", "b", "c"], "classes": {
            "16_side": {"status": "verified", "source_keypoint_names": ["b", "c", "a"],
                        "output_to_input": [2, 0, 1], "masks": {}, "evidence": [{
                            "label": "valid/labels/pig.txt", "sha256": digest(evidence_label),
                            "image": "valid/images/pig.jpg", "image_sha256": digest(evidence_image)}]}},
            "excluded_labels": {}}
        self.config = self.root / "policy.json"
        self.save_policy()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def save_policy(self) -> None:
        self.config.write_text(json.dumps({"views": {"side": self.policy}}), encoding="utf-8")

    def run_prepare(self, write: bool = True) -> dict:
        return prepare(self.source, self.output, self.config, "side", write)

    def source_snapshot(self) -> dict:
        return {path.relative_to(self.source).as_posix(): path.read_bytes()
                for path in self.source.rglob("*") if path.is_file()}

    def test_exact_permutation_preserves_tokens_visibility_and_box(self) -> None:
        tokens = parse_row(self.row, 3, 1)
        row, masks = transform_row(tokens, self.policy["classes"]["16_side"], ["a", "b", "c"])
        self.assertEqual(row, "0 0.50 0.5000 0.40 0.300 0.3 0.40000 1 0.1 0.200 2 0 0 0")
        self.assertEqual(masks, [])

    def test_copy_manifest_weights_splits_and_source_preservation(self) -> None:
        before = self.source_snapshot()
        summary = self.run_prepare()
        self.assertEqual(validate_prepared(self.output), summary)
        manifest = load_json(self.output / "manifest.json")
        for record in manifest["records"]:
            obj = record["objects"][0]
            self.assertEqual(obj["source_weight_class"], "16_side")
            self.assertEqual(obj["scale_weight_kg"], "16")
            self.assertEqual(obj["original_tokens"], self.row.split())
            self.assertEqual(obj["output_to_input"], [2, 0, 1])
        self.assertEqual(before, self.source_snapshot())
        (self.output / "train/images/pig.jpg").write_bytes(b"trainer-repair")
        self.assertEqual(before, self.source_snapshot(), "Copied images must not be hardlinks")
        with self.assertRaises(PreparationError):
            validate_prepared(self.output)

    def test_ambiguous_point_mask_is_explicit_and_original_retained(self) -> None:
        entry = self.policy["classes"]["16_side"]
        entry["source_keypoint_names"][2] = "ambiguous-tail"
        entry["masks"] = {"a": "Tail point is not verified as canonical a"}
        self.save_policy()
        self.run_prepare()
        record = load_json(self.output / "manifest.json")["records"][0]
        mask = record["objects"][0]["masks"][0]
        self.assertEqual(mask["original_triplet"], ["0.3", "0.40000", "1"])
        self.assertEqual(record["objects"][0]["prepared_tokens"][5:8], ["0", "0", "0"])
        validate_prepared(self.output)

    def test_unknown_duplicate_missing_unverified_maps_rejected(self) -> None:
        for mutation in ("unknown-class", "duplicate-slot", "missing-slot", "unverified", "wrong-name", "duplicate-name"):
            with self.subTest(mutation=mutation):
                policy = deepcopy(self.policy)
                entry = policy["classes"]["16_side"]
                if mutation == "unknown-class":
                    policy["classes"]["99_side"] = deepcopy(entry)
                elif mutation == "duplicate-slot":
                    entry["output_to_input"] = [0, 0, 2]
                elif mutation == "missing-slot":
                    entry["output_to_input"] = [0, 1]
                elif mutation == "unverified":
                    entry["status"] = "pending"
                elif mutation == "wrong-name":
                    entry["source_keypoint_names"][2] = "tail-tip"
                else:
                    entry["source_keypoint_names"][2] = "b"
                with self.assertRaises(PreparationError):
                    validate_policy(policy, ["16_side"])

    def test_duplicate_json_keys_rejected(self) -> None:
        self.config.write_text('{"views": {}, "views": {}}', encoding="utf-8")
        with self.assertRaises(PreparationError):
            load_json(self.config)

    def test_dry_run_writes_nothing_and_existing_or_overlapping_output_rejected(self) -> None:
        self.run_prepare(False)
        self.assertFalse(self.output.exists())
        for output in (self.source, self.source / "prepared", self.root):
            with self.subTest(output=output), self.assertRaises(PreparationError):
                prepare(self.source, output, self.config, "side", True)
        self.output.mkdir()
        with self.assertRaises(PreparationError):
            self.run_prepare()

    def test_changed_evidence_or_orphan_rejected_before_output_created(self) -> None:
        (self.source / "valid/labels/pig.txt").write_text(self.row + " \n", encoding="utf-8")
        with self.assertRaises(PreparationError):
            self.run_prepare()
        self.assertFalse(self.output.exists())
        (self.source / "valid/labels/pig.txt").write_text(self.row + "\n", encoding="utf-8")
        (self.source / "test/labels/orphan.txt").write_text(self.row, encoding="utf-8")
        with self.assertRaises(PreparationError):
            self.run_prepare()
        self.assertFalse(self.output.exists())

    def test_bad_coordinates_nonfinite_visibility_and_class_fail_closed(self) -> None:
        for slot, replacement in ((6, "-0.004"), (5, "NaN"), (7, "3"), (0, "1"), (3, "0")):
            with self.subTest(slot=slot, replacement=replacement):
                tokens = self.row.split()
                tokens[slot] = replacement
                with self.assertRaises(PreparationError):
                    parse_row(" ".join(tokens), 3, 1)

    def test_reviewed_exclusion_is_recorded_and_hash_bound(self) -> None:
        path = self.source / "train/labels/pig.txt"
        path.write_text(self.row.replace("0.200", "-0.004"), encoding="utf-8")
        self.policy["excluded_labels"] = {"train/labels/pig.txt": {"sha256": digest(path), "reason": "Known negative coordinate"}}
        self.save_policy()
        summary = self.run_prepare()
        self.assertEqual(summary["train_excluded_images"], 1)
        self.assertFalse((self.output / "train/labels/pig.txt").exists())
        record = next(record for record in load_json(self.output / "manifest.json")["records"]
                      if record["split"] == "train")
        self.assertIn("-0.004", record["original_label_text"])
        validate_prepared(self.output)

    def test_metadata_and_target_mutations_are_rejected(self) -> None:
        self.run_prepare()
        path = self.output / "data.yaml"
        original = path.read_text(encoding="utf-8")
        for before, after in (("path: ", "path: ../original # "), ("train: train/images", "train: ../source/train/images"),
                              ("val: valid/images", "val: train/images"), ("test: test/images", "test: valid/images"),
                              ("nc: 1", "nc: 99"), ("kpt_shape: [3, 3]", "kpt_shape: [13, 3]")):
            with self.subTest(before=before):
                path.write_text(original.replace(before, after), encoding="utf-8")
                with self.assertRaises(PreparationError):
                    validate_prepared(self.output)
        path.write_text(original, encoding="utf-8")
        label = self.output / "train/labels/pig.txt"
        label.write_text(label.read_text().replace("0.40000", "0.4"), encoding="utf-8")
        with self.assertRaises(PreparationError):
            validate_prepared(self.output)

    def test_source_hardlink_rejected_even_when_bytes_match(self) -> None:
        self.run_prepare()
        image = self.output / "train/images/pig.jpg"
        image.unlink()
        image.hardlink_to(self.source / "train/images/pig.jpg")
        with self.assertRaisesRegex(PreparationError, "aliases original"):
            validate_prepared(self.output)


if __name__ == "__main__":
    unittest.main()
