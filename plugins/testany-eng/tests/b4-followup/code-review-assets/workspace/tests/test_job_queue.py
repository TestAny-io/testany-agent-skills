import unittest

from job_queue import JobQueue


class QueueTests(unittest.TestCase):
    def test_next_and_input_copy(self):
        jobs = ["a", "b"]
        queue = JobQueue(jobs)
        jobs.clear()
        queue.pending.clear()
        self.assertEqual(queue.run_next(str.upper), "A")
        self.assertEqual(queue.pending, ["b"])
        self.assertEqual(queue.run_next(str.upper), "B")
        self.assertIsNone(queue.run_next(str.upper))

    def test_next_failure_and_retry(self):
        queue = JobQueue(["a", "b"])
        error = RuntimeError("temporarily unavailable")

        def fail(job):
            raise error

        with self.assertRaises(RuntimeError) as caught:
            queue.run_next(fail)
        self.assertIs(caught.exception, error)
        self.assertEqual(queue.pending, ["a", "b"])
        self.assertEqual(queue.run_next(str.upper), "A")
        self.assertEqual(queue.pending, ["b"])
