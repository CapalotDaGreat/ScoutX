"""Partial comparison of the two CPU profiles with the pinned harness's own compare_profiles logic
(pairs restricted to cpu-onnx vs cpu-torch; GPU profiles did not run)."""
import sys, json, inspect, textwrap
from pathlib import Path
sys.path.insert(0, 'bench')
import fp32_comparison as fc
src = inspect.getsource(fc.compare_profiles)
src = src.replace("""    pairs = [('cpu-onnx', 'cpu-torch'), ('gpu-fp16-b8', 'gpu-fp32-b8'),
             ('gpu-fp32-b8', 'gpu-fp32-b1'), ('gpu-fp32-b8', 'gpu-fp32-b8-repeat'),
             ('cpu-torch', 'gpu-fp32-b1')]""", "    pairs = [('cpu-onnx', 'cpu-torch')]")
src = src.replace("for p in PROFILES}", "for p in ('cpu-onnx', 'cpu-torch')}")
assert "pairs = [('cpu-onnx', 'cpu-torch')]" in src and "for p in ('cpu-onnx', 'cpu-torch')}" in src
ns = dict(vars(fc)); exec(src, ns)
root = Path('/home/claude/work/fp32local')
res = ns['compare_profiles'](root, ['gap1150', '3144', '1073'])
res['note'] = ('LOCAL CPU-only partial matrix (profiles 1-2 of 6) on the pinned harness, development container '
               'Python 3.13.17 / torch 2.14.1 CPU; GPU profiles 3-6 NOT run (L4 stockouts). productionApproval=false.')
(root / 'comparison_cpu_pair.json').write_text(json.dumps(res, indent=2, default=str))
print('written')
