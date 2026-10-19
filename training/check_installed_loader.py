"""CPU-only compatibility check with the user's existing Ultralytics loader.

No model, CUDA API, training, font downloads, or label-cache persistence. The
loader may repair corrupt JPEGs in the prepared copy; revalidate bytes afterward.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from unittest.mock import patch

from prepare_pose import load_json, validate_prepared


def keep_cache_version(_prefix: str, _path: Path, cache: dict, version: str) -> None:
    # Native saver adds this metadata before writing. Retain its in-memory
    # behavior while suppressing persistence, rather than replacing it with a no-op.
    cache["version"] = version


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    validate_prepared(args.output)
    os.environ["CUDA_VISIBLE_DEVICES"] = "-1"
    from ultralytics import __version__
    from ultralytics.data.dataset import YOLODataset
    from ultralytics.data.utils import check_det_dataset

    manifest = load_json(args.output / "manifest.json")
    with patch("ultralytics.data.utils.check_font"), patch(
        "ultralytics.data.dataset.save_dataset_cache_file", side_effect=keep_cache_version
    ):
        data = check_det_dataset(str(args.output / "data.yaml"), autodownload=False)
        assert data["names"] == {0: "pig"}
        assert data["kpt_shape"] == [len(manifest["canonical_keypoints"]), 3]
        assert data["kpt_names"] == {0: manifest["canonical_keypoints"]}
        counts = {}
        for yaml_split, split in (("train", "train"), ("val", "valid"), ("test", "test")):
            dataset = YOLODataset(img_path=data[yaml_split], data=data, task="pose", imgsz=640,
                                  augment=False, cache=False)
            objects = sum(len(label["cls"]) for label in dataset.labels)
            assert len(dataset) == manifest["summary"][f"{split}_images"]
            assert objects == manifest["summary"][f"{split}_objects"]
            for label in dataset.labels:
                assert label["keypoints"].shape[1:] == tuple(data["kpt_shape"])
                assert (label["cls"] == 0).all()
            counts[split] = {"images": len(dataset), "objects": objects}
    validate_prepared(args.output)
    print(json.dumps({"ultralytics": __version__, "device": "CPU verification only", "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
