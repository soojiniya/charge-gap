"""Bounded, advisory Linux page-cache release for one-pass snapshot reads.

Only consumed pages are advised away; file contents and process-owned buffers
remain intact. Unsupported filesystems/platforms simply use normal buffered IO.
"""
import io
import os

BATCH = 8 * 1024 * 1024


def release_pages(fd, start, end):
    if not hasattr(os, 'posix_fadvise') or not hasattr(os, 'POSIX_FADV_DONTNEED'):
        return
    try:
        os.posix_fadvise(fd, start, end - start, os.POSIX_FADV_DONTNEED)
    except OSError:
        pass  # Advisory only; hashing/parsing must still work on unsupported FS.


class SnapshotReader(io.BufferedReader):
    def __init__(self, raw):
        super().__init__(raw)
        self._released = 0

    def _consumed(self, final=False):
        # Do not evict bytes read ahead by BufferedReader but not yet consumed.
        end = self.tell()
        if final or end - self._released >= BATCH:
            # Page-aligned ranges avoid repeatedly retaining the boundary page.
            end -= end % 4096
            if end > self._released:
                release_pages(self.fileno(), self._released, end)
                self._released = end

    def read(self, size=-1):
        data = super().read(size)
        self._consumed()
        return data

    def read1(self, size=-1):
        data = super().read1(size)
        self._consumed()
        return data

    def readinto(self, buffer):
        count = super().readinto(buffer)
        self._consumed()
        return count

    def readinto1(self, buffer):
        count = super().readinto1(buffer)
        self._consumed()
        return count

    def close(self):
        if not self.closed:
            self._consumed(final=True)
        super().close()


def open_snapshot(path):
    if hasattr(os, 'posix_fadvise') and hasattr(os, 'POSIX_FADV_DONTNEED'):
        return SnapshotReader(io.FileIO(path, 'r'))
    return open(path, 'rb')
