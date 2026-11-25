"""Experimental canonical video preparation. Default off.

Production still sends the uploaded file to discovery and extraction. The only gate-passing
run used a separate 10 fps proxy. `plan_preparation` describes the gap. `open_working_stream`
decodes when an experimental harness asks it to. Neither one changes `extract()`.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
from dataclasses import dataclass

from scoutx_tracker.colour import ColourInfo, decode_command, working_space_filter

PREP_ENV = "SCOUTX_CANONICAL_PREP"
ANALYSIS_RATES = (5, 8, 10)
MODES = ("direct", "persistent_proxy", "streaming_rate", "hardware_prepared")
UNMEASURED_CONSEQUENCES = (
    "distant_players",
    "identity_recovery",
    "jersey_recognition",
    "short_ball_contacts",
    "physical_metrics",
)


@dataclass(frozen=True)
class SourceDescriptor:
    width: int
    height: int
    fps: float
    duration_sec: float
    codec: str = "hevc"
    pix_fmt: str = "yuv420p10le"
    transfer: str = "arib-std-b67"
    primaries: str = "bt2020"
    matrix: str = "bt2020nc"
    color_range: str = "tv"
    rotation_deg: int = 0
    container: str = "mov"
    sha256: str = ""
    camera_class: str = "unspecified"

    def colour(self) -> ColourInfo:
        return ColourInfo(
            width=self.width, height=self.height, pix_fmt=self.pix_fmt, transfer=self.transfer,
            primaries=self.primaries, matrix=self.matrix, range=self.color_range,
            fps=self.fps, duration=self.duration_sec,
        )


@dataclass(frozen=True)
class PreparationPlan:
    enabled: bool
    requested_mode: str
    applied_mode: str
    accuracy_validated: bool
    analysis_fps: float | None
    decoder: str
    working_filter: str
    filter_applied: bool
    preserves_presentation_timestamps: bool
    index_subsample_aligned: bool
    materialises_file: bool
    proxy_codec_approved: bool
    executed: bool
    command: tuple[str, ...]
    consequences: dict[str, str]
    notes: tuple[str, ...]


def prep_enabled(enabled: bool | None = None) -> bool:
    if enabled is None:
        return os.environ.get(PREP_ENV) == "1"
    return bool(enabled)


def index_subsample_aligned(source_fps: float, analysis_fps: float) -> bool:
    """True only when taking every Nth source frame lands on the analysis rate.

    30/10 is aligned. 29.997/10 is not: the original IMG_4809 rate must be mapped by
    presentation time, not by an integer frame step.
    """
    if source_fps <= 0 or analysis_fps <= 0 or analysis_fps > source_fps:
        return False
    ratio = source_fps / analysis_fps
    return abs(ratio - round(ratio)) < 1e-6


def source_time_for_working_frame(index: int, analysis_fps: float) -> float:
    if index < 0 or analysis_fps <= 0:
        raise ValueError("working-frame time needs a non-negative index and a positive rate")
    return index / analysis_fps


def canonical_rate(analysis_fps: float) -> int:
    if isinstance(analysis_fps, bool) or not isinstance(analysis_fps, (int, float)):
        raise ValueError(f"analysis rate {analysis_fps!r} is not one of {ANALYSIS_RATES}")
    for rate in ANALYSIS_RATES:
        if analysis_fps == rate:
            return rate
    raise ValueError(f"analysis rate {analysis_fps} is not one of {ANALYSIS_RATES}")


def rate_consequences(analysis_fps: float) -> dict[str, str]:
    canonical_rate(analysis_fps)
    return {name: "unmeasured" for name in UNMEASURED_CONSEQUENCES}


def _check_source(source: SourceDescriptor) -> None:
    if source.width <= 0 or source.height <= 0 or source.fps <= 0 or source.duration_sec <= 0:
        raise ValueError("source needs positive width, height, frame rate and duration")
    if source.rotation_deg not in (0, 90, 180, 270):
        raise ValueError("rotation must be 0, 90, 180 or 270 degrees")
    if source.camera_class not in ("unspecified", "panoramic", "touchline", "broadcast"):
        raise ValueError("unknown camera class")


def _direct(source: SourceDescriptor, requested: str, applied: bool) -> PreparationPlan:
    notes = [
        "Production path: the upload is decoded by extract() with its current default decoder.",
        "The gate-passing run used a 10 fps proxy inside container 7e8d4872. This plan does not reproduce that run.",
    ]
    if requested != "direct":
        notes.append(f"{PREP_ENV} is off, so requested mode {requested!r} was not applied.")
    return PreparationPlan(
        enabled=applied and requested == "direct",
        requested_mode=requested,
        applied_mode="direct",
        accuracy_validated=False,
        analysis_fps=None,
        decoder="cv2",
        working_filter=working_space_filter(source.colour()),
        filter_applied=False,
        preserves_presentation_timestamps=True,
        index_subsample_aligned=True,
        materialises_file=False,
        proxy_codec_approved=False,
        executed=False,
        command=(),
        consequences={},
        notes=tuple(notes),
    )


def streaming_command(src: str, source: SourceDescriptor, start: float, end: float, analysis_fps: float,
                      hwaccel: str = "") -> list[str]:
    """ffmpeg arguments for a rate-converted working-space stream. Nothing is executed."""
    rate = canonical_rate(analysis_fps)
    return decode_command(src, start, end, rate, source.colour(), hwaccel=hwaccel)


def plan_preparation(source: SourceDescriptor, mode: str = "direct", analysis_fps: float | None = None,
                     *, enabled: bool | None = None, src: str = "", output_path: str = "",
                     hwaccel: str = "", start: float = 0.0, end: float | None = None) -> PreparationPlan:
    _check_source(source)
    if mode not in MODES:
        raise ValueError(f"unknown preparation mode {mode!r}")
    if source.codec not in ("h264", "hevc") and mode != "direct":
        raise ValueError("experimental preparation is only defined for h264 and hevc")
    on = prep_enabled(enabled)
    if not on or mode == "direct":
        return _direct(source, mode, on)
    try:
        rate = canonical_rate(analysis_fps if analysis_fps is not None else -1)
    except ValueError:
        raise ValueError("an experimental mode needs an analysis rate of 5, 8 or 10 fps") from None
    aligned = index_subsample_aligned(source.fps, rate)
    notes = [
        "Experimental. Accuracy is not validated. The default extractor is unchanged.",
        "5, 8 and 10 fps are candidates. None is selected: the listed consequences are unmeasured.",
        "Presentation timestamps address working frames. An integer frame step is not the mapping.",
    ]
    if not aligned:
        notes.append(
            f"Source {source.fps} fps is not an integer multiple of {rate:g} fps. "
            "Resampling must follow presentation time."
        )
    if source.rotation_deg in (90, 270):
        notes.append("Display axes swap for this rotation. The source samples stay addressable for crops.")
    command: tuple[str, ...] = ()
    materialise = mode == "persistent_proxy"
    if mode == "streaming_rate":
        if src:
            command = tuple(streaming_command(src, source, start, end if end is not None else source.duration_sec, rate))
        else:
            notes.append("No source path was given, so the streaming command was not built.")
    elif mode == "persistent_proxy":
        notes.append("A proxy file is not written by this planner. No output codec is approved.")
        if output_path:
            notes.append("An output path was supplied and ignored. Persistent materialisation is not implemented.")
    elif mode == "hardware_prepared":
        notes.append("Hardware decode is described only. It was not executed and needs separate authorisation.")
        if not hwaccel:
            notes.append("No hardware device was named.")
        elif src:
            command = tuple(streaming_command(
                src, source, start, end if end is not None else source.duration_sec, rate, hwaccel=hwaccel))
    return PreparationPlan(
        enabled=True,
        requested_mode=mode,
        applied_mode=mode,
        accuracy_validated=False,
        analysis_fps=rate,
        decoder="ffmpeg",
        working_filter=working_space_filter(source.colour()),
        filter_applied=True,
        preserves_presentation_timestamps=True,
        index_subsample_aligned=aligned,
        materialises_file=materialise,
        proxy_codec_approved=False,
        executed=False,
        command=command,
        consequences=rate_consequences(int(rate)),
        notes=tuple(notes),
    )


def presentation_indices(source_fps: float, frame_count: int, analysis_fps: float) -> list[tuple[int, float, int]]:
    """Working frames addressed by presentation time.

    Each entry is `(working_index, presentation_sec, source_index)`. The source index is the
    frame whose own presentation time is nearest. It is not an integer stride. At 29.997 fps
    that stride drifts away from the presentation grid.
    """
    rate = canonical_rate(analysis_fps)
    if source_fps <= 0 or frame_count <= 0:
        raise ValueError("presentation mapping needs a positive source rate and at least one frame")
    duration = frame_count / source_fps
    chosen: list[tuple[int, float, int]] = []
    working = 0
    while True:
        presentation = working / rate
        if presentation >= duration - 1e-12:
            break
        source_index = int(round(presentation * source_fps))
        source_index = min(max(source_index, 0), frame_count - 1)
        chosen.append((working, presentation, source_index))
        working += 1
        if working > frame_count * rate:
            break
    return chosen


def integer_stride_indices(source_fps: float, frame_count: int, analysis_fps: float) -> list[int]:
    step = max(1, int(round(source_fps / analysis_fps)))
    return list(range(0, frame_count, step))


class StreamError(RuntimeError):
    """The experimental decoder failed before producing a usable stream."""


class WorkingStream:
    """One decoded working frame at a time. Bytes are not accumulated into a recording."""

    def __init__(self) -> None:
        self.frames_yielded = 0
        self.decode_sec = 0.0
        self.error = ""
        self.cancelled = False
        self.executed = False

    def close(self) -> None:
        return None

    def cancel(self) -> None:
        self.cancelled = True

    def __enter__(self) -> "WorkingStream":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def __iter__(self) -> "WorkingStream":
        return self

    def __next__(self) -> tuple[int, float, object]:
        raise StopIteration


class MemoryStream(WorkingStream):
    def __init__(self, frames: list, times: list[float]) -> None:
        super().__init__()
        if len(frames) != len(times):
            raise ValueError("each memory frame needs one presentation time")
        self._frames = frames
        self._times = times
        self._index = 0
        self.executed = True

    def __next__(self) -> tuple[int, float, object]:
        if self.cancelled or self._index >= len(self._frames):
            raise StopIteration
        started = time.perf_counter()
        item = self._index, self._times[self._index], self._frames[self._index]
        self.decode_sec += time.perf_counter() - started
        self._index += 1
        self.frames_yielded += 1
        return item


class FfmpegWorkingStream(WorkingStream):
    """Raw BGR frames from one ffmpeg process. The pipe holds at most the bytes of one frame."""

    def __init__(self, command: list[str], width: int, height: int, analysis_fps: float) -> None:
        super().__init__()
        if width <= 0 or height <= 0 or analysis_fps <= 0:
            raise ValueError("ffmpeg stream needs positive dimensions and a frame rate")
        self._fps = analysis_fps
        self._frame_bytes = width * height * 3
        self._width = width
        self._height = height
        self._stderr = bytearray()
        self._proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.executed = True
        self._drain = threading.Thread(target=self._read_stderr, name="scoutx-ffmpeg-stderr", daemon=True)
        self._drain.start()

    def _read_stderr(self) -> None:
        pipe = self._proc.stderr
        if pipe is None:
            return
        while True:
            chunk = pipe.read(1024)
            if not chunk:
                break
            if len(self._stderr) < 8192:
                self._stderr.extend(chunk)

    def close(self) -> None:
        if self._proc.poll() is None:
            self._proc.kill()
        try:
            self._proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._proc.kill()
        if self._drain.is_alive():
            self._drain.join(timeout=1)
        code = self._proc.returncode
        if code not in (0, None, -9) and not self.cancelled and self.frames_yielded == 0:
            detail = self._stderr.decode("utf-8", "replace").strip()
            self.error = detail or f"ffmpeg exited {code}"

    def __next__(self) -> tuple[int, float, object]:
        import numpy as np  # noqa: PLC0415

        if self.cancelled:
            self.close()
            raise StopIteration
        pipe = self._proc.stdout
        if pipe is None:
            raise StreamError("ffmpeg stdout is closed")
        started = time.perf_counter()
        body = bytearray()
        while len(body) < self._frame_bytes:
            chunk = pipe.read(self._frame_bytes - len(body))
            if not chunk:
                break
            body.extend(chunk)
        self.decode_sec += time.perf_counter() - started
        if len(body) < self._frame_bytes:
            self.close()
            if self.error and self.frames_yielded == 0:
                raise StreamError(self.error)
            raise StopIteration
        frame = np.frombuffer(body, dtype=np.uint8).reshape(self._height, self._width, 3).copy()
        index = self.frames_yielded
        self.frames_yielded += 1
        return index, index / self._fps, frame


class OpenCvWorkingStream(WorkingStream):
    """Source-rate OpenCV decode. This is the experimental view of the current extractor default."""

    def __init__(self, path: str, end: float | None = None) -> None:
        super().__init__()
        import cv2  # noqa: PLC0415

        self._end = end
        self._cap = cv2.VideoCapture(path)
        if not self._cap.isOpened():
            raise StreamError(f"OpenCV could not open {path}")
        self._fps = float(self._cap.get(cv2.CAP_PROP_FPS) or 0.0)
        if self._fps <= 0:
            self._cap.release()
            raise StreamError("OpenCV reported a non-positive frame rate")
        self.executed = True

    def close(self) -> None:
        self._cap.release()

    def __next__(self) -> tuple[int, float, object]:
        if self.cancelled:
            self.close()
            raise StopIteration
        started = time.perf_counter()
        ok, frame = self._cap.read()
        self.decode_sec += time.perf_counter() - started
        if not ok:
            self.close()
            raise StopIteration
        presentation = self.frames_yielded / self._fps
        if self._end is not None and presentation >= self._end:
            self.close()
            raise StopIteration
        index = self.frames_yielded
        self.frames_yielded += 1
        return index, presentation, frame


def open_working_stream(source: SourceDescriptor, *, enabled: bool, mode: str = "direct",
                        analysis_fps: float | None = None, path: str = "",
                        frames: list | None = None, end: float | None = None) -> WorkingStream:
    """Open the stream the experimental harness will actually read.

    Disabled preparation always yields the source rate. Enabled `streaming_rate` yields the
    requested analysis rate. A persistent proxy is refused because no codec is approved.
    """
    _check_source(source)
    if mode == "persistent_proxy":
        raise StreamError("no persistent proxy codec is approved")
    if mode == "hardware_prepared":
        raise StreamError("hardware decode is not executed from this stream")
    if not enabled or mode == "direct":
        if frames is not None:
            times = [index / source.fps for index in range(len(frames))]
            return MemoryStream(list(frames), times)
        if not path:
            raise StreamError("the direct decoder needs a source path or in-memory frames")
        return OpenCvWorkingStream(path, end)
    try:
        rate = canonical_rate(analysis_fps if analysis_fps is not None else -1)
    except ValueError:
        raise StreamError("streaming preparation needs an analysis rate of 5, 8 or 10 fps") from None
    if frames is not None:
        chosen = presentation_indices(source.fps, len(frames), rate)
        return MemoryStream(
            [frames[index] for _, _, index in chosen],
            [presentation for _, presentation, _ in chosen],
        )
    if not path:
        raise StreamError("the streaming decoder needs a source path or in-memory frames")
    command = streaming_command(path, source, 0.0, end if end is not None else source.duration_sec, rate)
    return FfmpegWorkingStream(command, source.width, source.height, rate)
