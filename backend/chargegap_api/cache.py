"""Byte-bounded LRU caches for an immutable, per-process snapshot.

The DataStore is read once at process start and never changes while the process
runs (meta.snapshot_policy), so cached results never go stale: a restart builds
a new snapshot and empty caches. Each cache is bounded by an approximate byte
budget; least recently used entries are evicted first, and an entry larger than
the whole budget is not stored at all. A budget of 0 disables the cache.
"""
from collections import OrderedDict
import threading


class ByteLRU:
    def __init__(self, max_bytes, name):
        self.max_bytes = max(0, int(max_bytes))
        self.name = name
        self._items = OrderedDict()  # key -> (value, size)
        self._bytes = 0
        self._lock = threading.Lock()
        self.hits = self.misses = self.evictions = self.rejected = 0

    @property
    def enabled(self):
        return self.max_bytes > 0

    def get(self, key):
        """Return the cached value or None (None is never stored)."""
        with self._lock:
            item = self._items.get(key)
            if item is None:
                self.misses += 1
                return None
            self._items.move_to_end(key)
            self.hits += 1
            return item[0]

    def put(self, key, value, size):
        size = int(size)
        with self._lock:
            if not self.enabled or size > self.max_bytes:
                self.rejected += 1
                return False
            old = self._items.pop(key, None)
            if old is not None:
                self._bytes -= old[1]
            self._items[key] = (value, size)
            self._bytes += size
            while self._bytes > self.max_bytes:
                _, (_, evicted) = self._items.popitem(last=False)
                self._bytes -= evicted
                self.evictions += 1
            return True

    def stats(self):
        with self._lock:
            return {'name': self.name, 'entries': len(self._items), 'bytes': self._bytes,
                    'max_bytes': self.max_bytes, 'hits': self.hits, 'misses': self.misses,
                    'evictions': self.evictions, 'rejected': self.rejected}

    def keys(self):
        with self._lock:
            return list(self._items)


def request_key(path, args):
    """Path plus every query parameter (all values, sorted). Requests that differ only in
    parameter order share a key; any other difference in the request gets its own key."""
    return (path, tuple(sorted((k, tuple(args.getlist(k))) for k in args)))
