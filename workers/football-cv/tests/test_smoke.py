import pytest

from eval.smoke import parse_args


def arguments(tmp_path):
    source = tmp_path / "match.mp4"
    source.touch()
    return ["--input", str(source), "--out", str(tmp_path / "result.json"),
            "--start", "240", "--end", "245", "--jersey-number", "8",
            "--kit-primary-color", "orange", "--authorize-local-evaluation"]


def test_explicit_target_does_not_reuse_previous_player(tmp_path):
    args = parse_args(arguments(tmp_path))
    assert args.jersey_number == "8"
    assert args.kit_primary_color == "orange"
    assert args.kit_secondary_color == ""


@pytest.mark.parametrize("flag,value", [
    ("--start", "nan"), ("--end", "inf"), ("--end", "256"),
    ("--start", "-1"), ("--end", "240"), ("--cpu-threads", "9"),
    ("--jersey-number", "100"), ("--jersey-number", "\u0668"),
    ("--kit-primary-color", " "), ("--kit-primary-color", "x" * 41),
    ("--kit-primary-color", "orange\nwhite"),
    ('--fps', 'nan'), ('--fps', '0'), ('--fps', '6'),
])
def test_rejects_invalid_configuration(tmp_path, flag, value):
    argv = arguments(tmp_path)
    if flag in argv:
        argv[argv.index(flag) + 1] = value
    else:
        argv.extend([flag, value])
    with pytest.raises(SystemExit):
        parse_args(argv)


@pytest.mark.parametrize("same_as_input", [False, True])
def test_preserves_existing_files(tmp_path, same_as_input):
    argv = arguments(tmp_path)
    output = tmp_path / ("match.mp4" if same_as_input else "result.json")
    output.write_text("preserve", encoding="utf-8")
    argv[argv.index("--out") + 1] = str(output)
    with pytest.raises(SystemExit):
        parse_args(argv)
    assert output.read_text(encoding="utf-8") == "preserve"


def test_requires_explicit_jersey(tmp_path):
    argv = arguments(tmp_path)
    index = argv.index("--jersey-number")
    del argv[index:index + 2]
    with pytest.raises(SystemExit):
        parse_args(argv)


def test_requires_local_evaluation_authorization(tmp_path):
    argv = arguments(tmp_path)
    argv.remove('--authorize-local-evaluation')
    with pytest.raises(SystemExit):
        parse_args(argv)


def test_smoke_initializes_only_cached_cpu_models(tmp_path, monkeypatch):
    import sys
    from types import SimpleNamespace
    from eval import smoke
    from app import backends
    calls = []
    for key in ('HF_HUB_OFFLINE', 'TRANSFORMERS_OFFLINE', 'CUDA_VISIBLE_DEVICES'):
        monkeypatch.setenv(key, '')
    monkeypatch.setattr(sys, 'argv', ['smoke', *arguments(tmp_path)])
    monkeypatch.setitem(sys.modules, 'torch', SimpleNamespace(set_num_threads=lambda _: None,
                        set_num_interop_threads=lambda _: None))
    def cached(*args, **kwargs):
        calls.append(kwargs)
        raise RuntimeError('stop before inference')
    monkeypatch.setattr(backends, 'default_components', cached)
    with pytest.raises(RuntimeError, match='stop before inference'):
        smoke.main()
    assert calls == [{'local_only': True, 'cpu': True}]
    assert not (tmp_path / 'result.json').exists()
