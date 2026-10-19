"""Validate the prepared dataset, exact triplets, and unchanged source provenance."""
from pathlib import Path
import argparse
import json
import sys

from prepare_pose import PreparationError, validate_prepared


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(validate_prepared(args.output), indent=2))
    except (PreparationError, KeyError, OSError, ValueError) as exc:
        print(f"Validation rejected: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
