"""Bounded frame prefetch with explicit ownership of the video capture."""

from __future__ import annotations

from queue import Empty, Full, Queue
from threading import Event, Thread


class CaptureReader:
    """Release the capture on EOF, early exit or error; never release during a read."""

    def __init__(self, capture, prefetch: int = 0):
        self.capture = capture
        self.queue = Queue(maxsize=prefetch) if prefetch > 0 else None
        self.stop = Event()
        self.thread = None

    def __enter__(self):
        if self.queue is not None:
            self.thread = Thread(target=self._pump, name="scoutx-decode", daemon=True)
            self.thread.start()
        return self

    def _put(self, item):
        while not self.stop.is_set():
            try:
                self.queue.put(item, timeout=0.05)
                return
            except Full:
                pass

    def _pump(self):
        try:
            while not self.stop.is_set():
                result = self.capture.read()
                self._put((result, None))
                if not result[0]:
                    break
        except Exception as exc:
            self._put((None, exc))
        finally:
            self.capture.release()

    def read(self):
        if self.queue is None:
            return self.capture.read()
        while True:
            try:
                result, error = self.queue.get(timeout=0.05)
            except Empty:
                if not self.thread.is_alive():
                    raise RuntimeError("frame decoder stopped without an end-of-stream result")
                continue
            if error is not None:
                raise error
            return result

    def __exit__(self, exc_type, exc, traceback):
        self.stop.set()
        if self.thread is not None:
            self.thread.join()
            # Drop queued full-resolution frames immediately on a chunk boundary.
            while not self.queue.empty():
                self.queue.get_nowait()
        else:
            self.capture.release()
