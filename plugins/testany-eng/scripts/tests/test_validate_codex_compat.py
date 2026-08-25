from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "validate_codex_compat.py"
SPEC = importlib.util.spec_from_file_location("validate_codex_compat", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VALIDATOR
SPEC.loader.exec_module(VALIDATOR)


class ValidateCodexCompatTests(unittest.TestCase):
    maxDiff = None

    def write(self, root: Path, relative: str, content: str) -> Path:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(textwrap.dedent(content).lstrip(), encoding="utf-8")
        return path

    def write_json(self, root: Path, relative: str, payload: dict) -> Path:
        return self.write(root, relative, json.dumps(payload))

    def write_skill(self, root: Path, relative: str, name: str) -> Path:
        skill_dir = root / relative
        self.write(
            root,
            f"{relative}/SKILL.md",
            f"""
            ---
            name: {name}
            description: Use when testing {name}.
            ---

            # {name}
            """,
        )
        return skill_dir.resolve()

    def write_marketplace_plugin(self, root: Path, name: str = "acme-tools") -> Path:
        plugin_root = (root / "plugins" / name).resolve()
        self.write_json(
            root,
            ".claude-plugin/marketplace.json",
            {"plugins": [{"name": name, "source": f"./plugins/{name}"}]},
        )
        self.write_json(
            root,
            f"plugins/{name}/.claude-plugin/plugin.json",
            {"name": name, "skills": "./skills", "commands": "./commands"},
        )
        return plugin_root

    def test_discovery_uses_marketplace_and_declared_skills_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            command_skill = self.write_skill(root, "plugins/acme-tools/skills/lint", "lint")
            metadata_skill = self.write_skill(
                root, "plugins/acme-tools/skills/implicit", "implicit"
            )
            commandless_skill = self.write_skill(
                root, "plugins/acme-tools/skills/commandless", "commandless"
            )
            self.write(root, "plugins/acme-tools/commands/lint.md", "# lint\n")
            self.write(
                root,
                "plugins/acme-tools/skills/implicit/agents/openai.yaml",
                """
                interface:
                  display_name: Implicit
                  short_description: Implicit skill
                  default_prompt: Use the implicit skill.
                  icon_small: ./assets/small.png
                  icon_large: ./assets/large.svg
                """,
            )
            self.write(root, "plugins/acme-tools/skills/implicit/assets/small.png", "small")
            self.write(root, "plugins/acme-tools/skills/implicit/assets/large.svg", "large")
            self.write_skill(root, "plugins/backup/skills/broken", "broken")

            result = VALIDATOR.discover_active_skills(root)

        self.assertEqual(result.errors, ())
        self.assertEqual(
            set(result.active), {command_skill, metadata_skill, commandless_skill}
        )

    def test_active_skill_does_not_require_optional_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(root, "plugins/acme-tools/skills/lint", "lint")
            self.write(root, "plugins/acme-tools/commands/lint.md", "# lint\n")

            discovery = VALIDATOR.discover_active_skills(root)
            errors = VALIDATOR.validate_skills(discovery.active, root)

        self.assertEqual(discovery.active, (skill_dir,))
        self.assertEqual(errors, [])

    def test_duplicate_plugin_version_authority_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {
                            "name": "acme-tools",
                            "source": "./plugins/acme-tools",
                            "version": "1.0.0",
                        }
                    ]
                },
            )
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "version": "1.0.0"},
            )
            self.write_skill(
                root, "plugins/acme-tools/skills/default", "default"
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(len(discovery.active), 1)
        self.assertTrue(
            any("version must have one authority" in error for error in discovery.errors)
        )

    def test_strict_false_conflicts_with_manifest_experimental_components(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {
                            "name": "acme-tools",
                            "source": "./plugins/acme-tools",
                            "strict": False,
                        }
                    ]
                },
            )
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {
                    "name": "acme-tools",
                    "experimental": {"themes": ["./themes/dark.json"]},
                },
            )
            self.write_skill(
                root, "plugins/acme-tools/skills/default", "default"
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, ())
        self.assertTrue(
            any(
                "strict:false marketplace entry conflicts" in error
                and "experimental" in error
                for error in discovery.errors
            )
        )

    def test_default_skills_are_discovered_without_manifest_skills_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(
                root, "plugins/acme-tools/skills/default", "default"
            )
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools"},
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(discovery.active, (skill_dir,))

    def test_custom_skills_are_additive_to_default_skills(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            default_skill = self.write_skill(
                root, "plugins/acme-tools/skills/default", "default"
            )
            custom_skill = self.write_skill(
                root, "plugins/acme-tools/custom/extra", "extra"
            )
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": "./custom"},
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(set(discovery.active), {default_skill, custom_skill})

    def test_marketplace_root_custom_skills_replaces_default_scan(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {
                            "name": "meta",
                            "source": "./",
                            "skills": "./custom-skills",
                        }
                    ]
                },
            )
            self.write_json(
                root,
                ".claude-plugin/plugin.json",
                {"name": "meta"},
            )
            self.write_skill(root, "skills/default", "default")
            custom = self.write_skill(root, "custom-skills/extra", "extra")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(discovery.active, (custom,))

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_marketplace_root_symlink_uses_root_replacement_semantics(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "root-alias").symlink_to(root, target_is_directory=True)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {
                            "name": "meta",
                            "source": "./root-alias",
                            "skills": "./custom-skills",
                        }
                    ]
                },
            )
            self.write_json(
                root,
                ".claude-plugin/plugin.json",
                {"name": "meta"},
            )
            self.write_skill(root, "skills/default", "default")
            custom = self.write_skill(root, "custom-skills/extra", "extra")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(discovery.active, (custom,))

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_marketplace_root_dangling_entry_does_not_trigger_missing_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            (root / "dangling").symlink_to(root / "missing", target_is_directory=True)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {"name": "meta", "source": "./", "skills": "./dangling"}
                    ]
                },
            )
            self.write_json(root, ".claude-plugin/plugin.json", {"name": "meta"})
            self.write_skill(root, "skills/default", "default")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, ())
        self.assertTrue(
            any("dangling symlink" in error for error in discovery.errors)
        )

    def test_custom_skills_path_requires_dot_slash_prefix(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            self.write_skill(root, "plugins/acme-tools/custom/extra", "extra")
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": "custom"},
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, ())
        self.assertTrue(
            any("must be '.' or a relative path starting with './'" in error for error in discovery.errors)
        )

    def test_skills_dot_selects_plugin_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plugin_root = self.write_marketplace_plugin(root)
            self.write_skill(root, "plugins/acme-tools", "root-skill")
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": "."},
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertIn(plugin_root, discovery.active)

    def test_explicit_null_skills_is_invalid_not_absent(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": None},
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertTrue(
            any("plugin manifest skills must be" in error for error in discovery.errors)
        )

    def test_marketplace_root_manifest_skills_remain_additive_without_entry_override(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {"plugins": [{"name": "meta", "source": "./"}]},
            )
            self.write_json(
                root,
                ".claude-plugin/plugin.json",
                {"name": "meta", "skills": "./custom-skills"},
            )
            default = self.write_skill(root, "skills/default", "default")
            custom = self.write_skill(root, "custom-skills/extra", "extra")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(set(discovery.active), {default, custom})

    def test_strict_true_marketplace_skills_supplement_manifest_and_default(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {
                            "name": "acme-tools",
                            "source": "./plugins/acme-tools",
                            "strict": True,
                            "skills": "./entry-skills",
                        }
                    ]
                },
            )
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": "./manifest-skills"},
            )
            default = self.write_skill(
                root, "plugins/acme-tools/skills/default", "default"
            )
            manifest = self.write_skill(
                root, "plugins/acme-tools/manifest-skills/one", "one"
            )
            entry = self.write_skill(
                root, "plugins/acme-tools/entry-skills/two", "two"
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(set(discovery.active), {default, manifest, entry})

    def test_strict_false_rejects_component_bearing_plugin_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {
                            "name": "acme-tools",
                            "source": "./plugins/acme-tools",
                            "strict": False,
                            "skills": "./entry-skills",
                        }
                    ]
                },
            )
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": "./manifest-skills"},
            )
            self.write_skill(root, "plugins/acme-tools/entry-skills/two", "two")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, ())
        self.assertTrue(
            any("strict:false" in error and "skills" in error for error in discovery.errors)
        )

    def test_marketplace_root_missing_entry_paths_fall_back_to_default_scan(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {
                            "name": "meta",
                            "source": "./",
                            "skills": ["./missing-a", "./missing-b"],
                        }
                    ]
                },
            )
            self.write_json(root, ".claude-plugin/plugin.json", {"name": "meta"})
            default = self.write_skill(root, "skills/default", "default")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(discovery.active, (default,))

    def test_marketplace_root_listing_default_skills_keeps_full_scan(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_json(
                root,
                ".claude-plugin/marketplace.json",
                {
                    "plugins": [
                        {"name": "meta", "source": "./", "skills": "./skills/"}
                    ]
                },
            )
            self.write_json(
                root,
                ".claude-plugin/plugin.json",
                {"name": "meta", "skills": "./custom-skills"},
            )
            default = self.write_skill(root, "skills/default", "default")
            custom = self.write_skill(root, "custom-skills/extra", "extra")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(set(discovery.active), {default, custom})

    def test_invalid_default_skill_cannot_be_hidden_by_custom_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            default_skill = self.write_skill(
                root, "plugins/acme-tools/skills/default", "default"
            )
            self.write(root, "plugins/acme-tools/skills/default/SKILL.md", "broken\n")
            self.write_skill(root, "plugins/acme-tools/custom/extra", "extra")
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": "./custom"},
            )

            discovery = VALIDATOR.discover_active_skills(root)
            errors = VALIDATOR.validate_skills(discovery.active, root)

        self.assertIn(default_skill, discovery.active)
        self.assertTrue(any("must start with YAML" in error for error in errors))

    def test_plugin_manifest_is_optional_for_default_skills(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plugin_root = self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(
                root, "plugins/acme-tools/skills/default", "default"
            )
            (plugin_root / ".claude-plugin" / "plugin.json").unlink()

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(discovery.active, (skill_dir,))

    def test_dangling_default_skills_directory_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plugin_root = self.write_marketplace_plugin(root)
            (plugin_root / "skills").symlink_to(plugin_root / "missing-skills")
            (plugin_root / ".claude-plugin" / "plugin.json").unlink()

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, ())
        self.assertTrue(any("dangling symlink" in error for error in discovery.errors))

    def test_default_skills_target_outside_marketplace_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "marketplace"
            outside = Path(tmpdir) / "outside-skills"
            root.mkdir()
            outside.mkdir()
            plugin_root = self.write_marketplace_plugin(root)
            (plugin_root / "skills").symlink_to(outside, target_is_directory=True)
            (plugin_root / ".claude-plugin" / "plugin.json").unlink()

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, ())
        self.assertTrue(
            any("target escapes marketplace root" in error for error in discovery.errors)
        )

    def test_root_single_skill_is_discovered_without_manifest_or_skills_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plugin_root = self.write_marketplace_plugin(root)
            (plugin_root / ".claude-plugin" / "plugin.json").unlink()
            skill_dir = self.write_skill(root, "plugins/acme-tools", "root-skill")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.errors, ())
        self.assertEqual(discovery.active, (skill_dir,))

    def test_child_skill_is_active_without_matching_command(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root, "acme-bot")
            skill_dir = self.write_skill(
                root, "plugins/acme-bot/skills/acme-import", "acme-import"
            )
            self.write(root, "plugins/acme-bot/commands/import.md", "# import\n")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, (skill_dir,))

    def test_explicit_skill_path_is_active_without_command_or_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(root, "plugins/acme-tools/skills/direct", "direct")
            self.write_json(
                root,
                "plugins/acme-tools/.claude-plugin/plugin.json",
                {"name": "acme-tools", "skills": "./skills/direct"},
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertEqual(discovery.active, (skill_dir,))

    def test_minimal_generated_metadata_is_valid(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(root, "plugins/acme-tools/skills/lint", "lint")
            self.write(
                root,
                "plugins/acme-tools/skills/lint/agents/openai.yaml",
                """
                interface:
                  display_name: Lint
                  short_description: Concise metadata for lint tests
                """,
            )

            errors = VALIDATOR.validate_skills((skill_dir,), root)

        self.assertEqual(errors, [])

    def test_present_metadata_fields_are_strictly_typed_and_bounded(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(root, "plugins/acme-tools/skills/lint", "lint")
            self.write(
                root,
                "plugins/acme-tools/skills/lint/agents/openai.yaml",
                """
                interface:
                  display_name: 12
                  short_description: []
                  default_prompt: null
                  brand_color: red
                  icon_small: []
                """,
            )

            errors = VALIDATOR.validate_skills((skill_dir,), root)

        joined = "\n".join(errors)
        self.assertIn("display_name must be a non-empty string", joined)
        self.assertIn("short_description must be a non-empty string", joined)
        self.assertIn("default_prompt must be a non-empty string", joined)
        self.assertIn("brand_color must be a #RRGGBB string", joined)
        self.assertIn("icon_small must be a non-empty string", joined)

    def test_null_interface_is_not_treated_as_absent(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(root, "plugins/acme-tools/skills/lint", "lint")
            self.write(
                root,
                "plugins/acme-tools/skills/lint/agents/openai.yaml",
                "interface: null\n",
            )

            errors = VALIDATOR.validate_skills((skill_dir,), root)

        self.assertTrue(any("interface must be a mapping" in item for item in errors))

    def test_default_prompt_must_name_the_exact_skill(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            self.write_marketplace_plugin(root)
            skill_dir = self.write_skill(root, "plugins/acme-tools/skills/lint", "lint")
            self.write(
                root,
                "plugins/acme-tools/skills/lint/agents/openai.yaml",
                """
                interface:
                  display_name: Lint
                  short_description: Concise metadata for lint tests
                  default_prompt: Use $other-skill to lint this change.
                """,
            )

            errors = VALIDATOR.validate_skills((skill_dir,), root)

        self.assertTrue(any("must explicitly mention $lint" in item for item in errors))

    def test_frontmatter_requires_string_values_and_exact_delimiter_lines(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            invalid_name = self.write(
                root,
                "invalid-name/SKILL.md",
                """
                ---
                name: [bad]
                description: valid
                ---
                # body
                """,
            )
            invalid_description = self.write(
                root,
                "invalid-description/SKILL.md",
                """
                ---
                name: valid
                description: 123
                ---
                # body
                """,
            )
            valid_embedded = self.write(
                root,
                "valid/SKILL.md",
                """
                ---
                name: valid
                description: "value with foo---bar inside"
                ---
                # body
                """,
            )

            with self.assertRaisesRegex(ValueError, "name must be"):
                VALIDATOR.load_frontmatter(invalid_name)
            with self.assertRaisesRegex(ValueError, "description must be"):
                VALIDATOR.load_frontmatter(invalid_description)
            self.assertEqual(VALIDATOR.load_frontmatter(valid_embedded)["name"], "valid")

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_same_marketplace_skill_symlink_is_supported_but_icon_path_is_lexical(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plugin_root = self.write_marketplace_plugin(root)
            shared_skill = self.write_skill(
                root, "plugins/shared/skills/shared-lint", "shared-lint"
            )
            (plugin_root / "skills").mkdir(parents=True, exist_ok=True)
            linked_skill = plugin_root / "skills" / "shared-lint"
            linked_skill.symlink_to(
                shared_skill, target_is_directory=True
            )

            safe_skill = self.write_skill(
                root, "plugins/acme-tools/skills/safe", "safe"
            )
            outside_icon = self.write(root, "outside/icon.svg", "<svg/>\n")
            self.write(
                root,
                "plugins/acme-tools/skills/safe/agents/openai.yaml",
                f"""
                interface:
                  display_name: Safe
                  short_description: Safe skill
                  default_prompt: Use safe.
                  icon_small: {outside_icon}
                  icon_large: {outside_icon}
                """,
            )

            discovery = VALIDATOR.discover_active_skills(root)
            errors = list(discovery.errors)
            errors.extend(VALIDATOR.validate_skills(discovery.active, root))

        joined = "\n".join(errors)
        self.assertIn("icon_small escapes the skill directory", joined)
        self.assertIn(safe_skill, discovery.active)
        self.assertIn(linked_skill, discovery.active)
        self.assertFalse(any("skill directory target escapes" in item for item in errors))

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_skill_symlink_target_outside_marketplace_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            outer = Path(tmpdir)
            root = outer / "marketplace"
            root.mkdir()
            plugin_root = self.write_marketplace_plugin(root)
            outside_skill = self.write_skill(outer, "external/escaped", "escaped")
            (plugin_root / "skills").mkdir(parents=True, exist_ok=True)
            (plugin_root / "skills" / "escaped").symlink_to(
                outside_skill, target_is_directory=True
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertTrue(
            any("skill directory target escapes marketplace root" in item for item in discovery.errors)
        )

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_dangling_skill_md_symlink_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plugin_root = self.write_marketplace_plugin(root)
            skill_dir = plugin_root / "skills" / "dangling"
            skill_dir.mkdir(parents=True)
            (skill_dir / "SKILL.md").symlink_to(root / "missing-SKILL.md")

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertTrue(any("missing regular SKILL.md" in item for item in discovery.errors))

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_dangling_skill_directory_symlink_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            plugin_root = self.write_marketplace_plugin(root)
            (plugin_root / "skills").mkdir(parents=True, exist_ok=True)
            (plugin_root / "skills" / "dangling").symlink_to(
                root / "missing-skill-directory", target_is_directory=True
            )

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertTrue(any("missing regular SKILL.md" in item for item in discovery.errors))

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_marketplace_manifest_target_outside_root_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            outer = Path(tmpdir)
            root = outer / "marketplace"
            (root / ".claude-plugin").mkdir(parents=True)
            external = self.write_json(outer, "external/marketplace.json", {"plugins": []})
            (root / ".claude-plugin" / "marketplace.json").symlink_to(external)

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertIn(
            "marketplace manifest target escapes marketplace root", discovery.errors
        )

    @unittest.skipIf(os.name == "nt", "symlink semantics differ on Windows")
    def test_plugin_manifest_target_outside_root_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            outer = Path(tmpdir)
            root = outer / "marketplace"
            root.mkdir()
            plugin_root = self.write_marketplace_plugin(root)
            manifest = plugin_root / ".claude-plugin" / "plugin.json"
            manifest.unlink()
            external = self.write_json(
                outer, "external/plugin.json", {"name": "acme-tools"}
            )
            manifest.symlink_to(external)

            discovery = VALIDATOR.discover_active_skills(root)

        self.assertTrue(
            any("plugin manifest target escapes marketplace root" in item for item in discovery.errors)
        )

    def test_current_repository_discovery_filters_unregistered_plugin_artifacts(self) -> None:
        repo_root = SCRIPT_PATH.parents[3]
        discovery = VALIDATOR.discover_active_skills(repo_root)
        active = {path.relative_to(repo_root).as_posix() for path in discovery.active}
        self.assertIn("plugins/testany-bot/skills/testany-import-git", active)
        self.assertNotIn("plugins/testany-eng/skills/prd-studio", active)
        self.assertEqual(discovery.errors, ())
        self.assertFalse(any("testany-bot.backup" in path for path in active))
        self.assertFalse(any("testany-jira-wip" in path for path in active))


if __name__ == "__main__":
    unittest.main()
