"""ScoutX single-player tracking: follow one player through a full match video and measure them.

Stages: extract (detect people/ball, camera motion, appearance) -> tracklets (multi-person
tracking with camera-motion compensation and colour gating) -> number reading -> identity
(match-wide best chain of tracklets with number, appearance and user evidence) -> stats/report.
Run `python -m scoutx_tracker --help`.
"""

__version__ = "5.1.0"
