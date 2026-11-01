"""One time budget shared by routing and parallel weather requests."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from contextvars import ContextVar
from time import monotonic

_deadline = ContextVar('provider_deadline', default=None)


@contextmanager
def provider_budget(seconds=23):
    token = _deadline.set(monotonic()+seconds)
    try:
        yield
    finally:
        _deadline.reset(token)


def seconds_left():
    deadline = _deadline.get()
    return max(0, deadline-monotonic()) if deadline is not None else 8


def parallel_map(function, items, workers=4):
    deadline = _deadline.get()
    def run(item):
        token = _deadline.set(deadline)
        try:
            return function(item)
        finally:
            _deadline.reset(token)
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(run, items))
