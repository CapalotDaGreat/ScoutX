"""Discovery checkpoints must survive an interrupted write."""

from __future__ import annotations

import json
import os
from pathlib import Path


def test_discovery_checkpoint_write_is_atomic(tmp_path: Path):
    disc_file = tmp_path / "discovery.json"
    payload = {"fingerprint": "abc", "sightings": [], "record": {"status": "measured"}}
    tmp = disc_file.with_name(f"{disc_file.name}.tmp-{os.getpid()}")
    tmp.write_text(json.dumps(payload))
    os.replace(tmp, disc_file)
    assert json.loads(disc_file.read_text()) == payload
    assert not tmp.exists()
