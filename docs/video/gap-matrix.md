# Video Intelligence Gap Matrix

| Capability | State | Real / mock | Where | Risk | Tests |
| --- | --- | --- | --- | --- | --- |
| Per-video consent and withdrawal | Done | Real | Server + app | Low | uploads, analysisPipeline, release gate |
| Source deletion by default, cited frames only, opt-in clips | Done | Real (ffmpeg clip cutter stubbed in tests) | Server | Low | analysisPipeline, release gate |
| Large-file resumable upload | Done (earlier) | Real | App + GCS | Medium (device NOT VALIDATED) | uploads |
| Files / iCloud picker, disk check | Done | Real | App | Medium (needs native build) | typecheck only |
| CRC32C per chunk, speed / ETA | **Not done** | — | — | Low (ffprobe still validates) | — |
| Persistent copy of Files picks for resume after app kill | **Not done** (cache copy only) | — | App | Medium | — |
| Mode selection, short-clip device frames | Done | Real | App + server (mirrored) | Low | unit, analysisPipeline |
| Local quality metrics (blur, light) before upload | **Not done** (preview uses duration and size) | — | — | Low | — |
| Target spec: jersey, kit, team, position | Done (reference image **not done**) | Real | App + prompt metadata | Low | aiCallables |
| Segment review, partial progress, synthesis | Done | Mocked model in tests | Server | Medium (real-footage quality unknown) | analysisPipeline |
| Possible vs validated events | Done | Real gating | Server | Low | unit, analysisPipeline |
| "Is this you?" with held-back coaching | Done | Real | Server + app | Low | aiCallables, analysisPipeline |
| Report sections, versions, archives | Done | Real | Server + app | Low | unit, aiCallables |
| Corrections / feedback on observations | **Not done** | — | — | Medium | — |
| Longitudinal trends gated at ≥ 3 analyses | **Not done** for video reports | — | — | Low | — |
| CV worker (tracking, identity, coverage) | Reference implemented | Fake components in tests | `workers/football-cv` | High until evaluated | pytest (18) |
| CV events, pitch mapping | **Not available** | — | — | — | contract rejects events unless stage complete |
| Real-footage evaluation | Harness done, **not run** | — | `workers/football-cv/eval` | High | pytest |
