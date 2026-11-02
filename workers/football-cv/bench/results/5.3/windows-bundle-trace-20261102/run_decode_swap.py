"""Controlled decode-swap experiment (5.3 CPU divergence, 2026-11-02). Exploratory, bench-only.

One factor changes versus the saved Linux cpu-onnx run: cv2.VideoCapture is replaced by an FFmpeg-CLI
pipe using swscale's BT.601 limited-range YUV->BGR24 conversion, which reproduces all 301 decoded
frame hashes of the original Windows run (decode_windows_20261102.json == that run's decodedPixels).
Everything else - source commit, models, harness profile, Linux environment - is unchanged; outputs
and caches go to a fresh directory. No production code is modified.

    python run_decode_swap.py <video> <out-dir> [window ...]
"""
import os
import runpy
import subprocess
import sys

import cv2
import numpy as np

VF = "scale=in_color_matrix=bt601:in_range=tv"


class FfmpegCapture:
    def __init__(self, path, *_a, **_k):
        self.path = str(path)
        info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                               "stream=width,height,r_frame_rate,nb_frames", "-of", "csv=p=0", self.path],
                              capture_output=True, text=True, check=True).stdout.strip().split(",")
        self.w, self.h = int(info[0]), int(info[1])
        num, den = info[2].split("/")
        self.fps = float(num) / float(den)
        self.count = float(info[3]) if len(info) > 3 and info[3].isdigit() else 0.0
        self.pos, self.proc, self.frame, self.ok = 0, None, None, True

    def _start(self):
        self._stop()
        self.proc = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", f"{self.pos / self.fps:.6f}", "-i", self.path,
                                      "-vf", VF, "-pix_fmt", "bgr24", "-f", "rawvideo", "-"],
                                     stdout=subprocess.PIPE, bufsize=self.w * self.h * 3 * 2)

    def _stop(self):
        if self.proc:
            self.proc.kill()
            self.proc.wait()
            self.proc = None

    def isOpened(self):
        return True

    def getBackendName(self):
        return "FFMPEG-CLI-bt601-tv"

    def get(self, prop):
        return {cv2.CAP_PROP_FPS: self.fps, cv2.CAP_PROP_FRAME_WIDTH: float(self.w),
                cv2.CAP_PROP_FRAME_HEIGHT: float(self.h), cv2.CAP_PROP_POS_FRAMES: float(self.pos),
                cv2.CAP_PROP_FRAME_COUNT: self.count, cv2.CAP_PROP_POS_MSEC: 1000.0 * self.pos / self.fps}.get(prop, 0.0)

    def set(self, prop, value):
        if prop == cv2.CAP_PROP_POS_FRAMES:
            self.pos = int(round(value))
        elif prop == cv2.CAP_PROP_POS_MSEC:
            self.pos = int(round(value / 1000.0 * self.fps))
        else:
            return False
        self._stop()
        return True

    def grab(self):
        if self.proc is None:
            self._start()
        n = self.w * self.h * 3
        b = self.proc.stdout.read(n)
        if len(b) < n:
            self.frame = None
            return False
        self.frame = np.frombuffer(b, np.uint8).reshape(self.h, self.w, 3).copy()
        self.pos += 1
        return True

    def retrieve(self, *_a, **_k):
        return (self.frame is not None), self.frame

    def read(self, *_a, **_k):
        ok = self.grab()
        return ok, self.frame

    def release(self):
        self._stop()


def main():
    video, out = sys.argv[1], sys.argv[2]
    windows = sys.argv[3:] or ["gap1150"]
    here = os.path.dirname(os.path.abspath(sys.argv[0]))
    bench = os.path.join(os.environ["FCV_ROOT"], "bench")
    sys.path.insert(0, bench)
    sys.path.insert(0, os.environ["FCV_ROOT"])
    os.chdir(os.environ["FCV_ROOT"])
    cv2.VideoCapture = FfmpegCapture
    sys.argv = [os.path.join(bench, "fp32_comparison.py"), "--profile", "cpu-onnx", "--video", video,
                "--out-dir", out, "--windows", *windows]
    del here
    runpy.run_path(sys.argv[0], run_name="__main__")


if __name__ == "__main__":
    main()
