from __future__ import annotations

import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest

import yaml


SCRIPT = Path(__file__).resolve().parents[1] / "validate_codex_compat.py"
SPEC = importlib.util.spec_from_file_location("frontmatter_profiles_validator", SCRIPT)
VALIDATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VALIDATOR
SPEC.loader.exec_module(VALIDATOR)
ROOT = SCRIPT.parents[3]
PROMPT = ROOT / "plugins/testany-llm/skills/prompt-optimizer/SKILL.md"


class FrontmatterProfileTests(unittest.TestCase):
    def parse(self, extra=None, *, profile="repository", raw=None):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "SKILL.md"
            front = {"name": "example", "description": "Use when testing."}
            front.update(extra or {})
            path.write_text("---\n" + (raw if raw is not None else yaml.safe_dump(front)) + "---\n# Example\n", encoding="utf-8")
            return VALIDATOR.load_frontmatter(path, profile)

    def handler(self):
        return {"type": "prompt", "prompt": "Evaluate $ARGUMENTS", "once": True, "timeout": 20}

    def hooks(self, handler=None):
        return {"hooks": {"Stop": [{"hooks": [self.handler() if handler is None else handler]}]}}

    def test_minimal_skill_passes_both_profiles(self):
        for profile in VALIDATOR.FRONTMATTER_PROFILES:
            self.assertEqual(self.parse(profile=profile)["name"], "example")

    def test_standard_optional_fields_are_validated(self):
        self.parse({"license": "MIT", "metadata": {"version": "1"}, "allowed-tools": "Read Grep", "compatibility": "Requires Python"}, profile="portable")

    def test_compatibility_is_standard_not_a_claude_extension(self):
        self.assertNotIn("compatibility", VALIDATOR.CLAUDE_FRONTMATTER_KEYS)
        self.parse({"compatibility": "Python 3.11"}, profile="portable")

    def test_argument_hint_is_preserved_not_stripped(self):
        value = '[operation] "quoted" <path>'
        self.assertEqual(self.parse({"argument-hint": value})["argument-hint"], value)

    def test_portable_profile_rejects_host_extensions(self):
        for extra in ({"argument-hint": "[path]"}, self.hooks()):
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, "unsupported frontmatter keys for portable"):
                self.parse(extra, profile="portable")

    def test_unknown_keys_are_not_blanket_ignored(self):
        for key in ("argument_hint", "hokos", "future-capability"):
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "unsupported frontmatter keys"):
                self.parse({key: "value"})

    def test_argument_hint_rejects_wrong_type_and_empty_value(self):
        for value in (None, True, 1, [], {}, "", "  "):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "argument-hint must be"):
                self.parse({"argument-hint": value})

    def test_standard_strings_are_not_coerced(self):
        for key in ("license", "compatibility"):
            for value in (False, [], " "):
                with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                    self.parse({key: value})

    def test_compatibility_length_boundary(self):
        self.parse({"compatibility": "x" * 500})
        with self.assertRaisesRegex(ValueError, "500"):
            self.parse({"compatibility": "x" * 501})

    def test_metadata_requires_string_values(self):
        for value in (None, [], {"version": 1}, {"nested": {"hooks": {}}}):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "metadata must be"):
                self.parse({"metadata": value})

    def test_allowed_tools_list_is_host_specific(self):
        data = self.parse({"allowed-tools": ["Read", "Grep"]})
        self.assertEqual(VALIDATOR.claude_extension_fields(data), ["allowed-tools"])
        self.assertEqual(VALIDATOR.claude_extension_fields(self.parse({"allowed-tools": "Read Grep"})), [])
        with self.assertRaisesRegex(ValueError, "allowed-tools must be"):
            self.parse({"allowed-tools": ["Read"]}, profile="portable")

    def test_invalid_allowed_tools_rejected(self):
        for value in ([], ["Read", False], {}, None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.parse({"allowed-tools": value})

    def test_duplicate_top_level_key_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate.*name"):
            self.parse(raw="name: first\nname: second\ndescription: Test\n")

    def test_duplicate_nested_key_rejected(self):
        with self.assertRaisesRegex(ValueError, "duplicate.*once"):
            self.parse(raw="name: test\ndescription: Test\nhooks:\n  Stop:\n    - hooks:\n        - type: prompt\n          prompt: Test\n          once: false\n          once: true\n")

    def test_non_string_yaml_key_rejected(self):
        with self.assertRaisesRegex(ValueError, "keys must be strings"):
            self.parse(raw="name: test\ndescription: Test\n1: bad\n")

    def test_yaml_object_constructor_is_not_executed(self):
        with self.assertRaises(yaml.YAMLError):
            self.parse(raw="name: test\ndescription: !!python/object/apply:os.system ['false']\n")

    def test_description_placeholder_and_angle_brackets_rejected(self):
        for text in ("[TODO: describe]", "Use <input>"):
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.parse({"description": text})

    def test_hook_structure_preserved(self):
        extra = self.hooks()
        self.assertEqual(self.parse(extra)["hooks"], extra["hooks"])

    def test_hook_must_be_mapping_with_supported_event(self):
        for hooks in (None, [], {}, {"Stop": [], "PostToolUse": []}, {"Stop": "bad"}):
            with self.subTest(hooks=hooks), self.assertRaises(ValueError):
                self.parse({"hooks": hooks})

    def test_stop_matcher_cannot_silently_look_scoped(self):
        extra = self.hooks()
        extra["hooks"]["Stop"][0]["matcher"] = "prompt-optimizer"
        with self.assertRaisesRegex(ValueError, "Stop has no matcher"):
            self.parse(extra)

    def test_empty_or_non_mapping_hook_handlers_rejected(self):
        for handlers in ([], "bad", ["bad"], [None]):
            with self.subTest(handlers=handlers), self.assertRaises(ValueError):
                self.parse({"hooks": {"Stop": [{"hooks": handlers}]}})

    def test_unsupported_hook_types_are_not_claimed_valid(self):
        for kind in (None, "command", "agent", "http", "mcp_tool"):
            handler = self.handler()
            handler["type"] = kind
            with self.subTest(kind=kind), self.assertRaisesRegex(ValueError, "only type: prompt"):
                self.parse(self.hooks(handler))

    def test_unknown_hook_fields_rejected(self):
        for key in ("timeuot", "command", "model", "if", "async"):
            handler = self.handler()
            handler[key] = "bad"
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, "unsupported Stop hook"):
                self.parse(self.hooks(handler))

    def test_hook_prompt_must_be_nonempty_string(self):
        for value in (None, {}, " "):
            handler = self.handler()
            handler["prompt"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "prompt must be"):
                self.parse(self.hooks(handler))

    def test_once_must_be_true_boolean_on_handler(self):
        for value in (None, False, "true", 1):
            handler = self.handler()
            if value is None:
                del handler["once"]
            else:
                handler["once"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "once: true"):
                self.parse(self.hooks(handler))

    def test_timeout_must_be_positive_finite_non_boolean(self):
        for value in (0, -1, False, "20", float("nan"), float("inf"), 10 ** 400):
            handler = self.handler()
            handler["timeout"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "positive finite"):
                self.parse(self.hooks(handler))

    def test_timeout_default_and_fraction_supported(self):
        handler = self.handler()
        del handler["timeout"]
        self.parse(self.hooks(handler))
        handler["timeout"] = 1.5
        self.parse(self.hooks(handler))

    def test_status_message_type_checked(self):
        handler = self.handler()
        handler["statusMessage"] = False
        with self.assertRaisesRegex(ValueError, "statusMessage"):
            self.parse(self.hooks(handler))

    def test_actual_optimizer_is_once_and_keeps_reentry_guard(self):
        data = VALIDATOR.load_frontmatter(PROMPT)
        handler = data["hooks"]["Stop"][0]["hooks"][0]
        self.assertIs(handler["once"], True)
        self.assertIn('若 stop_hook_active 为 true，必须返回 {"ok": true}', handler["prompt"])
        self.assertIn("当前任务不是创建或修改 prompt", handler["prompt"])
        old = copy.deepcopy(data)
        del old["hooks"]["Stop"][0]["hooks"][0]["once"]
        with self.assertRaisesRegex(ValueError, "once: true"):
            self.parse(old)

    def test_all_active_skills_valid_and_extensions_explicit(self):
        discovery = VALIDATOR.discover_active_skills(ROOT)
        self.assertFalse(discovery.errors)
        self.assertFalse(VALIDATOR.validate_skills(discovery.active, ROOT))
        extensions = {p.name for p in discovery.active if VALIDATOR.claude_extension_fields(VALIDATOR.load_frontmatter(p / "SKILL.md"))}
        self.assertEqual(extensions, {"testany-case", "testany-case-writing", "testany-execution", "testany-import-git", "testany-pipeline", "prompt-optimizer"})

    def test_json_cli_distinguishes_profiles_and_runtime(self):
        for profile, code in (("repository", 0), ("portable", 1)):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(VALIDATOR.main(["--repo-root", str(ROOT), "--profile", profile, "--format", "json"]), code)
            report = json.loads(output.getvalue())
            self.assertEqual(report["profile"], profile)
            self.assertFalse(report["host_runtime_verified"])
            if code == 0:
                self.assertEqual(len(report["claude_extensions"]), 6)
            else:
                self.assertEqual(len(report["errors"]), 6)

    def test_unknown_profile_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "unknown frontmatter profile"):
            self.parse(profile="anything")


if __name__ == "__main__":
    unittest.main()
