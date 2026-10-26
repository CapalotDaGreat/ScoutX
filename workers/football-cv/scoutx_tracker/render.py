"""Visual outputs: annotated video, target contact sheet, highlight clips."""

from __future__ import annotations

import subprocess
from pathlib import Path

import cv2
import numpy as np

EV_COLOUR = {  # BGR
    "number": (60, 220, 60), "anchor": (60, 220, 60), "appearance": (0, 200, 255),
    "continuity": (0, 140, 255), "interpolated": (180, 180, 180), "": (255, 255, 255),
}


class FrameReader:
    """Random-ish access to global frames across the chunked proxy videos.

    With `cache_dir`, decoded frames are kept as JPEG so repeated corrections (which redraw the
    same cards and contact-sheet cells) do not seek the video again - a seek costs ~0.4 s on
    phone H.264 proxies."""

    def __init__(self, sources: list, cache_dir: str | Path | None = None) -> None:
        self.sources = sources
        self._cap = None
        self._src = None
        self._pos = -1
        self.cache = Path(cache_dir) if cache_dir else None
        if self.cache:
            self.cache.mkdir(parents=True, exist_ok=True)

    def get(self, g: int) -> np.ndarray | None:
        if self.cache is None:
            return self._decode(g)
        path = self.cache / f"{g:07d}.jpg"
        if path.exists():
            img = cv2.imread(str(path))
            if img is not None:
                return img
        img = self._decode(g)
        if img is not None:
            cv2.imwrite(str(path), img, [cv2.IMWRITE_JPEG_QUALITY, 92])
        return img

    def _decode(self, g: int) -> np.ndarray | None:
        for k, (video, first, n, start) in enumerate(self.sources):
            if first <= g < first + n:
                local = g - first
                if self._src != k:
                    if self._cap is not None:
                        self._cap.release()
                    self._cap = cv2.VideoCapture(video)
                    self._src = k
                    self._pos = -1
                fps = self._cap.get(cv2.CAP_PROP_FPS) or 10.0
                target = local + int(round(start * fps))
                if target != self._pos + 1:
                    if not (0 < target - self._pos <= 30):
                        self._cap.set(cv2.CAP_PROP_POS_FRAMES, target)
                        self._pos = target - 1
                    while self._pos + 1 < target:
                        self._cap.grab()
                        self._pos += 1
                ok, frame = self._cap.read()
                self._pos += 1
                return frame if ok else None
        return None


def fmt_time(t: float) -> str:
    return f"{int(t // 60):02d}:{int(t % 60):02d}"


def draw(frame: np.ndarray, g: int, tl, speed: np.ndarray | None, label: str, others=None) -> np.ndarray:
    img = frame.copy()
    if others is not None:
        for b in others:
            x1, y1, x2, y2 = (int(v) for v in b)
            cv2.rectangle(img, (x1, y1), (x2, y2), (200, 200, 200), 1)
    if tl.present[g]:
        x1, y1, x2, y2 = (int(v) for v in tl.boxes[g])
        col = EV_COLOUR.get(str(tl.evidence[g]), (255, 255, 255))
        cv2.rectangle(img, (x1, y1), (x2, y2), col, 3)
        cx = (x1 + x2) // 2
        tri = np.array([[cx - 12, y1 - 30], [cx + 12, y1 - 30], [cx, y1 - 10]])
        cv2.fillPoly(img, [tri], col)
        txt = label
        if speed is not None and not np.isnan(speed[g]):
            txt += f"  {speed[g] * 3.6:4.1f} km/h"
        cv2.putText(img, txt, (x1, max(20, y1 - 38)), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 5)
        cv2.putText(img, txt, (x1, max(20, y1 - 38)), cv2.FONT_HERSHEY_SIMPLEX, 0.9, col, 2)
    status = "TRACKING" if tl.present[g] else "target off camera / not identified"
    cv2.rectangle(img, (0, 0), (img.shape[1], 44), (20, 20, 20), -1)
    cv2.putText(img, f"{fmt_time(tl.times[g])}  {label}  {status}", (14, 31), cv2.FONT_HERSHEY_SIMPLEX, 0.9,
                (255, 255, 255), 2)
    return img


def write_video(frames_iter, out_path: str, fps: float, size: tuple[int, int]) -> None:
    w, h = size
    proc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{w}x{h}",
                             "-r", str(fps), "-i", "-", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
                             "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path], stdin=subprocess.PIPE)
    for f in frames_iter:
        if f.shape[1] != w or f.shape[0] != h:
            f = cv2.resize(f, (w, h), interpolation=cv2.INTER_AREA)
        proc.stdin.write(f.tobytes())
    proc.stdin.close()
    proc.wait()


def render_windows(D, tl, speed, windows: list[tuple[float, float]], out_path: str, label: str,
                   width: int = 1280) -> None:
    reader = FrameReader(D.sources)
    times = tl.times
    h = int(round(width * D.height / D.width / 2) * 2)

    def gen():
        for a, b in windows:
            g0 = int(np.searchsorted(times, a))
            g1 = int(np.searchsorted(times, b))
            for g in range(g0, min(g1, len(times))):
                fr = reader.get(g)
                if fr is not None:
                    yield draw(fr, g, tl, speed, label)

    write_video(gen(), out_path, D.fps, (width, h))


def contact_sheet(D, tl, out_path: str, n: int = 60, cols: int = 10, cell_h: int = 220, label: str = "",
                  cache_dir: str | Path | None = None) -> list[float]:
    """Grid of target crops at visible moments spread over the match (quick human verification).
    One cell per fixed time bin, on a 1 s grid where possible, so a correction that changes the
    chain elsewhere keeps the other cells (and their cached frames) unchanged."""
    reader = FrameReader(D.sources, cache_dir)
    vis = np.where(tl.present & ~tl.interpolated)[0]
    if len(vis) == 0:
        return []
    step = max(1, int(round(D.fps)))
    edges = np.linspace(0, len(tl.times), n + 1).astype(int)
    pick = []
    for a, b in zip(edges[:-1], edges[1:]):
        inside = vis[(vis >= a) & (vis < b)]
        if len(inside) == 0:
            continue
        on_grid = inside[inside % step == 0]
        pick.append(int((on_grid if len(on_grid) else inside)[0]))
    pick = np.array(pick, int)
    cells, times = [], []
    for g in sorted(set(pick.tolist())):
        fr = reader.get(int(g))
        if fr is None:
            continue
        x1, y1, x2, y2 = tl.boxes[g]
        bh = y2 - y1
        cx = (x1 + x2) / 2
        side = max(bh * 1.6, 120)
        X1, Y1 = int(max(0, cx - side / 2)), int(max(0, (y1 + y2) / 2 - side / 2))
        X2, Y2 = int(min(fr.shape[1], X1 + side)), int(min(fr.shape[0], Y1 + side))
        crop = fr[Y1:Y2, X1:X2].copy()
        cv2.rectangle(crop, (int(x1 - X1), int(y1 - Y1)), (int(x2 - X1), int(y2 - Y1)),
                      EV_COLOUR.get(str(tl.evidence[g]), (255, 255, 255)), 2)
        crop = cv2.resize(crop, (cell_h, cell_h))
        cv2.rectangle(crop, (0, 0), (cell_h, 24), (0, 0, 0), -1)
        cv2.putText(crop, f"{fmt_time(tl.times[g])} {str(tl.evidence[g])[:5]}", (4, 18), cv2.FONT_HERSHEY_SIMPLEX,
                    0.55, (255, 255, 255), 1)
        cells.append(crop)
        times.append(float(tl.times[g]))
    while len(cells) % cols:
        cells.append(np.zeros_like(cells[0]))
    grid = np.vstack([np.hstack(cells[i:i + cols]) for i in range(0, len(cells), cols)])
    cv2.imwrite(out_path, grid, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return times


def question_cards(D, questions: list[dict], out_path: str, cell: int = 260, cols: int = 4,
                   cache_dir: str | Path | None = None) -> None:
    """Numbered 'Is this your player?' cards: a context crop with the candidate boxed."""
    reader = FrameReader(D.sources, cache_dir)
    order = sorted(range(len(questions)), key=lambda i: questions[i]["t"])
    cards: dict[int, np.ndarray] = {}
    for i in order:
        q = questions[i]
        g = int(np.argmin(np.abs(D.times - q["t"])))
        fr = reader.get(g)
        if fr is None:
            continue
        x1, y1, x2, y2 = q["box"]
        h = y2 - y1
        side = max(2.2 * h, 160)
        cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
        X1, Y1 = int(max(0, cx - side / 2)), int(max(0, cy - side / 2))
        crop = fr[Y1:int(Y1 + side), X1:int(X1 + side)].copy()
        cv2.rectangle(crop, (int(x1 - X1), int(y1 - Y1)), (int(x2 - X1), int(y2 - Y1)), (0, 255, 255), 2)
        crop = cv2.resize(crop, (cell, cell))
        cv2.rectangle(crop, (0, 0), (cell, 30), (0, 0, 0), -1)
        cv2.putText(crop, f"{i + 1}.  {fmt_time(q['t'])}  ({q.get('affectedSec', q.get('seconds', 0)):.0f}s)", (6, 22), cv2.FONT_HERSHEY_SIMPLEX,
                    0.65, (255, 255, 255), 2)
        cards[i] = crop
    if not cards:
        return
    tiles = [cards[i] for i in range(len(questions)) if i in cards]
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    grid = np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)])
    cv2.imwrite(out_path, grid, [cv2.IMWRITE_JPEG_QUALITY, 88])
