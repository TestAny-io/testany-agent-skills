class JobQueue:
    def __init__(self, jobs=()):
        self._pending = list(jobs)

    @property
    def pending(self):
        return list(self._pending)

    def run_next(self, handler):
        if not self._pending:
            return None
        result = handler(self._pending[0])
        self._pending.pop(0)
        return result
