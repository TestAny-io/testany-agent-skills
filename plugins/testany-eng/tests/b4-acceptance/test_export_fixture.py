"""Local-only acceptance tests. All temporary writes stay beneath this new folder."""

import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import export_fixture as b4


class ExportTests(unittest.TestCase):
    def test_bot_nested_skills_have_explicit_host_discovery_paths(self):
        plugin = b4.ROOT / "plugins/testany-bot"
        manifest = json.loads((plugin / ".claude-plugin/plugin.json").read_text())
        expected = {"./skills"} | {"./skills/" + p.name for p in (plugin / "skills").iterdir()
                                   if p.is_dir() and (p / "SKILL.md").is_file()}
        self.assertTrue((plugin / "skills/SKILL.md").is_file())
        self.assertIsInstance(manifest["skills"], list)
        self.assertEqual(set(manifest["skills"]), expected)
        self.assertEqual(len(manifest["skills"]), len(expected))

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix=".test ", dir=b4.HOME)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.temp_patch = patch.object(tempfile, "tempdir", str(self.root))
        self.temp_patch.start()
        self.addCleanup(self.temp_patch.stop)

    def archives(self, extras=None):
        result = {}
        for variant in ("original", "candidate"):
            entries = {"AGENTS.md": variant.encode(), "CLAUDE.md": (variant + " claude").encode(),
                       ".claude-plugin/marketplace.json": b'{"plugins": []}',
                       "docs/rules.md": (variant + " rules").encode()}
            for plugin in b4.PLUGINS:
                entries[f"plugins/{plugin}/skills/sample/SKILL.md"] = (
                    f"---\nname: {plugin}\ndescription: {variant} fixture\n---\n# Sample\n").encode()
            if variant == "candidate":
                entries["plugins/testany-eng/references/candidate-only.md"] = b"candidate overlay marker"
            entries.update(extras or {})
            path = self.root / (variant + ".tar.gz")
            with tarfile.open(path, "w:gz") as archive:
                for name, value in entries.items():
                    member = tarfile.TarInfo(name)
                    member.mode = 0o644
                    if isinstance(value, tuple):
                        member.type, member.linkname = value
                        archive.addfile(member)
                    else:
                        member.size = len(value)
                        archive.addfile(member, io.BytesIO(value))
            result[variant] = path
        return result

    def prepare(self, scenarios=None, **kwargs):
        return b4.prepare(self.root / "evidence", scenarios or [{"source": "legacy", "case_id": "C01"}],
                          **kwargs)

    def require_local_archives(self, variants=("original", "candidate")):
        missing = [str(b4.ARCHIVES[v]) for v in variants
                   if not b4.ARCHIVES[v].exists() and not b4.ARCHIVES[v].is_symlink()]
        if missing:
            self.skipTest("optional recorded B4 archive(s) absent: " + ", ".join(missing))

    def test_default_repeats_payload_governance_and_no_overlay(self):
        tasks = self.prepare(archives=self.archives())
        self.assertEqual(len(tasks), 6)
        self.assertEqual({t["repeat"] for t in tasks}, {1, 2, 3})
        self.assertEqual(len({t["run_key"] for t in tasks}), 6)
        self.assertEqual(len({t["payload_sha256"] for t in tasks}), 1)
        self.assertEqual(len({t["comparable_sha256"] for t in tasks}), 1)
        self.assertEqual(len({t["runtime_sha256"] for t in tasks}), 2)
        for task in tasks:
            root = Path(task["directory"])
            self.assertIn(" ", root.name)
            self.assertFalse(root.is_relative_to(self.root / "evidence"))
            self.assertEqual((root / "AGENTS.md").read_bytes(), task["variant"].encode())
            self.assertEqual((root / "CLAUDE.md").read_bytes(), (task["variant"] + " claude").encode())
            self.assertEqual((root / "docs/rules.md").read_bytes(), (task["variant"] + " rules").encode())
            self.assertEqual((root / "plugins").resolve(), root / b4.INSTALL / "plugins")
            overlay = root / b4.INSTALL / "plugins/testany-eng/references/candidate-only.md"
            self.assertEqual(overlay.exists(), task["variant"] == "candidate")
            self.assertEqual(task["input_manifest"], b4.inventory(root))
            self.assertEqual(task["input_hashes"], {p.relative_to(root).as_posix(): b4.sha(p.read_bytes())
                                                   for p in root.rglob("*") if p.is_file()})
            self.assertNotIn("plugins", task["input_hashes"])
            self.assertNotIn("docs", task["input_hashes"])
            self.assertEqual(task["input_hashes"]["AGENTS.md"], b4.sha(task["variant"].encode()))
            self.assertEqual(task["input_symlinks"]["plugins"], "installed skills/plugins")
            self.assertTrue(all(not b4.excluded(n) for n in task["input_manifest"]))
            self.assertFalse(any("expected" in n or "suite.json" in n or "facility-snapshot" in n
                                 for n in task["input_manifest"]))
            self.assertEqual((root / "ENTRY.md").read_text(), b4.ENTRY)
            archive = self.root / "evidence" / task["archive"]
            self.assertEqual(b4.sha(archive.read_bytes()), task["archive_sha256"])
            with tarfile.open(archive) as bundle:
                self.assertTrue(all(n.startswith("input") for n in bundle.getnames()))
                self.assertFalse(any("expected.frozen" in n or "/grader/" in n for n in bundle.getnames()))
        manifest = json.loads((self.root / "evidence/manifest.json").read_bytes())
        self.assertEqual(manifest["runs"], tasks)
        frozen = self.root / "evidence/facility-snapshot"
        for name, digest in manifest["facility_files"].items():
            self.assertEqual(b4.sha((frozen / name).read_bytes()), digest)

    def test_existing_output_and_archive_refused_without_changes(self):
        archives = self.archives()
        tasks = self.prepare(archives=archives, repeats=1)
        before = b4.inventory(self.root / "evidence")
        with self.assertRaises(FileExistsError):
            self.prepare(archives=archives)
        self.assertEqual(before, b4.inventory(self.root / "evidence"))
        archive = self.root / "evidence" / tasks[0]["archive"]
        with self.assertRaises(FileExistsError):
            b4.write_new(archive, b"overwrite")

    def test_all_sources_reuse_original_materials_and_adapters(self):
        materials = b4.Materials(b4.ROOT)
        self.assertEqual(sum(s == "legacy" for s, _ in materials.cases), 10)
        self.assertEqual(sum(s == "b3" for s, _ in materials.cases), 18)
        self.assertEqual(sum(s == "b1" for s, _ in materials.cases), 6)
        self.assertIn(("b2-supplement", "D06"), materials.cases)
        self.assertIn(("b2-supplement", "B06"), materials.cases)
        self.assertIn(("b3-supplement", "S01"), materials.cases)
        with patch("subprocess.check_output", side_effect=AssertionError("must not read git runtime")):
            for source, case_id in materials.cases:
                with self.subTest(source=source, case=case_id):
                    first, second = self.root / (source + case_id + " 1"), self.root / (source + case_id + " 2")
                    first.mkdir()
                    second.mkdir()
                    materials.materialize(source, case_id, first)
                    materials.materialize(source, case_id, second)
                    self.assertEqual(b4.inventory(first), b4.inventory(second))
                    self.assertFalse((first / "plugins").exists())
                    self.assertFalse((first / "SKILLS.md").exists())
                    self.assertTrue(materials.expected(source, case_id))
                    if source == "b4-repair":
                        self.assertEqual((first / "harness/mcp.py").read_bytes(), (b4.HOME / "command_adapter.py").read_bytes())
                        self.assertEqual((first / "harness/legacy_adapter.py").read_bytes(),
                                         (b4.TESTS / "gpt6-adaptation/adapter.py").read_bytes())
                        self.assertEqual(materials.expected(source, case_id), materials.expected("legacy", "C10"))
                        self.assertEqual((first / "request.md").read_bytes(),
                                         (b4.TESTS / "gpt6-adaptation/raw/requests/C10.md").read_bytes())
                        trigger = json.loads((first / "harness/schema.json").read_text())["operations"]["testany_update_case"]["case_meta"]["trigger_method"]
                        self.assertIn("array", trigger["trigger_command"])
                        self.assertTrue(trigger["trigger_path"].startswith("optional"))
                        self.assertIn("must agree", trigger["trigger_path"])
                    elif (first / "harness/mcp.py").exists():
                        adapter = b4.ROOT / "plugins/testany-bot/tests/b1-safety/adapter.py" if source == "b1" else b4.TESTS / "gpt6-adaptation/adapter.py"
                        self.assertEqual((first / "harness/mcp.py").read_bytes(), adapter.read_bytes())
                    if (first / "harness/testany.py").exists():
                        self.assertEqual((first / "harness/testany.py").read_bytes(),
                                         (b4.TESTS / "b3-adaptation/adapter.py").read_bytes())
                    if source == "b2-supplement":
                        for name, text in materials.cases[source, case_id]["files"].items():
                            self.assertEqual((first / "workspace" / name).read_text(), text)
                    if source == "b3-supplement":
                        self.assertFalse((first / "workspace/package.zip").exists())
                        self.assertFalse((first / "workspace/metadata.json").exists())
                        self.assertEqual((first / "workspace/test_billing.py").read_text(), materials.fixtures.SCRIPT)

    def test_repaired_fixture_cli_round_trip(self):
        task = self.prepare([{"source": "b4-repair", "case_id": "C10G"}],
                            variants=("candidate",), repeats=1, archives=self.archives())[0]
        root = Path(task["directory"])
        state = json.loads((root / "harness/state.json").read_text())
        variables = state["case"]["case_meta"]["environment_variables"]
        variables.append({"name": "MODE", "type": "env", "value": "preview"})
        def call(operation, args):
            result = subprocess.run([sys.executable, "-B", "harness/mcp.py", operation, json.dumps(args)],
                                    cwd=root, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            return json.loads(result.stdout)["result"]
        call("testany_update_case", {"case_key": "A1B2C3D4", "runtime_uuid": "local-runtime", "case_meta": {
            "environment_variables": variables, "trigger_method": {"executor": "python", "trigger_command": ["python", "main.py"]}}})
        started = call("testany_dry_run_case", {"case_key": "A1B2C3D4"})
        terminal = call("testany_get_dry_run_result", {"dry_run_id": started["dry_run_id"]})
        self.assertEqual(terminal["dry_run_status"], 1)
        stored = json.loads((root / "harness/state.json").read_text())
        self.assertNotIn("trigger_path", stored["case"]["case_meta"]["trigger_method"])
        self.assertEqual(stored["dry_runs"], 1)

    def test_real_archives_are_exact_and_never_use_current_governance(self):
        self.require_local_archives()
        frozen = {v: b4.snapshot(v) for v in b4.ARCHIVES}
        self.assertNotEqual(frozen["original"]["tree"]["AGENTS.md"], frozen["candidate"]["tree"]["AGENTS.md"])
        self.assertNotIn("docs/plugin-development.md", frozen["original"]["tree"])
        self.assertIn("docs/plugin-development.md", frozen["candidate"]["tree"])
        scenarios = [{"source": "legacy", "case_id": "C01"}, {"source": "b3", "case_id": "A01"},
                     {"source": "b3", "case_id": "E02"}]
        tasks = self.prepare(scenarios, repeats=1)
        for scenario in scenarios:
            pair = [t for t in tasks if t["source"] == scenario["source"] and t["case_id"] == scenario["case_id"]]
            self.assertEqual(pair[0]["payload_sha256"], pair[1]["payload_sha256"])
            self.assertEqual(pair[0]["comparable_sha256"], pair[1]["comparable_sha256"])
        for task in tasks:
            root = Path(task["directory"])
            tree = frozen[task["variant"]]["tree"]
            actual = {n for n, v in b4.inventory(root / b4.INSTALL).items() if "directory" not in v}
            self.assertEqual(actual, set(tree))
            for name, value in tree.items():
                target = root / b4.INSTALL / name
                if "data" in value:
                    self.assertEqual(target.read_bytes(), value["data"])
                else:
                    self.assertEqual(os.readlink(target), value["link"])
            for line in (root / "SKILLS.md").read_text().splitlines():
                if line.startswith("  Path: `"):
                    path = root / line.split("`")[1]
                    self.assertTrue(path.is_file())
                    self.assertTrue(path.resolve().is_relative_to(root / b4.INSTALL))

    def test_exclusions_and_internal_resource_links(self):
        prefix = "plugins/testany-eng/"
        extras = {prefix + n: b"PRIVATE GRADING MARKER" for n in (
            "tests/data.json", "grader/expected.json", "audit/report.md", ".DS_Store", "__pycache__/x.pyc")}
        extras.update({prefix + "references/shared.md": b"shared resource",
                       prefix + "skills/sample/reference.md": (tarfile.SYMTYPE, "../../references/shared.md"),
                       prefix + "skills/alias": (tarfile.SYMTYPE, "sample"),
                       prefix + "references/governance.md": (tarfile.SYMTYPE, "../../../docs/rules.md")})
        sources = self.archives(extras)
        tree = b4.snapshot("original", sources)["tree"]
        self.assertFalse(any(b4.excluded(name) for name in tree))
        root = self.root / "project"
        b4.install_tree(tree, root / b4.INSTALL)
        index = b4.index_skills(root)
        self.assertIn("skills/alias/SKILL.md", index)
        self.assertEqual((root / b4.INSTALL / prefix / "skills/sample/reference.md").read_bytes(), b"shared resource")
        self.assertEqual((root / b4.INSTALL / prefix / "references/governance.md").read_bytes(), b"original rules")

    def test_unsafe_links_and_paths_fail_before_install(self):
        bad = ["/etc/passwd", "../../../../../../outside", "missing", "link", "../tests/hidden"]
        prefix = "plugins/testany-eng/references/"
        for index, link in enumerate(bad):
            with self.subTest(link=link):
                sources = self.archives({prefix + "link": (tarfile.SYMTYPE, link)})
                with self.assertRaises(ValueError):
                    b4.snapshot("original", sources)
        for extra in ({"../escape": b"bad"}, {"/absolute": b"bad"},
                      {prefix + "link": (tarfile.LNKTYPE, "AGENTS.md")},
                      {prefix + "link": (tarfile.SYMTYPE, "../skills"), prefix + "link/evil": b"bad"},
                      {prefix + "a": (tarfile.SYMTYPE, "b"), prefix + "b": (tarfile.SYMTYPE, "a")},
                      {"docs/a/link": (tarfile.SYMTYPE, "../b"), "docs/b/link": (tarfile.SYMTYPE, "../a")}):
            with self.subTest(extra=extra):
                sources = self.archives(extra)
                with self.assertRaises(ValueError):
                    b4.snapshot("original", sources)

    def test_selection_validation_and_candidate_only_supplements(self):
        sources = self.archives()
        for scenarios in ([], [{"source": "nope", "case_id": "C01"}],
                          [{"source": "legacy", "case_id": "C01", "expect": "leak"}],
                          [{"source": "legacy", "case_id": "C01"}] * 2):
            with self.assertRaises(ValueError):
                b4.prepare(self.root / "invalid", scenarios, archives=sources)
        for repeats in (0, -1, True, 1.5):
            with self.assertRaises(ValueError):
                self.prepare(archives=sources, repeats=repeats)
        scenarios = [{"source": "b1", "case_id": "R07"}, {"source": "b2-supplement", "case_id": "D06"},
                     {"source": "b3-supplement", "case_id": "S01"}]
        tasks = self.prepare(scenarios, variants=("candidate",), repeats=1, archives=sources)
        self.assertEqual(len(tasks), 3)
        self.assertTrue(all(t["variant"] == "candidate" for t in tasks))
        expected = json.loads((self.root / "evidence/expected.frozen.json").read_bytes())
        materials = b4.Materials(b4.ROOT)
        for case in scenarios:
            self.assertEqual(expected["cases"][case["source"] + ":" + case["case_id"]],
                             materials.expected(case["source"], case["case_id"]))
        for source, case_id in (("b2", "A04"), ("b2", "D05"),
                                ("b2-supplement", "B06"), ("b2-supplement", "D06")):
            self.assertEqual(materials.expected(source, case_id),
                             {"expect": materials.cases[source, case_id]["expect"]})
        self.assertEqual(materials.expected("b2", "A03")["legacy_expected"],
                         materials.legacy_expected["cases"]["C07"])

    def test_main_agent_scenario_lists_prepare_without_dispatch(self):
        self.require_local_archives()
        directory = b4.ROOT / "output/gpt6-b4-2026-09-14"
        paths = sorted(directory.glob("*-scenarios.json"))
        if not paths:
            self.skipTest("main agent scenario files not present")
        count = 0
        for path in paths:
            cases = json.loads(path.read_bytes())
            variants = ("candidate",) if path.name == "supplemental-scenarios.json" else ("original", "candidate")
            tasks = b4.prepare(self.root / path.stem, cases, variants=variants, repeats=1)
            self.assertEqual(len(tasks), len(cases) * len(variants))
            count += len(tasks)
        print(f"\nScenario-list dry-run: {len(paths)} files, {count} exports, no dispatch")

    def test_cli_real_candidate_only(self):
        self.require_local_archives(("candidate",))
        self.run_cli_export("candidate")

    def run_cli_export(self, variants, *options):
        selection = self.root / "scenarios.json"
        b4.write_new(selection, b4.json_bytes([{"source": "b1", "case_id": "R10"}]))
        command = [sys.executable, "-B", str(b4.HOME / "export_fixture.py"), "--output", str(self.root / "cli"),
                   "--scenarios", str(selection), "--variants", variants, "--repeats", "1", *options]
        env = dict(os.environ, TMPDIR=str(self.root), PYTHONDONTWRITEBYTECODE="1")
        result = subprocess.run(command, capture_output=True, text=True, env=env)
        self.assertEqual(result.returncode, 0, result.stderr)
        tasks = json.loads(result.stdout)
        self.assertEqual(len(tasks), len(variants.split(",")))
        self.assertTrue(Path(tasks[0]["entry"]).is_file())
        again = subprocess.run(command, capture_output=True, text=True, env=env)
        self.assertEqual(again.returncode, 2)
        return json.loads((self.root / "cli/manifest.json").read_bytes())

    def test_cli_explicit_paired_archives(self):
        archives = self.archives()
        manifest = self.run_cli_export("original,candidate", "--original-archive", str(archives["original"]),
                                       "--candidate-archive", str(archives["candidate"]))
        self.assertEqual({v: s["archive"] for v, s in manifest["sources"].items()},
                         {v: str(p.resolve()) for v, p in archives.items()})

    def test_cli_explicit_candidate_only_archive(self):
        archives = self.archives()
        manifest = self.run_cli_export("candidate", "--candidate-archive", str(archives["candidate"]))
        self.assertEqual(set(manifest["sources"]), {"candidate"})
        self.assertEqual(manifest["sources"]["candidate"]["archive_sha256"],
                         b4.sha(archives["candidate"].read_bytes()))

    def test_cli_partial_overrides_reject_missing_selected_variant(self):
        archives = self.archives()
        selection = self.root / "scenarios.json"
        b4.write_new(selection, b4.json_bytes([{"source": "legacy", "case_id": "C01"}]))
        for variants, provided, missing in (("original,candidate", "candidate", "original"),
                                            ("original,candidate", "original", "candidate"),
                                            ("candidate", "original", "candidate")):
            with self.subTest(variants=variants, provided=provided):
                result = subprocess.run([sys.executable, "-B", str(b4.HOME / "export_fixture.py"),
                    "--output", str(self.root / "cli"), "--scenarios", str(selection),
                    "--variants", variants, "--" + provided + "-archive", str(archives[provided])],
                    capture_output=True, text=True)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertIn("explicit archive required for selected variant(s): " + missing, result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertFalse((self.root / "cli").exists())

    def test_archive_mapping_never_falls_back_to_defaults(self):
        archives = self.archives()
        with patch.object(b4, "ARCHIVES", archives):
            self.assertEqual(b4.select_archives(("candidate",)), {"candidate": archives["candidate"]})
            for supplied in ({}, {"original": archives["original"]}, {"candidate": None}):
                with self.subTest(supplied=supplied), self.assertRaisesRegex(ValueError, "explicit archive"):
                    self.prepare(variants=("candidate",), archives=supplied)
            with self.assertRaises(FileNotFoundError):
                self.prepare(variants=("candidate",), archives={"candidate": self.root / "absent.tar.gz"})
            with self.assertRaisesRegex(ValueError, "archive paths"):
                self.prepare(variants=("candidate",), archives={"candidate": True})
        self.assertFalse((self.root / "evidence").exists())

    def test_optional_integration_skips_when_archives_absent(self):
        absent = {v: self.root / (v + "-absent.tar.gz") for v in b4.ARCHIVES}
        with patch.object(b4, "ARCHIVES", absent):
            for test in (self.test_real_archives_are_exact_and_never_use_current_governance,
                         self.test_main_agent_scenario_lists_prepare_without_dispatch,
                         self.test_cli_real_candidate_only):
                with self.subTest(test=test.__name__), self.assertRaisesRegex(unittest.SkipTest, "archive.*absent"):
                    test()


if __name__ == "__main__":
    unittest.main()
