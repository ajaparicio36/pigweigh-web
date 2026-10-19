"""Prepare a separate, provenance-preserving Roboflow YOLO pose dataset.

Standard library only. No training imports, remote access, or source writes.
"""
from __future__ import annotations

import argparse
import ast
from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys


class PreparationError(ValueError):
    """The source or mapping cannot safely be prepared."""


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_json(path: Path) -> dict:
    def unique_pairs(pairs: list[tuple[str, object]]) -> dict:
        result = {}
        for key, value in pairs:
            if key in result:
                raise PreparationError(f"Duplicate JSON key: {key}")
            result[key] = value
        return result
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_pairs)


def source_names(root: Path) -> list[str]:
    # Read only the literal exported class list, never execute YAML tags.
    lines = (root / "data.yaml").read_text(encoding="utf-8").splitlines()
    matches = [line.partition(":")[2].strip() for line in lines if line.startswith("names:")]
    if len(matches) != 1:
        raise PreparationError("Expected one inline source names list")
    names = ast.literal_eval(matches[0])
    if not isinstance(names, list) or not all(isinstance(name, str) for name in names):
        raise PreparationError("Invalid source names")
    if len(set(names)) != len(names):
        raise PreparationError("Duplicate source class names")
    return names


def validate_policy(policy: dict, names: list[str]) -> None:
    canonical = policy["canonical_keypoints"]
    if not canonical or len(set(canonical)) != len(canonical):
        raise PreparationError("Canonical keypoints must be unique")
    classes = policy["classes"]
    if set(classes) != set(names):
        raise PreparationError("Unknown or missing source class mapping")
    for name, entry in classes.items():
        if entry.get("status") != "verified":
            raise PreparationError(f"Unverified ordering: {name}")
        slots = entry["output_to_input"]
        if len(slots) != len(canonical) or sorted(slots) != list(range(len(canonical))):
            raise PreparationError(f"Not a complete keypoint permutation: {name}")
        if len(entry["source_keypoint_names"]) != len(canonical):
            raise PreparationError(f"Missing source keypoint names: {name}")
        if len(set(entry["source_keypoint_names"])) != len(canonical):
            raise PreparationError(f"Duplicate source keypoint names: {name}")
        masks = entry.get("masks", {})
        if set(masks) - set(canonical) or any(not reason for reason in masks.values()):
            raise PreparationError(f"Unknown or unexplained masks: {name}")
        if not entry.get("evidence"):
            raise PreparationError(f"Missing ordering evidence: {name}")
        for target, slot in zip(canonical, slots, strict=True):
            original_name = entry["source_keypoint_names"][slot]
            resolved = policy.get("aliases", {}).get(original_name, original_name)
            if target not in masks and resolved != target:
                raise PreparationError(f"Unverified semantic alias: {name}: {original_name} -> {target}")


def parse_row(row: str, keypoints: int, class_count: int) -> list[str]:
    tokens = row.split()
    if len(tokens) != 5 + 3 * keypoints:
        raise PreparationError(f"Expected {5 + 3 * keypoints} columns, got {len(tokens)}")
    try:
        numbers = [Decimal(token) for token in tokens]
    except InvalidOperation as exc:
        raise PreparationError("Nonnumeric label") from exc
    if any(not value.is_finite() for value in numbers):
        raise PreparationError("Nonfinite label")
    if numbers[0] != numbers[0].to_integral_value() or not 0 <= numbers[0] < class_count:
        raise PreparationError("Unknown class ID")
    if any(not 0 <= value <= 1 for value in numbers[1:5]) or any(value <= 0 for value in numbers[3:5]):
        raise PreparationError("Invalid bounding box")
    for index in range(keypoints):
        x, y, visibility = numbers[5 + 3 * index:8 + 3 * index]
        if visibility not in (0, 1, 2):
            raise PreparationError("Invalid visibility")
        if not 0 <= x <= 1 or not 0 <= y <= 1:
            raise PreparationError(f"Out-of-range coordinate at source slot {index}")
    return tokens


def transform_row(tokens: list[str], entry: dict, canonical: list[str]) -> tuple[str, list[dict]]:
    output = ["0", *tokens[1:5]]
    masks = []
    for name, source_slot in zip(canonical, entry["output_to_input"], strict=True):
        triplet = tokens[5 + 3 * source_slot:8 + 3 * source_slot]
        if name in entry.get("masks", {}):
            output.extend(("0", "0", "0"))
            masks.append({"keypoint": name, "source_slot": source_slot,
                          "original_triplet": triplet, "reason": entry["masks"][name]})
        else:
            output.extend(triplet)
    return " ".join(output), masks


def render_yaml(output: Path, canonical: list[str]) -> str:
    lines = [f"path: {json.dumps(output.resolve().as_posix())}", "train: train/images", "val: valid/images",
             "test: test/images", "nc: 1", "names: [pig]", f"kpt_shape: [{len(canonical)}, 3]",
             "kpt_names:", f"  0: {json.dumps(canonical)}"]
    return "\n".join(lines) + "\n"


def inspect_source(source: Path, policy: dict) -> tuple[list[dict], dict]:
    names = source_names(source)
    validate_policy(policy, names)
    canonical = policy["canonical_keypoints"]
    # Evidence and allowed exclusions bind this reviewed policy to exact local labels.
    for name, entry in policy["classes"].items():
        for evidence in entry["evidence"]:
            path = source / evidence["label"]
            if not path.is_file() or digest(path) != evidence["sha256"]:
                raise PreparationError(f"Ordering evidence changed: {name}: {path}")
            image_path = source / evidence["image"]
            if not image_path.is_file() or digest(image_path) != evidence["image_sha256"]:
                raise PreparationError(f"Reviewed image changed: {name}: {image_path}")
    exclusions = policy.get("excluded_labels", {})
    for relative, exclusion in exclusions.items():
        path = source / relative
        if not path.is_file() or digest(path) != exclusion["sha256"] or not exclusion.get("reason"):
            raise PreparationError(f"Exclusion changed or unexplained: {relative}")
    records = []
    counts: Counter = Counter()
    seen_image_hashes: dict[str, str] = {}
    for split in ("train", "valid", "test"):
        label_paths = {path.stem: path for path in (source / split / "labels").glob("*.txt")}
        image_paths = {}
        for path in (source / split / "images").iterdir():
            if path.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                raise PreparationError(f"Unexpected image file: {path}")
            if path.stem in image_paths:
                raise PreparationError(f"Duplicate image basename: {path.stem}")
            image_paths[path.stem] = path
        if set(label_paths) != set(image_paths):
            raise PreparationError(f"Missing/orphan image or label in {split}")
        if not label_paths:
            raise PreparationError(f"Empty source split: {split}")
        for stem, label_path in sorted(label_paths.items()):
            image_path = image_paths[stem]
            image_hash = digest(image_path)
            if image_hash in seen_image_hashes and seen_image_hashes[image_hash] != split:
                raise PreparationError(f"Exact cross-split image duplicate: {image_path}")
            seen_image_hashes[image_hash] = split
            relative = label_path.relative_to(source).as_posix()
            original_text = label_path.read_text(encoding="utf-8")
            original_rows = original_text.splitlines()
            record = {"split": split, "source_image": image_path.relative_to(source).as_posix(),
                      "source_label": relative, "source_image_sha256": image_hash,
                      "source_label_sha256": digest(label_path), "objects": [],
                      "original_label_text": original_text}
            if relative in exclusions:
                record["excluded_reason"] = exclusions[relative]["reason"]
                for row_index, row in enumerate(original_rows):
                    tokens = row.split()
                    source_class_id = int(tokens[0])
                    source_class = names[source_class_id]
                    weight_match = re.fullmatch(r"(\d+)(?:KG_Top|_TOP|_top|-TOP|_side)", source_class)
                    if not weight_match:
                        raise PreparationError(f"Unrecognized excluded scale-weight class: {source_class}")
                    record["objects"].append({"row_index": row_index, "source_class_id": source_class_id,
                        "source_weight_class": source_class, "scale_weight_kg": weight_match[1],
                        "original_tokens": tokens, "excluded_reason": record["excluded_reason"]})
                counts[f"{split}_excluded_images"] += 1
                counts[f"{split}_excluded_objects"] += len(original_rows)
            else:
                if not original_rows:
                    raise PreparationError(f"Empty label: {label_path}")
                prepared_rows = []
                for row_index, row in enumerate(original_rows):
                    tokens = parse_row(row, len(canonical), len(names))
                    source_class_id = int(Decimal(tokens[0]))
                    source_class = names[source_class_id]
                    entry = policy["classes"][source_class]
                    prepared, masks = transform_row(tokens, entry, canonical)
                    weight_match = re.fullmatch(r"(\d+)(?:KG_Top|_TOP|_top|-TOP|_side)", source_class)
                    if not weight_match:
                        raise PreparationError(f"Unrecognized scale-weight class: {source_class}")
                    record["objects"].append({"row_index": row_index, "source_class_id": source_class_id,
                        "source_weight_class": source_class, "scale_weight_kg": weight_match[1],
                        "original_tokens": tokens, "output_to_input": entry["output_to_input"],
                        "prepared_tokens": prepared.split(), "masks": masks})
                    prepared_rows.append(prepared)
                    counts[f"{split}_objects"] += 1
                    counts[f"{split}_masked_points"] += len(masks)
                record["prepared_label_text"] = "\n".join(prepared_rows) + "\n"
                counts[f"{split}_images"] += 1
            records.append(record)
    return records, dict(sorted(counts.items()))


def prepare(source: Path, output: Path, config_path: Path, view: str, write: bool) -> dict:
    source, output = source.resolve(), output.resolve()
    if source == output or source in output.parents or output in source.parents:
        raise PreparationError("Output must be separate from source, never an ancestor or child")
    if output.exists():
        raise PreparationError("Output already exists; choose a new directory")
    config = load_json(config_path)
    policy = config["views"][view]
    records, summary = inspect_source(source, policy)
    report = {"schema_version": 1, "view": view, "source_root": str(source),
              "source_yaml_sha256": digest(source / "data.yaml"), "policy_sha256": digest(config_path),
              "canonical_keypoints": policy["canonical_keypoints"], "summary": summary,
              "source_class_names": source_names(source), "paired_capture_ids": None,
              "policy": policy, "records": records}
    if write:
        # Finish all checks before creating the destination. Copy bytes, never hardlink:
        # future trainer JPEG repair/cache writes must not touch source images.
        output.mkdir(parents=True, exist_ok=False)
        for split in ("train", "valid", "test"):
            (output / split / "images").mkdir(parents=True)
            (output / split / "labels").mkdir(parents=True)
        for record in records:
            if digest(source / record["source_label"]) != record["source_label_sha256"]:
                raise PreparationError(f"Source label changed during preparation: {record['source_label']}")
            if "excluded_reason" in record:
                continue
            image_relative = record["source_image"]
            shutil.copyfile(source / image_relative, output / image_relative)
            if digest(output / image_relative) != record["source_image_sha256"]:
                raise PreparationError(f"Image changed while copying: {image_relative}")
            (output / record["source_label"]).write_text(record["prepared_label_text"], encoding="utf-8")
        (output / "data.yaml").write_text(render_yaml(output, policy["canonical_keypoints"]), encoding="utf-8")
        (output / "manifest.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        (output / "PREPARATION_COMPLETE").write_text("Validate manifest before training. Flips disabled.\n", encoding="utf-8")
    return summary


def validate_prepared(output: Path) -> dict:
    """Recompute every target from originals and the recorded policy; check both trees."""
    if not (output / "PREPARATION_COMPLETE").is_file():
        raise PreparationError("Preparation did not complete")
    manifest = load_json(output / "manifest.json")
    source = Path(manifest["source_root"])
    if output.resolve() == source.resolve() or source.resolve() in output.resolve().parents:
        raise PreparationError("Prepared output overlaps source")
    for path in output.rglob("*"):
        if path.is_symlink() or path.is_junction():
            raise PreparationError(f"Prepared output contains a filesystem link: {path}")
    if digest(source / "data.yaml") != manifest["source_yaml_sha256"]:
        raise PreparationError("Source YAML changed")
    records, summary = inspect_source(source, manifest["policy"])
    if records != manifest["records"] or summary != manifest["summary"]:
        raise PreparationError("Manifest or source provenance changed")
    expected_files = {"data.yaml", "manifest.json", "PREPARATION_COMPLETE"}
    for record in records:
        if "excluded_reason" in record:
            continue
        expected_files.update((record["source_image"], record["source_label"]))
        for relative in (record["source_image"], record["source_label"]):
            if (output / relative).samefile(source / relative):
                raise PreparationError(f"Prepared file aliases original source: {relative}")
        if digest(output / record["source_image"]) != record["source_image_sha256"]:
            raise PreparationError(f"Prepared image bytes changed: {record['source_image']}")
        if (output / record["source_label"]).read_text(encoding="utf-8") != record["prepared_label_text"]:
            raise PreparationError(f"Prepared label differs from exact reviewed transform: {record['source_label']}")
    actual_files = {path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()}
    # Run validation before training; trainers may add cache files afterward.
    if actual_files != expected_files:
        raise PreparationError("Unexpected or missing files in prepared dataset")
    yaml_text = (output / "data.yaml").read_text(encoding="utf-8")
    if yaml_text != render_yaml(output, manifest["canonical_keypoints"]):
        raise PreparationError("Prepared YAML metadata changed")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--view", required=True, choices=("top", "side"))
    parser.add_argument("--config", type=Path, default=Path(__file__).parent / "config/roboflow-pose-v1.json")
    parser.add_argument("--write", action="store_true", help="Create a new copy only after all checks pass")
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.source, args.output, args.config, args.view, args.write), indent=2))
    except (PreparationError, KeyError, OSError, SyntaxError, ValueError) as exc:
        print(f"Preparation rejected: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
