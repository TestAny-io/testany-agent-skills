"""Local fixture checks only; synthetic traces are not model acceptance evidence."""

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import tarfile

import checkpoint_case as case
from test_fixture_support import require_local_archive


class LocalCase(unittest.TestCase):
    def setUp(self):
        parent = case.OUTPUT / "local-tests"
        parent.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix="unit-", dir=parent)
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)

    def save(self, relative, value):
        case.support.save(self.base / relative, value)


class RequestTests(unittest.TestCase):
    def test_exact_legacy_prefix_and_real_materials(self):
        turns = case.requests()
        self.assertEqual(len(turns), 4)
        legacy = (case.RAW / "requests/C06.md").read_text().strip()
        self.assertEqual(turns[0].split("\n\n", 1)[0], legacy)
        self.assertIn("方法论观点稿", turns[0])
        self.assertIn("S1–S4", turns[1])
        self.assertIn("还没有确认推进", turns[2])
        self.assertIn("Stage 4/6", turns[3])
        self.assertIn("不需要在 Stage 3、Stage 4", turns[3])

    def test_each_stage_exact_write_scope(self):
        turns = case.requests()
        for index, paths in enumerate(case.WRITES):
            for path in paths:
                self.assertIn(path, turns[index])
        self.assertIn("唯一可新建或修改的文件", turns[0])
        self.assertIn("唯一可新建或修改的文件", turns[1])
        self.assertIn("不新建、修改、删除或移动任何文件", turns[2])
        self.assertIn("四个路径是本轮唯一可新建或修改", turns[3])
        for path in (*case.WRITES[1], *case.WRITES[3]):
            self.assertNotIn(path, turns[0])
        for path in case.WRITES[3]:
            self.assertNotIn(path, turns[1])
            self.assertNotIn(path, turns[2])

    def test_requests_have_no_grader_or_future_trajectory_metadata(self):
        for turn in case.requests():
            for forbidden in ("expected.frozen", "rubric", "T12", "C06", "Astra", "Terra",
                              "fork_context", "第4轮", "评分", "PASS", "FAIL"):
                self.assertNotIn(forbidden, turn)
            for boundary in ("不联网", "不发布"):
                self.assertIn(boundary, turn)
            self.assertTrue("不配图" in turn or "不做 Stage 7 配图" in turn)
            self.assertTrue("不归档" in turn or "不做 Stage 7 配图或 Stage 8 归档" in turn)


class ScopeTests(unittest.TestCase):
    def setUp(self):
        self.initial = {"workspace": {"directory": True},
                        "workspace/brief.md": {"sha256": "brief", "mode": 420},
                        "workspace/sources.md": {"sha256": "sources", "mode": 420}}

    def add_outputs(self, before, phase):
        return {**before, **{name: {"sha256": "artifact", "mode": 420}
                            for name in case.WRITES[phase - 1]}}

    def test_exact_four_stage_deltas(self):
        before = self.initial
        for phase in range(1, 5):
            after = self.add_outputs(before, phase)
            report = case.scope_report(before, after, phase)
            self.assertTrue(report["static_scope_pass"])
            self.assertTrue(report["semantic_review_required"])
            self.assertEqual(report["changed"], sorted(case.WRITES[phase - 1]))
            before = after

    def test_early_stage_two_and_final_are_rejected(self):
        for phase in (1, 2, 3):
            after = self.add_outputs(self.initial, phase)
            after["workspace/article.md"] = {"sha256": "premature", "mode": 420}
            self.assertIn("workspace/article.md", case.scope_report(self.initial, after, phase)["violations"])
        after = self.add_outputs(self.add_outputs(self.initial, 1), 2)
        self.assertIn("workspace/sources-reviewed.md", case.scope_report(self.initial, after, 1)["violations"])

    def test_praise_cannot_mutate_existing_brief(self):
        before = self.add_outputs(self.add_outputs(self.initial, 1), 2)
        after = {**before, "workspace/brief-reviewed.md": {"sha256": "rewritten", "mode": 420}}
        self.assertFalse(case.scope_report(before, after, 3)["static_scope_pass"])

    def test_originals_prior_artifacts_deletion_modes_and_empty_dirs(self):
        before = self.add_outputs(self.add_outputs(self.initial, 1), 2)
        for path, value in (("workspace/brief.md", {"sha256": "changed"}),
                            ("workspace/sources-reviewed.md", {"sha256": "changed"}),
                            ("workspace/sources.md", {"sha256": "sources", "mode": 511}),
                            ("workspace/.secret", {"directory": True}),
                            ("installed skills/resource.md", {"sha256": "changed"})):
            with self.subTest(path=path):
                after = {**self.add_outputs(before, 4), path: value}
                self.assertIn(path, case.scope_report(before, after, 4)["violations"])
        after = self.add_outputs(before, 4)
        del after["workspace/brief-reviewed.md"]
        self.assertIn("workspace/brief-reviewed.md", case.scope_report(before, after, 4)["violations"])

    def test_missing_and_symlink_outputs_rejected(self):
        self.assertFalse(case.scope_report(self.initial, self.initial, 1)["static_scope_pass"])
        after = {**self.initial, "workspace/brief-reviewed.md": {"link": "brief.md"}}
        self.assertFalse(case.scope_report(self.initial, after, 1)["static_scope_pass"])
        for phase in (0, 5, True, "1"):
            with self.assertRaises(ValueError):
                case.scope_report({}, {}, phase)


class PublicDeltaTests(unittest.TestCase):
    def message(self, role, text, channel=None):
        return dict(type="message", role=role, channel=channel,
                    content=[dict(type="text", text=text)])

    def test_real_capture_shape_cumulative_assistants_current_user_only(self):
        first = self.message("assistant", "brief saved", "final")
        current_user = self.message("user", "only sources")
        tool = dict(type="function_call", name="read", arguments="sources")
        final = self.message("assistant", "sources saved", "final")
        previous = [self.message("user", "brief only"), first]
        current = [first, current_user, tool, final]
        self.assertEqual(case.turn_delta(current, previous, "only sources"), [current_user, tool, final])

    def test_missing_wrong_repeated_user_and_broken_prefix_fail(self):
        message = self.message("user", "current")
        for rows in ([], [self.message("user", "wrong")], [message, message]):
            with self.assertRaises(ValueError):
                case.turn_delta(rows, [], "current")
        with self.assertRaises(ValueError):
            case.turn_delta([message], [self.message("assistant", "old", "final")], "current")


class GateTests(LocalCase):
    def setUp(self):
        super().setUp()
        self.receipt = dict(run_key="unit-run", directory=str(self.base / "task"))
        self.plan = dict(messages=["one", "two", "three", "four"], model="gpt-6-astra", effort="high")
        mock = patch.object(case, "plan_and_receipt", return_value=(self.plan, self.receipt))
        mock.start()
        self.addCleanup(mock.stop)

    def test_approval_active_binding_capture_order_and_no_replay(self):
        with self.assertRaises(ValueError):
            case.bind_agent(self.base, "astra", "synthetic-unit-agent", "")
        with self.assertRaises(ValueError):
            case.message_for(self.base, "astra", 1)
        case.bind_agent(self.base, "astra", "synthetic-unit-agent", "unit-test approval, not actual dispatch")
        self.assertEqual(case.message_for(self.base, "astra", 1), "one")
        with self.assertRaises(ValueError):
            case.message_for(self.base, "astra", 2)
        dest = case.phase_path(self.base, "astra", self.receipt, 1)
        case.support.save(dest / "turn-evidence.json", {"synthetic_unit_only": True})
        self.assertEqual(case.message_for(self.base, "astra", 2), "two")
        with self.assertRaises(ValueError):
            case.message_for(self.base, "astra", 1)

    def test_serial_independent_trajectories(self):
        closed = {"previous_status": {"completed": "synthetic unit final; not model evidence"}}
        with self.assertRaises(ValueError):
            case.bind_agent(self.base, "terra", "unit-terra", "unit approval")
        case.bind_agent(self.base, "astra", "unit-astra", "unit approval")
        with self.assertRaises(ValueError):
            case.bind_agent(self.base, "terra", "unit-terra", "unit approval")
        with self.assertRaises(ValueError):
            case.mark_closed(self.base, "astra", "unit-astra", closed)
        for phase in range(1, 5):
            dest = case.phase_path(self.base, "astra", self.receipt, phase)
            case.support.save(dest / "turn-evidence.json", {"synthetic_unit_only": True})
        case.mark_closed(self.base, "astra", "unit-astra", closed)
        with self.assertRaises(ValueError):
            case.bind_agent(self.base, "terra", "unit-astra", "unit approval")
        case.bind_agent(self.base, "terra", "unit-terra", "unit approval")
        with self.assertRaises(ValueError):
            case.message_for(self.base, "astra", 1)

    def prepare_completed_agent(self, base=None):
        base = self.base if base is None else base
        case.bind_agent(base, "astra", "unit-astra", "synthetic unit approval")
        for phase in range(1, 5):
            dest = case.phase_path(base, "astra", self.receipt, phase)
            case.support.save(dest / "turn-evidence.json", {"synthetic_unit_only": True})
        return {"previous_status": {"completed": "synthetic unit final; not model evidence"}}

    def test_close_accepts_completed_result_without_rewriting_or_overwriting(self):
        result = self.prepare_completed_agent()
        case.mark_closed(self.base, "astra", "unit-astra", result)
        path = self.base / "astra/closed.json"
        self.assertEqual(case.read_json(path), dict(agent_id="unit-astra", tool_result=result))
        original = path.read_bytes()
        with self.assertRaises(FileExistsError):
            case.mark_closed(self.base, "astra", "unit-astra", result)
        self.assertEqual(path.read_bytes(), original)

    def test_close_rejects_malformed_negative_and_noncompleted_results(self):
        invalid = [
            None, False, True, 0, 1, "closed", [], ["completed"], {},
            {"closed": True}, {"success": True}, {"synthetic_unit_only": True},
            {"error": "close failed"}, {"not_found": True}, {"errored": "failure"},
            {"previous_status": None}, {"previous_status": False},
            {"previous_status": True}, {"previous_status": 1},
            {"previous_status": []}, {"previous_status": "completed"},
            {"previous_status": "not_found"}, {"previous_status": "running"},
            {"previous_status": "errored"}, {"previous_status": {}},
            {"previous_status": {"errored": "close failed"}},
            {"previous_status": {"not_found": True}},
            {"previous_status": {"running": True}},
        ]
        invalid.extend({"previous_status": {"completed": value}}
                       for value in (None, False, True, 0, 1, "", " \n\t", [], {}))
        for key in ("error", "errored", "not_found", "success", "unknown"):
            invalid.append({"previous_status": {"completed": "synthetic", key: False}})
            invalid.append({"previous_status": {"completed": "synthetic"}, key: False})
        for index, result in enumerate(invalid):
            with self.subTest(result=result):
                base = self.base / f"invalid-{index}"
                self.prepare_completed_agent(base)
                with self.assertRaisesRegex(ValueError, "successful actual close tool result"):
                    case.mark_closed(base, "astra", "unit-astra", result)
                self.assertFalse((base / "astra/closed.json").exists())
                with self.assertRaises(ValueError):
                    case.bind_agent(base, "terra", "unit-terra", "synthetic unit approval")

    def test_close_still_rejects_wrong_binding_with_valid_result(self):
        result = self.prepare_completed_agent()
        with self.assertRaisesRegex(ValueError, "wrong agent"):
            case.mark_closed(self.base, "astra", "unit-replacement", result)
        self.assertFalse((self.base / "astra/closed.json").exists())

    def test_capture_rejects_replacement_agent_before_session_access(self):
        case.bind_agent(self.base, "astra", "unit-astra", "unit approval")
        with patch.object(case.support, "capture_phase") as capture:
            with self.assertRaises(ValueError):
                case.capture_turn(self.base, "astra", 1, "unit-replacement")
            capture.assert_not_called()

    def test_capture_retains_cumulative_raw_and_records_phase_fail_without_healing(self):
        root = Path(self.receipt["directory"])
        (root / "workspace").mkdir(parents=True)
        self.receipt["input_manifest"] = case.support.b4.inventory(root)
        case.bind_agent(self.base, "astra", "unit-astra", "synthetic unit approval")
        history = []

        def fake_capture(batch, receipt, agent_id, message, label):
            phase = int(label[-2:])
            dest = Path(batch) / "phases" / receipt["run_key"] / label
            dest.mkdir(parents=True)
            current_user = dict(type="message", role="user", channel=None,
                                content=[dict(type="text", text=message)])
            final = dict(type="message", role="assistant", channel="final",
                         content=[dict(type="text", text=f"synthetic phase {phase}")])
            tool = dict(type="function_call", name="synthetic_local_write", arguments=str(phase))
            trace = history + [current_user, tool, final]
            history.extend([tool, final])
            case.support.b4.write_new(dest / "public-trace.jsonl", case.support.collector.public_jsonl(trace).encode())
            case.support.b4.write_new(dest / "final.md", "cumulative synthetic final\n".encode())
            case.support.save(dest / "metadata.json", dict(contexts=[dict(model="gpt-6-astra", effort="high")] * phase))
            if phase in (1, 2):
                case.support.b4.write_new(root / case.WRITES[phase - 1][0], b"synthetic unit artifact")
            if phase == 3:
                case.support.b4.write_new(root / "workspace/premature.md", b"synthetic violation")
            return dest

        with patch.object(case.support, "capture_phase", side_effect=fake_capture) as capture:
            for phase in (1, 2, 3):
                dest = case.capture_turn(self.base, "astra", phase, "unit-astra")
                self.assertEqual((dest / "turn-final.md").read_text(), f"synthetic phase {phase}\n")
                self.assertEqual((dest / "final.md").read_text(), "cumulative synthetic final\n")
                trace = case.read_trace(dest / "turn-public-trace.jsonl")
                self.assertEqual(len(trace), 3)
                self.assertEqual(trace[1]["arguments"], str(phase))
                self.assertEqual(case.read_json(dest / "turn-evidence.json")["issues"], [])
            self.assertEqual(capture.call_count, 3)
            report = case.read_json(dest / "scope-report.json")
            self.assertFalse(report["static_scope_pass"])
            self.assertIn("workspace/premature.md", report["violations"])
            self.assertEqual(case.message_for(self.base, "astra", 4), "four")
            self.assertTrue((root / "workspace/premature.md").exists())
            first = case.phase_path(self.base, "astra", self.receipt, 1)
            self.assertEqual((first / "turn-final.md").read_text(), "synthetic phase 1\n")


class FrozenIntegrationTests(LocalCase):
    def test_b4v2_preparation_isolated_inputs_and_no_dispatch(self):
        require_local_archive(case.DEFAULT)
        with patch.object(case.support, "prepare", wraps=case.support.prepare) as prepare:
            plans = case.prepare_case(self.base)
        self.assertEqual(prepare.call_count, 2)
        for call in prepare.call_args_list:
            self.assertEqual(call.kwargs, dict(repeats=1, archive=case.DEFAULT))
        self.assertEqual([(p["model"], p["effort"], p["fork_context"]) for p in plans],
                         [("gpt-6-astra", "high", False), ("gpt-5.6-terra", "high", False)])
        self.assertFalse(list(self.base.rglob("agent.json")))
        self.assertFalse(list(self.base.rglob("public-trace.jsonl")))
        requests = case.read_json(self.base / "requests.frozen.json")
        expected = case.read_json(self.base / "expected.frozen.json")
        self.assertEqual(expected["historical_scenario"], "T12")
        self.assertEqual(expected["legacy_case"], "C06")
        self.assertEqual(expected["skill"], "media-writer")
        payloads = []
        for plan in plans:
            batch = self.base / plan["key"]
            receipt, = case.read_json(batch / "tasks.json")
            root = Path(receipt["directory"])
            self.assertTrue(root.is_relative_to(self.base / "task-roots"))
            self.assertEqual(plan["messages"][0], case.support.dispatch_message(receipt))
            self.assertEqual((root / "request.md").read_text().strip(), requests["requests"][0])
            self.assertEqual(sorted(p.name for p in (root / "workspace").iterdir()), ["brief.md", "sources.md"])
            for name in ("brief.md", "sources.md"):
                self.assertEqual((root / "workspace" / name).read_bytes(), (case.RAW / "article" / name).read_bytes())
            self.assertEqual(Path(receipt["source_archive"]), case.DEFAULT.resolve())
            payloads.append(receipt["payload_sha256"])
            for name in receipt["input_manifest"]:
                self.assertNotIn("skill-manager", name.split("/"))
                self.assertNotIn("tests", name.split("/"))
                self.assertNotIn("expected.frozen", name)
            self.assertNotIn("skill-manager", (root / "SKILLS.md").read_text())
            forbidden_bytes = [text.encode() for text in requests["requests"][1:]]
            forbidden_bytes += [expected["rubric"].encode(), b"synthetic_unit_only", b"semantic_review_required"]
            with tarfile.open(batch / receipt["archive"], "r:gz") as archive:
                for entry in archive:
                    if entry.isfile():
                        raw = archive.extractfile(entry).read()
                        for secret in forbidden_bytes:
                            self.assertNotIn(secret, raw, entry.name)
        self.assertEqual(payloads[0], payloads[1])
        case.verify_freeze(self.base)
        with self.assertRaises(FileExistsError):
            case.prepare_case(self.base)
        with patch.object(case.support.b4, "sha", return_value="tampered"):
            with self.assertRaises(ValueError):
                case.verify_freeze(self.base)

    def test_temporary_location_restored_on_failure(self):
        old = tempfile.tempdir
        with self.assertRaises(RuntimeError):
            with case.local_temporary_roots(self.base / "temporary"):
                self.assertEqual(tempfile.tempdir, str(self.base / "temporary"))
                raise RuntimeError("unit failure")
        self.assertEqual(tempfile.tempdir, old)


if __name__ == "__main__":
    unittest.main()
