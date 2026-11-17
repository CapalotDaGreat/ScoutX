# Public GitHub components: rights and use decisions (verified 2026-11-17)

Source shortlist: owner's `C:\ZLI\M335\ScoutX\.local\public-github-analysis-research-2026-11-17.md`. Each licence below was
re-read from the repository's own licence file at the stated commit (`git ls-remote` HEAD + raw licence file). This is
an engineering record, not legal advice; the "unresolved" column is the question a lawyer would need to answer.

| Repository @ commit | Code licence (file) | Models / data | Key dependencies | Decision | Unresolved |
|---|---|---|---|---|---|
| TrackingLaboratory/tracklab @ `5767e86c32a6` | MIT (`LICENSE`) | Plugins and checkpoints vary per module | **`ultralytics` is a hard dependency (AGPL-3.0)**, pytorch_lightning, torch | **Not installed.** Its module boundaries inspired PitchProof's own adapters (export, comparison) | Using any TrackLab pipeline pulls AGPL code; would need a separate decision |
| JonathonLuiten/TrackEval @ `12c8791b303e` | MIT (`LICENSE`) | none | numpy, scipy only | **Adopted for evaluation only**, isolated checkout outside the product (`/home/claude/work/rights/trackeval-env`), with a numpy 2 compatibility shim in the runner (np.float/np.int aliases) | MIT notice must accompany any redistribution; nothing is shipped |
| SoccerNet/sn-gamestate @ `1c958345` | **GPL-3.0** (`LICENSE`) | SoccerNet data: research NDA | tracklab, many models | Architecture reference only; no code copied | Any reuse of code would make derived code GPL |
| mkoshkina/jersey-number-pipeline @ `007d54e5` | **CC BY-NC 3.0** (`license.txt`) | Hockey data on request; weights under the same NC terms | ViTPose, Centroid-ReID, PARSeq | **Methods studied, nothing used** (legibility filter, pose torso ROI, tracklet consolidation). PitchProof's own experiments use docTR PARSeq (Apache-2.0) and synthetic data | Commercial use needs permission from the authors |
| roboflow/sports @ `42c80c06` | MIT (`LICENSE`) | Notebooks use detector weights/datasets with their own terms | supervision, numpy | Not used; overlay/calibration ideas noted | Each notebook's weights/data need separate checks |
| PySport/kloppy @ `a9651eba` | BSD-3-Clause (`LICENSE`) | Provider data has its own terms | lxml (+ optional pandas) | Pattern adopted (event vs tracking separation, explicit periods/coordinates) in PitchProof's own schema; library not added | — |
| andrewRowlinson/mplsoccer @ `150be3f5` | MIT (`LICENSE`) | none | matplotlib ≥ 3.8, numpy, pandas, scipy | Not added (the app renders natively; report figures stay in app UI) | — |
| andrewRowlinson/soccerviewer @ `9758421c` | MIT (`LICENSE`) | Consumes SkillCorner data (separate terms) | — | Inspiration only (observed vs extrapolated display) | — |
| atomscott/SportsLabKit @ `9591d6db` | **GPL-3.0** (`LICENSE`) | Varies | — | Not used | Same as sn-gamestate |

Also recorded: docTR v1.1.0 (Apache-2.0) is already the PitchProof OCR runtime; its PARSeq weights are the only
recogniser weights used in experiments. Fonts used for synthetic digits: Barlow Condensed and Inter (SIL OFL 1.1),
DejaVu Sans (Bitstream Vera/DejaVu licence), Carlito (SIL OFL 1.1).
