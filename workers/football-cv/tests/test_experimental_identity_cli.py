"""Subprocess integration using synthetic JSON only, never footage accuracy."""
import json
from pathlib import Path
import subprocess
import sys

import pytest

from app.experimental_identity import ExperimentalResolverOutput
from test_experimental_identity import body

WORKER = Path(__file__).resolve().parents[1]
LIMIT = 1024 * 1024


def invoke(request, output, *extra):
    return subprocess.run(
        [sys.executable, "-m", "eval.experimental_identity", "resolve",
         "--request", str(request), "--out", str(output), *extra],
        cwd=WORKER, capture_output=True, text=True, timeout=20,
    )


def fixture_paths(tmp_path, raw=None):
    request, output = tmp_path / "synthetic-request.json", tmp_path / "synthetic-result.json"
    request.write_bytes(json.dumps(body()).encode() if raw is None else raw)
    return request, output


def test_synthetic_cli_resolves_and_validates_output(tmp_path):
    request, output = fixture_paths(tmp_path)
    result = invoke(request, output)
    assert result.returncode == 0, result.stderr
    value = ExperimentalResolverOutput.model_validate_json(output.read_text())
    assert value.experimental is True
    assert value.observations[0].state == "CONFIRMED_OBSERVATION"
    assert value.confirmedCoverageSec == 0
    assert value.ownedCoverageSec == 10
    assert value.uncertainWindows[0].state == "UNKNOWN"
    assert request.read_bytes() == json.dumps(body()).encode()


@pytest.mark.parametrize("raw", [b"{", b"[]", b"{}", b"null", b"\xff", b'{"x":NaN}',
                                b'{"x":1,"x":2}', b"[" * 2000])
def test_invalid_json_or_schema_never_creates_output(tmp_path, raw):
    request, output = fixture_paths(tmp_path, raw)
    assert invoke(request, output).returncode != 0
    assert not output.exists()


@pytest.mark.parametrize("mutation", ["extra", "scope", "nan"])
def test_invalid_evidence_never_creates_output(tmp_path, mutation):
    payload = body()
    if mutation == "extra":
        payload["gallery"] = []
    elif mutation == "scope":
        payload["anchors"][0]["scope"]["generation"] += 1
    else:
        payload["anchors"][0]["timestampSec"] = float("nan")
    request, output = fixture_paths(tmp_path, json.dumps(payload).encode())
    assert invoke(request, output).returncode != 0
    assert not output.exists()


def test_exact_one_mib_allowed_but_one_byte_over_rejected(tmp_path):
    raw = json.dumps(body()).encode()
    request, output = fixture_paths(tmp_path, raw + b" " * (LIMIT - len(raw)))
    assert invoke(request, output).returncode == 0
    too_large = tmp_path / "too-large-result.json"
    request.write_bytes(request.read_bytes() + b" ")
    assert invoke(request, too_large).returncode != 0
    assert not too_large.exists()


@pytest.mark.parametrize("kind", ["file", "directory", "same-input"])
def test_existing_output_is_never_overwritten(tmp_path, kind):
    request, output = fixture_paths(tmp_path)
    if kind == "file":
        output.write_bytes(b"preserve me")
    elif kind == "directory":
        output.mkdir()
    else:
        output = request
    original = output.read_bytes() if output.is_file() else None
    assert invoke(request, output).returncode != 0
    if original is not None:
        assert output.read_bytes() == original
    else:
        assert output.is_dir()


def test_missing_input_or_output_parent_fails_without_creating_paths(tmp_path):
    request, output = fixture_paths(tmp_path)
    assert invoke(tmp_path / "missing.json", output).returncode != 0
    assert not output.exists()
    missing_parent = tmp_path / "absent" / "result.json"
    assert invoke(request, missing_parent).returncode != 0
    assert not missing_parent.parent.exists()


@pytest.mark.parametrize("path", ["https://example.invalid/request.json", "//server/share/request.json"])
def test_nonlocal_path_rejected(tmp_path, path):
    output = tmp_path / "result.json"
    assert invoke(path, output).returncode != 0
    assert not output.exists()


def test_no_evaluate_subcommand(tmp_path):
    result = subprocess.run([sys.executable, "-m", "eval.experimental_identity", "evaluate"],
                            cwd=WORKER, capture_output=True, text=True, timeout=20)
    assert result.returncode != 0


def test_invalid_resolver_output_is_validated_before_creation(tmp_path):
    request, output = fixture_paths(tmp_path)
    script = (
        "import sys; import eval.experimental_identity as cli; "
        "from app.experimental_identity import ExperimentalResolverOutput; "
        "cli.resolve=lambda request: ExperimentalResolverOutput.model_construct(ownedCoverageSec=-1.0); "
        "sys.exit(cli.main(sys.argv[1:]))"
    )
    result = subprocess.run([sys.executable, "-c", script, "resolve", "--request", str(request),
                             "--out", str(output)], cwd=WORKER, capture_output=True, text=True, timeout=20)
    assert result.returncode != 0
    assert not output.exists()
