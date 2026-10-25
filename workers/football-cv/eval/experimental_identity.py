"""Bounded local JSON resolver; synthetic evidence is not annotated accuracy."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import stat
import sys

from pydantic import ValidationError

from app.experimental_identity import ExperimentalResolverOutput, ResolverRequest, resolve

MAX_REQUEST_BYTES = 1024 * 1024


def _local_path(value: str) -> Path:
    if "://" in value or value.startswith(("\\\\", "//")):
        raise argparse.ArgumentTypeError("use a local filesystem path, not a URL or UNC path")
    return Path(value)


def _unique_object(pairs: list[tuple[str, object]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key] = value
    return result


def _invalid_constant(value: str):
    raise ValueError("nonfinite JSON constant")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    command = commands.add_parser("resolve", help="resolve bounded offline evidence JSON")
    command.add_argument("--request", type=_local_path, required=True)
    command.add_argument("--out", type=_local_path, required=True)
    args = parser.parse_args(argv)
    try:
        if os.path.lexists(args.out):
            raise ValueError("output path already exists; refusing overwrite")
        if not stat.S_ISREG(args.request.stat().st_mode):
            raise ValueError("request must be a regular local JSON file")
        with args.request.open("rb") as source:
            raw = source.read(MAX_REQUEST_BYTES + 1)
        if len(raw) > MAX_REQUEST_BYTES:
            raise ValueError("request exceeds 1 MiB")
        payload = json.loads(raw.decode("utf-8"), object_pairs_hook=_unique_object,
                             parse_constant=_invalid_constant)
        request = ResolverRequest.model_validate(payload)
        result = resolve(request)
        validated = ExperimentalResolverOutput.model_validate(result.model_dump())
        encoded = validated.model_dump_json(indent=2) + "\n"
        # Exclusive creation also rejects a destination created after the precheck.
        with args.out.open("x", encoding="utf-8", newline="\n") as destination:
            destination.write(encoded)
    except (OSError, ValueError, ValidationError, RecursionError):
        # Do not echo potentially sensitive evidence or entire validation payloads.
        print("Offline resolve failed: invalid input/output or inaccessible/existing local path.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
