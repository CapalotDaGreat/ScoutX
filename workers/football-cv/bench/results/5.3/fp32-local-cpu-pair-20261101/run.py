import subprocess, sys, json, time, os
from pathlib import Path
sys.path.insert(0, 'bench')
import fp32_comparison as fc
O = Path('/home/claude/work/fp32local'); V = '/home/claude/work/ref/IMG_4809_proxy_10fps.exact.mp4'
os.environ['SCOUTX_WEIGHTS_DIR'] = '/home/claude/work/det'
corpus = O / 'ocr_corpus.json'; log = []
for profile, only in (('cpu-onnx', False), ('cpu-onnx', True), ('cpu-torch', False)):
    cmd = [sys.executable, 'bench/fp32_comparison.py', '--profile', profile, '--video', V, '--out-dir', str(O / profile),
           '--windows', 'gap1150', '3144', '1073']
    if corpus.exists(): cmd += ['--corpus', str(corpus)]
    if only: cmd += ['--ocr-only']
    t = time.time()
    with open(O / (profile + ('-corpus' if only else '') + '.log'), 'w') as s:
        rc = subprocess.run(cmd, env=fc.profile_env(profile), stdout=s, stderr=subprocess.STDOUT).returncode
    log.append({'profile': profile, 'ocrOnly': only, 'rc': rc, 'wallSec': round(time.time() - t, 1)}); print(log[-1], flush=True)
    if rc: break
    if profile == 'cpu-onnx' and not only: fc.freeze_corpus(O / profile, corpus)
(O / 'local_session.json').write_text(json.dumps(log, indent=2))
