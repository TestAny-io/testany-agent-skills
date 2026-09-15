"""Input exporter tests, including all frozen cases and both resource variants."""

import ast
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

import adapter
import fixtures
import prepare_run as prepare


class PrepareTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.suite = json.loads((prepare.HOME / "suite.json").read_text())
        cls.actual = prepare.snapshot("candidate")

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="b3-export-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()

    def case(self, case_id):
        return next(c for c in self.suite["cases"] if c["id"] == case_id)

    def export(self, case_id):
        return prepare.materialize(self.case(case_id), destination=self.root / case_id, frozen_source=self.actual)

    def small_source(self):
        source = self.root / "source"
        for plugin in prepare.PLUGINS:
            fixtures.write(source / "plugins" / plugin / "skills/sample/SKILL.md",
                           "---\nname: " + plugin + "\ndescription: Sample workflow\n---\noriginal bytes\n")
        for name in ("AGENTS.md", "CLAUDE.md"):
            fixtures.write(source / name, "Current route: docs/plugin-discovery.md\n")
        fixtures.write(source / "docs/plugin-discovery.md", "Current local discovery rules\n")
        fixtures.write_json(source / ".claude-plugin/marketplace.json", {"plugins": []})
        return source

    def cleanup_runs(self, tasks):
        for task in tasks:
            shutil.rmtree(task["directory"])

    def test_frozen_hashes_are_unchanged(self):
        for name, digest in prepare.FROZEN.items():
            self.assertEqual(hashlib.sha256((prepare.HOME / name).read_bytes()).hexdigest(), digest)
        self.assertEqual(len(self.suite["cases"]), 18)

    def test_all_18_inputs_are_isolated_and_expectations_not_exported(self):
        roots = []
        expected_strings = [text for c in self.suite["cases"] for text in c["expect"]]
        for case in self.suite["cases"]:
            with self.subTest(case=case["id"]):
                receipt = self.export(case["id"])
                root = Path(receipt["directory"])
                roots.append(root)
                self.assertEqual((root / "request.md").read_text(), case["request"] + "\n")
                self.assertEqual((root / "ENTRY.md").read_text(), prepare.ENTRY)
                self.assertEqual((root / "harness").exists(), case["profile"] in fixtures.PLATFORM_PROFILES)
                index = (root / "SKILLS.md").read_text()
                self.assertIn("installed skills/plugins/", index)
                self.assertNotIn("practice repositories", index)
                for plugin in prepare.PLUGINS:
                    self.assertTrue((root / prepare.INSTALL / "plugins" / plugin).is_dir())
                self.assertEqual(receipt["input_hashes"], prepare.input_hashes(root))
                for path in root.rglob("*"):
                    relative = path.relative_to(root)
                    if path.is_file() and path.suffix in {".md", ".json"} and prepare.INSTALL not in relative.parents:
                        content = path.read_text()
                        self.assertFalse(any(text in content for text in expected_strings), relative)
                    self.assertNotIn(path.name, {"suite.json", "evaluation.md", "expected.frozen.json"})
                    if path.name == "manifest.json":
                        self.assertTrue(relative.is_relative_to(prepare.INSTALL), relative)
                        source_path = relative.relative_to(prepare.INSTALL).as_posix()
                        self.assertIn(source_path, self.actual["resources"])
                        self.assertEqual(path.read_bytes(), self.actual["resources"][source_path]["data"])
                    self.assertNotIn(path.name, {".DS_Store", "__pycache__"})
                for path in (root / prepare.INSTALL).rglob("*"):
                    self.assertFalse(prepare.excluded(path.relative_to(root / prepare.INSTALL)), path)
        self.assertEqual(len(set(roots)), 18)
        fixtures.write(roots[0] / "workspace/unique.txt", "isolated")
        self.assertTrue(all(not (root / "workspace/unique.txt").exists() for root in roots[1:]))

    def test_runtime_manifest_is_preserved_without_exporting_task_manifest(self):
        source = self.small_source()
        relative = "plugins/testany-eng/skills/sample/assets/site/manifest.json"
        fixtures.write(source / relative, '{"name":"local runtime asset"}\n')
        snapshot = prepare.snapshot("candidate", source_root=source)
        receipt = prepare.materialize(self.case("E02"), destination=self.root / "task", frozen_source=snapshot)
        root = Path(receipt["directory"])
        self.assertEqual((root / prepare.INSTALL / relative).read_bytes(), (source / relative).read_bytes())
        self.assertFalse((root / "manifest.json").exists())
        self.assertFalse((root / "expected.frozen.json").exists())

    def test_business_materials_cover_measurement_and_exactly_two_open_branches(self):
        for case_id in ("B02", "C01"):
            self.export(case_id)
            text = (self.root / case_id / "workspace/materials.md").read_text()
            for term in ("林远", "陈禾", "测量计划", "AC-01", "AC-05", "历史量化基线", "不做", "批准"):
                self.assertIn(term, text)
        self.export("C02")
        gaps = (self.root / "C02/workspace/journey-materials.md").read_text()
        self.assertEqual(gaps.count("待定分支 Q"), 2)
        self.assertEqual(gaps.count("？"), 2)
        self.export("C03")
        complete = (self.root / "C03/workspace/journey-materials.md").read_text()
        self.assertNotIn("待定分支 Q", complete)
        self.assertNotIn("？", complete)
        for journey in ("UJ-01", "UJ-02", "UJ-03", "UJ-04"):
            self.assertIn("## " + journey, complete)
        self.assertIn("UJ-01 -> UJ-02 -> UJ-03", complete)

    def test_legal_packages_and_independent_d01_defects(self):
        for case_id in ("A01", "D02", "D04", "D01"):
            self.export(case_id)
            work = self.root / case_id / "workspace"
            meta = json.loads((work / "metadata.json").read_text())["case_meta"]
            self.assertEqual(meta["trigger_method"]["executor"], "pyres")
            self.assertIn("environment_variables", meta)
            if case_id != "D01":
                adapter.inspect_package(work / "package.zip", meta)
            else:
                with zipfile.ZipFile(work / "package.zip") as bundle:
                    self.assertIsNone(bundle.testzip())
                    self.assertNotIn("missing_entry.py", bundle.namelist())
                    ast.parse(bundle.read("test_billing.py"))
                    with self.assertRaises(SyntaxError):
                        ast.parse(bundle.read("broken_helper.py"))
        self.export("A02")
        self.assertFalse((self.root / "A02/workspace/package.zip").exists())
        self.assertTrue((self.root / "A02/workspace/test_billing.py").is_file())

    def test_f02_three_separate_defects_and_internal_archive_link_target(self):
        receipt = self.export("F02")
        work = self.root / "F02/workspace/practice repositories"
        for name in ("01-version", "02-components", "03-link"):
            root = work / name
            entry = json.loads((root / ".claude-plugin/marketplace.json").read_text())["plugins"][0]
            config = json.loads((root / "plugins/example/.claude-plugin/plugin.json").read_text())
            if name == "01-version":
                self.assertIn("version", entry)
                self.assertIn("version", config)
                self.assertNotIn("strict", entry)
            elif name == "02-components":
                self.assertFalse(entry["strict"])
                self.assertTrue(config["skills"])
                self.assertNotIn("version", entry)
                self.assertNotIn("version", config)
            else:
                link = root / "plugins/example/skills/linked"
                self.assertTrue(link.is_symlink())
                self.assertTrue(link.exists())
                self.assertFalse(link.resolve().is_relative_to(root))
                self.assertTrue(link.resolve().is_relative_to(self.root / "F02"))
                self.assertIn(str(link.relative_to(self.root / "F02")), receipt["input_symlinks"])

    def test_variants_are_not_overlaid_and_current_routes_are_copied(self):
        source = self.small_source()
        archive = self.root / "tree.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            for path in source.rglob("*"):
                if path.is_file():
                    bundle.add(path, arcname=str(path.relative_to(source)))
        skill = Path("plugins/testany-eng/skills/sample/SKILL.md")
        fixtures.write(source / skill, (source / skill).read_text().replace("original bytes", "candidate bytes"))
        fixtures.write(source / "docs/new-route.md", "Newly created route\n")
        fixtures.write(source / "AGENTS.md", "Newest AGENTS\n")
        fixtures.write(source / "CLAUDE.md", "Newest CLAUDE\n")
        for variant in ("original", "candidate"):
            dest = self.root / variant
            prepare.materialize(self.case("F01"), variant, dest, source_root=source, original_archive=archive)
            self.assertIn(variant + " bytes", (dest / prepare.INSTALL / skill).read_text())
            for name in ("AGENTS.md", "CLAUDE.md", "docs/new-route.md", "docs/plugin-discovery.md"):
                self.assertEqual((dest / name).read_bytes(), (source / name).read_bytes())
                self.assertEqual((dest / prepare.INSTALL / name).read_bytes(), (source / name).read_bytes())

    def test_excluded_resources_and_runtime_symlink_checks(self):
        source = self.small_source()
        for relative in ("tests/nested.txt", "skills/sample/__pycache__/foo.pyc", ".DS_Store", "audit-report.md", "grader/expect.json"):
            fixtures.write(source / "plugins/testany-eng" / relative, "must not export")
        frozen = prepare.snapshot("candidate", source)
        self.assertFalse(any(prepare.excluded(path) for path in frozen["resources"]))
        link = source / "plugins/testany-eng/skills/linked"
        link.symlink_to("sample", target_is_directory=True)
        (source / "plugins/testany-eng/skills/routes").symlink_to("../../../docs", target_is_directory=True)
        prepare.materialize(self.case("F01"), destination=self.root / "good", source_root=source)
        self.assertTrue((self.root / "good" / prepare.INSTALL / "plugins/testany-eng/skills/linked").is_symlink())
        self.assertTrue((self.root / "good" / prepare.INSTALL / "plugins/testany-eng/skills/routes/plugin-discovery.md").is_file())
        link.unlink()
        link.symlink_to("/outside-marketplace")
        with self.assertRaisesRegex(ValueError, "symlink escapes or dangles"):
            prepare.materialize(self.case("F01"), destination=self.root / "bad", source_root=source)

    def test_original_unsafe_tar_path_is_rejected(self):
        archive = self.root / "unsafe.tar.gz"
        with tarfile.open(archive, "w:gz") as bundle:
            entry = tarfile.TarInfo("../outside")
            entry.size = 1
            bundle.addfile(entry, io.BytesIO(b"x"))
        with self.assertRaisesRegex(ValueError, "unsafe"):
            prepare.snapshot("original", self.small_source(), archive)
        self.assertFalse((self.root / "outside").exists())

    def test_manifest_receipts_archives_and_collector_compatibility(self):
        out = self.root / "batch output"
        tasks = prepare.prepare(out, cases=["A01", "F02"], source_root=self.small_source())
        self.addCleanup(self.cleanup_runs, tasks)
        self.assertEqual([t["run_key"] for t in tasks], ["A01-1", "F02-1"])
        required = {"run_key", "case_id", "variant", "entry", "directory", "input_hashes"}
        manifest = json.loads((out / "manifest.json").read_text())
        self.assertEqual(manifest["frozen"], prepare.FROZEN)
        self.assertTrue(manifest["governance_files"])
        for name, digest in prepare.FROZEN.items():
            self.assertEqual(prepare.sha((out / "facility-snapshot" / name).read_bytes()), digest)
        for task in tasks:
            self.assertTrue(required <= task.keys())
            key = task["run_key"]
            receipt = json.loads((out / (key + "-receipt.json")).read_text())
            archive = out / (key + "-input.tar.gz")
            self.assertEqual(receipt["archive_sha256"], prepare.sha(archive.read_bytes()))
            root = Path(task["directory"])
            self.assertEqual(receipt["input_hashes"], prepare.input_hashes(root))
            with tarfile.open(archive) as bundle:
                for rel, digest in receipt["input_hashes"].items():
                    self.assertEqual(prepare.sha(bundle.extractfile("input/" + rel).read()), digest)
                for rel, target in receipt["input_symlinks"].items():
                    member = bundle.getmember("input/" + rel)
                    self.assertTrue(member.issym())
                    self.assertEqual(member.linkname, target)
            # Same public evidence collector input comparison, with no dispatched agent needed.
            changed = [rel for rel, before in receipt["input_hashes"].items()
                       if prepare.sha((root / rel).read_bytes()) != before]
            self.assertEqual(changed, [])
            fixtures.write(root / "workspace/new-delivery.md", "new output")
            new = [str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() and str(p.relative_to(root)) not in receipt["input_hashes"]]
            self.assertEqual(new, ["workspace/new-delivery.md"])

    def test_freeze_only_selection_and_refusal_to_overwrite(self):
        source = self.small_source()
        out = self.root / "freeze"
        self.assertEqual(prepare.prepare(out, cases=["A01", "A02"], freeze_only=True, source_root=source), [])
        self.assertFalse(list(out.glob("*-receipt.json")))
        self.assertEqual(json.loads((out / "tasks.json").read_text()), [])
        self.assertTrue((out / "facility-snapshot/adapter.py").is_file())
        before = prepare.input_hashes(out)
        with self.assertRaisesRegex(ValueError, "nonempty"):
            prepare.prepare(out, freeze_only=True, source_root=source)
        self.assertEqual(before, prepare.input_hashes(out))
        for ids in (["NOPE"], []):
            with self.assertRaises(ValueError):
                prepare.prepare(self.root / "invalid", cases=ids, source_root=source)
        with self.assertRaisesRegex(ValueError, "nonempty"):
            prepare.materialize(self.case("F01"), destination=out, frozen_source=self.actual)

    def test_cli_supports_both_output_forms_and_rejects_ambiguous_options(self):
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        script = str(prepare.HOME / "prepare_run.py")
        for form in ([str(self.root / "positional")], ["--output", str(self.root / "named output")]):
            result = subprocess.run([sys.executable, script, "--cases", "A01,A02", "--freeze-only", *form],
                                    env=env, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
        result = subprocess.run([sys.executable, script, str(self.root / "one"), "--output", str(self.root / "two")],
                                env=env, capture_output=True, text=True, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exactly one output", result.stderr)

    def test_actual_original_archive_has_all_plugins(self):
        if not prepare.START.exists():
            self.skipTest("original start archive is not available in this checkout")
        original = prepare.snapshot("original")
        self.assertTrue(original["resources"])
        with tarfile.open(prepare.START) as bundle:
            path = "plugins/testany-bot/skills/testany-case/SKILL.md"
            self.assertEqual(original["resources"][path]["data"], bundle.extractfile(path).read())

    def test_actual_cli_exports_candidate_and_original_receipts(self):
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
        for variant in ("candidate", "original"):
            if variant == "original" and not prepare.START.exists():
                continue
            out = self.root / (variant + " CLI output")
            result = subprocess.run([sys.executable, str(prepare.HOME / "prepare_run.py"),
                                     "--cases", "A01,A02", "--variant", variant, "--output", str(out)],
                                    env=env, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            tasks = json.loads((out / "tasks.json").read_text())
            self.addCleanup(self.cleanup_runs, tasks)
            self.assertEqual([t["case_id"] for t in tasks], ["A01", "A02"])
            manifest = json.loads((out / "manifest.json").read_text())
            if variant == "original":
                self.assertEqual(manifest["start_archive_sha256"], prepare.sha(prepare.START.read_bytes()))
            for task in tasks:
                self.assertEqual(task["variant"], variant)
                receipt = json.loads((out / (task["run_key"] + "-receipt.json")).read_text())
                self.assertEqual(receipt["input_hashes"], prepare.input_hashes(Path(task["directory"])))
                self.assertEqual(receipt["archive_sha256"], prepare.sha((out / receipt["archive"]).read_bytes()))


if __name__ == "__main__":
    unittest.main()
