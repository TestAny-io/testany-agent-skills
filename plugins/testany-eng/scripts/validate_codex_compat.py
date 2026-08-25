#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "PyYAML is required to validate skills. Install it with `python3 -m pip install pyyaml`."
    ) from exc


REQUIRED_FRONTMATTER_KEYS = {"name", "description"}
MAX_SKILL_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 1024
SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REQUIRED_INTERFACE_KEYS = {"display_name", "short_description"}
SHORT_DESCRIPTION_MIN = 25
SHORT_DESCRIPTION_MAX = 64
BRAND_COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")
PLUGIN_COMPONENT_FIELDS = {
    "skills",
    "commands",
    "agents",
    "hooks",
    "mcpServers",
    "lspServers",
    "outputStyles",
    "workflows",
    "experimental",
}


@dataclass(frozen=True)
class SkillDiscovery:
    active: tuple[Path, ...]
    errors: tuple[str, ...]


def load_frontmatter(skill_md: Path) -> dict:
    text = skill_md.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or lines[0] != "---":
        raise ValueError("SKILL.md must start with YAML frontmatter")

    closing = next((index for index, line in enumerate(lines[1:], 1) if line == "---"), None)
    if closing is None:
        raise ValueError("SKILL.md frontmatter is incomplete")

    data = yaml.safe_load("\n".join(lines[1:closing]))
    if not isinstance(data, dict):
        raise ValueError("SKILL.md frontmatter must parse to a mapping")

    missing = sorted(REQUIRED_FRONTMATTER_KEYS - data.keys())
    if missing:
        raise ValueError(f"SKILL.md missing frontmatter keys: {', '.join(missing)}")

    name = data["name"]
    if not isinstance(name, str) or not name.strip():
        raise ValueError("SKILL.md frontmatter name must be a non-empty string")
    name = name.strip()
    if len(name) > MAX_SKILL_NAME_LENGTH or not SKILL_NAME_PATTERN.fullmatch(name):
        raise ValueError(
            "SKILL.md frontmatter name must be hyphen-case with at most "
            f"{MAX_SKILL_NAME_LENGTH} characters"
        )

    description = data["description"]
    if not isinstance(description, str) or not description.strip():
        raise ValueError("SKILL.md frontmatter description must be a non-empty string")
    if len(description.strip()) > MAX_DESCRIPTION_LENGTH:
        raise ValueError(
            "SKILL.md frontmatter description exceeds "
            f"{MAX_DESCRIPTION_LENGTH} characters"
        )
    return data


def _target_within(path: Path, allowed_root: Path) -> bool:
    try:
        path.resolve().relative_to(allowed_root.resolve())
    except ValueError:
        return False
    return True


def validate_openai_yaml(
    skill_dir: Path,
    skill_name: str | None = None,
    marketplace_root: Path | None = None,
) -> list[str]:
    """Validate optional Codex UI metadata when a skill provides it."""
    errors: list[str] = []
    skill_location = Path(os.path.abspath(skill_dir))
    allowed_target_root = (marketplace_root or skill_dir).resolve()
    openai_yaml = skill_dir / "agents" / "openai.yaml"
    if not openai_yaml.exists() and not openai_yaml.is_symlink():
        return errors

    lexical_openai = Path(os.path.abspath(openai_yaml))
    try:
        lexical_openai.relative_to(skill_location)
    except ValueError:
        return ["agents/openai.yaml escapes the skill directory"]
    resolved_openai = openai_yaml.resolve()
    if not _target_within(resolved_openai, allowed_target_root):
        return ["agents/openai.yaml target escapes the marketplace root"]
    if not resolved_openai.is_file():
        return ["agents/openai.yaml must be a regular file"]

    try:
        data = yaml.safe_load(resolved_openai.read_text(encoding="utf-8"))
    except Exception as exc:
        return [f"agents/openai.yaml is invalid YAML: {exc}"]

    if not isinstance(data, dict):
        return ["agents/openai.yaml must parse to a mapping"]

    if "interface" not in data:
        return errors
    interface = data["interface"]
    if not isinstance(interface, dict):
        return ["agents/openai.yaml interface must be a mapping"]

    missing = sorted(REQUIRED_INTERFACE_KEYS - interface.keys())
    for key in missing:
        errors.append(f"agents/openai.yaml missing interface.{key}")

    display_name = interface.get("display_name")
    if "display_name" in interface and (
        not isinstance(display_name, str) or not display_name.strip()
    ):
        errors.append("interface.display_name must be a non-empty string")

    short_description = interface.get("short_description")
    if "short_description" in interface:
        if not isinstance(short_description, str) or not short_description.strip():
            errors.append("interface.short_description must be a non-empty string")
        elif not (
            SHORT_DESCRIPTION_MIN
            <= len(short_description.strip())
            <= SHORT_DESCRIPTION_MAX
        ):
            errors.append(
                "interface.short_description must be "
                f"{SHORT_DESCRIPTION_MIN}-{SHORT_DESCRIPTION_MAX} characters"
            )

    default_prompt = interface.get("default_prompt")
    if "default_prompt" in interface:
        if not isinstance(default_prompt, str) or not default_prompt.strip():
            errors.append("interface.default_prompt must be a non-empty string")
        elif skill_name is not None and re.search(
            rf"(?<![A-Za-z0-9_-])\${re.escape(skill_name)}(?![A-Za-z0-9_-])",
            default_prompt,
        ) is None:
            errors.append(
                f"interface.default_prompt must explicitly mention ${skill_name}"
            )

    brand_color = interface.get("brand_color")
    if "brand_color" in interface and (
        not isinstance(brand_color, str)
        or BRAND_COLOR_PATTERN.fullmatch(brand_color) is None
    ):
        errors.append("interface.brand_color must be a #RRGGBB string")

    for icon_key in ("icon_small", "icon_large"):
        rel = interface.get(icon_key)
        if icon_key not in interface:
            continue
        if not isinstance(rel, str) or not rel.strip():
            errors.append(f"{icon_key} must be a non-empty string")
            continue
        icon_location = Path(os.path.abspath(skill_dir / rel))
        try:
            icon_location.relative_to(skill_location)
        except ValueError:
            errors.append(f"{icon_key} escapes the skill directory: {rel}")
            continue
        icon_path = icon_location.resolve()
        if not _target_within(icon_path, allowed_target_root):
            errors.append(f"{icon_key} target escapes the marketplace root: {rel}")
            continue
        if not icon_path.is_file():
            errors.append(f"{icon_key} points to missing file: {rel}")

    return errors


def _load_json_mapping(path: Path, label: str) -> tuple[dict | None, list[str]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, [f"missing {label}: {path}"]
    except (OSError, json.JSONDecodeError) as exc:
        return None, [f"invalid {label} {path}: {exc}"]
    if not isinstance(data, dict):
        return None, [f"{label} must parse to a mapping: {path}"]
    return data, []


def _string_entries(
    value: object, field: str, *, required: bool = True
) -> tuple[list[str], list[str]]:
    if value is None and not required:
        return [], []
    if isinstance(value, str) and value.strip():
        return [value], []
    if (
        isinstance(value, list)
        and value
        and all(isinstance(item, str) and item.strip() for item in value)
    ):
        return list(value), []
    qualifier = "required and " if required else ""
    return [], [
        f"{field} must be {qualifier}a non-empty string or list of non-empty strings"
    ]


def _resolve_local_path(root: Path, value: str, field: str) -> tuple[Path | None, list[str]]:
    root = root.resolve()
    path = Path(os.path.abspath(root / value))
    try:
        path.relative_to(root)
    except ValueError:
        return None, [f"{field} escapes its allowed root: {value}"]
    return path, []


def _validate_component_path(value: str, field: str) -> list[str]:
    """Apply Claude's lexical rule for custom component paths."""
    if value != "." and not value.startswith("./"):
        return [
            f"{field} must be '.' or a relative path starting with './': {value}"
        ]
    return []


def _candidate_skill_dirs(path: Path) -> list[Path]:
    """Return every skill exposed by a plugin manifest's skills path."""
    if not path.is_dir():
        return []

    candidates: list[Path] = []
    root_marker = path / "SKILL.md"
    if root_marker.exists() or root_marker.is_symlink():
        candidates.append(path)
    candidates.extend(
        item
        for item in sorted(path.iterdir())
        if (item.is_dir() or item.is_symlink())
        and ((item / "SKILL.md").exists() or (item / "SKILL.md").is_symlink())
    )
    dangling_children = [
        item
        for item in sorted(path.iterdir())
        if item.is_symlink() and not item.exists()
    ]
    candidates.extend(item for item in dangling_children if item not in candidates)
    return candidates


def discover_active_skills(repo_root: Path) -> SkillDiscovery:
    """Discover the Codex-facing skill surface from marketplace plugin sources.

    Marketplace registration selects installed plugin roots. Default ``skills/``
    discovery, plugin-manifest additions, marketplace-entry additions, strict
    authority, and the marketplace-root replacement exception follow Claude's
    documented merge rules. A direct skill path and every immediate child
    containing ``SKILL.md`` are discoverable. Slash commands and optional Codex
    UI metadata do not turn an otherwise discoverable skill on or off.
    """
    repo_root = repo_root.resolve()
    marketplace_path = repo_root / ".claude-plugin" / "marketplace.json"
    if (marketplace_path.exists() or marketplace_path.is_symlink()) and not _target_within(
        marketplace_path, repo_root
    ):
        return SkillDiscovery((), ("marketplace manifest target escapes marketplace root",))
    marketplace, errors = _load_json_mapping(marketplace_path, "marketplace manifest")
    if marketplace is None:
        return SkillDiscovery((), tuple(errors))

    plugins = marketplace.get("plugins")
    if not isinstance(plugins, list):
        errors.append("marketplace plugins must be a list")
        return SkillDiscovery((), tuple(errors))

    active: set[Path] = set()
    for index, plugin in enumerate(plugins):
        label = f"marketplace plugin[{index}]"
        if not isinstance(plugin, dict):
            errors.append(f"{label} must be a mapping")
            continue
        plugin_name = plugin.get("name")
        source = plugin.get("source")
        if not isinstance(plugin_name, str) or not plugin_name.strip():
            errors.append(f"{label} missing non-empty name")
            continue
        if not isinstance(source, str) or not source.strip():
            errors.append(f"{label} missing local source")
            continue

        plugin_root, path_errors = _resolve_local_path(repo_root, source, f"{label} source")
        errors.extend(path_errors)
        if plugin_root is None or not plugin_root.is_dir():
            if plugin_root is not None:
                errors.append(f"{label} source does not exist: {source}")
            continue
        if not _target_within(plugin_root, repo_root):
            errors.append(f"{plugin_name}: plugin source target escapes marketplace root")
            continue

        manifest_path = plugin_root / ".claude-plugin" / "plugin.json"
        if manifest_path.exists() or manifest_path.is_symlink():
            if not _target_within(manifest_path, repo_root):
                errors.append(
                    f"{plugin_name}: plugin manifest target escapes marketplace root"
                )
                continue
            if not manifest_path.resolve().is_file():
                errors.append(f"{plugin_name}: plugin manifest must be a regular file")
                continue
            manifest, manifest_errors = _load_json_mapping(
                manifest_path, "plugin manifest"
            )
            errors.extend(manifest_errors)
            if manifest is None:
                continue
        else:
            manifest = {}

        if "version" in plugin and "version" in manifest:
            errors.append(
                f"{plugin_name}: version must have one authority; remove it from "
                "either the marketplace entry or plugin manifest"
            )

        strict = plugin.get("strict", True)
        if not isinstance(strict, bool):
            errors.append(f"{plugin_name}: marketplace strict must be a boolean")
            continue
        manifest_component_fields = sorted(PLUGIN_COMPONENT_FIELDS & manifest.keys())
        if not strict and manifest_component_fields:
            errors.append(
                f"{plugin_name}: strict:false marketplace entry conflicts with "
                "plugin manifest components: " + ", ".join(manifest_component_fields)
            )
            continue

        manifest_skills_declared = strict and "skills" in manifest
        manifest_skill_entries, manifest_skill_errors = (
            _string_entries(
                manifest.get("skills"),
                "plugin manifest skills",
                required=True,
            )
            if manifest_skills_declared
            else ([], [])
        )
        errors.extend(f"{plugin_name}: {error}" for error in manifest_skill_errors)

        entry_skills_declared = "skills" in plugin
        entry_skill_entries, entry_skill_errors = (
            _string_entries(
                plugin.get("skills"),
                "marketplace entry skills",
                required=True,
            )
            if entry_skills_declared
            else ([], [])
        )
        errors.extend(f"{plugin_name}: {error}" for error in entry_skill_errors)

        def resolve_skill_entries(
            entries: Sequence[str], field: str
        ) -> tuple[list[tuple[str, Path]], list[str]]:
            resolved: list[tuple[str, Path]] = []
            missing: list[str] = []
            for entry in entries:
                component_errors = _validate_component_path(entry, field)
                errors.extend(f"{plugin_name}: {error}" for error in component_errors)
                if component_errors:
                    continue
                skill_path, skill_path_errors = _resolve_local_path(
                    plugin_root, entry, field
                )
                errors.extend(
                    f"{plugin_name}: {error}" for error in skill_path_errors
                )
                if skill_path is None:
                    continue
                if not skill_path.exists():
                    if skill_path.is_symlink():
                        errors.append(
                            f"{plugin_name}: {field} path is a dangling symlink: {entry}"
                        )
                        resolved.append((entry, skill_path))
                        continue
                    missing.append(entry)
                    continue
                resolved.append((entry, skill_path))
            return resolved, missing

        manifest_skill_paths, manifest_missing = resolve_skill_entries(
            manifest_skill_entries, "plugin manifest skills"
        )
        for entry in manifest_missing:
            errors.append(
                f"{plugin_name}: plugin manifest skills path does not exist: {entry}"
            )
        entry_skill_paths, entry_missing = resolve_skill_entries(
            entry_skill_entries, "marketplace entry skills"
        )

        root_source = plugin_root.resolve() == repo_root
        full_scan_entries = {".", "./", "./skills", "./skills/"}
        root_specific_replacement = (
            root_source
            and entry_skills_declared
            and bool(entry_skill_paths)
            and not any(entry in full_scan_entries for entry, _path in entry_skill_paths)
        )
        root_missing_fallback = (
            root_source
            and entry_skills_declared
            and not entry_skill_paths
            and bool(entry_skill_entries)
        )
        if not root_missing_fallback:
            for entry in entry_missing:
                errors.append(
                    f"{plugin_name}: marketplace entry skills path does not exist: {entry}"
                )

        skill_paths: list[tuple[str, Path]] = []
        default_skills = plugin_root / "skills"
        if (
            not root_specific_replacement
            and (default_skills.exists() or default_skills.is_symlink())
        ):
            resolved_default, default_errors = _resolve_local_path(
                plugin_root, "./skills", "default plugin skills"
            )
            errors.extend(f"{plugin_name}: {error}" for error in default_errors)
            if default_skills.is_symlink() and not default_skills.exists():
                errors.append(
                    f"{plugin_name}: default plugin skills path is a dangling symlink"
                )
            elif not _target_within(default_skills, repo_root):
                errors.append(
                    f"{plugin_name}: default plugin skills target escapes marketplace root"
                )
            elif resolved_default is not None and resolved_default.is_dir():
                skill_paths.append(("./skills", default_skills))
            elif resolved_default is not None:
                errors.append(
                    f"{plugin_name}: default plugin skills path must be a directory"
                )

        if not root_specific_replacement:
            skill_paths.extend(manifest_skill_paths)
        skill_paths.extend(entry_skill_paths)

        if (
            not default_skills.exists()
            and not manifest_skills_declared
            and not entry_skills_declared
            and (
                (plugin_root / "SKILL.md").exists()
                or (plugin_root / "SKILL.md").is_symlink()
            )
        ):
            skill_paths.append(("./SKILL.md", plugin_root))

        for entry, skill_path in skill_paths:
            candidates = _candidate_skill_dirs(skill_path)
            if not candidates:
                if entry != "./skills":
                    errors.append(
                        f"{plugin_name}: plugin skills path contains no skills: {entry}"
                    )
                continue
            for candidate in candidates:
                resolved_candidate = candidate.resolve()
                try:
                    resolved_candidate.relative_to(repo_root)
                except ValueError:
                    errors.append(
                        f"{plugin_name}: skill directory target escapes marketplace root: {candidate}"
                    )
                    continue
                skill_md = candidate / "SKILL.md"
                try:
                    resolved_skill_md = skill_md.resolve()
                    resolved_skill_md.relative_to(repo_root)
                except ValueError:
                    errors.append(
                        f"{plugin_name}: SKILL.md target escapes marketplace root: {candidate}"
                    )
                    continue
                if not resolved_skill_md.is_file():
                    errors.append(f"{plugin_name}: missing regular SKILL.md: {candidate}")
                    continue
                active.add(candidate)

    return SkillDiscovery(tuple(sorted(active)), tuple(errors))


def validate_skills(skill_dirs: Iterable[Path], repo_root: Path) -> list[str]:
    repo_root = repo_root.resolve()
    errors: list[str] = []
    for skill_dir in skill_dirs:
        skill_errors: list[str] = []
        skill_md = skill_dir / "SKILL.md"
        frontmatter: dict | None = None
        try:
            resolved_skill_md = skill_md.resolve()
            resolved_skill_md.relative_to(repo_root)
            if not resolved_skill_md.is_file():
                raise ValueError("SKILL.md must be a regular file")
            frontmatter = load_frontmatter(resolved_skill_md)
        except Exception as exc:
            skill_errors.append(str(exc))

        skill_errors.extend(
            validate_openai_yaml(
                skill_dir,
                frontmatter.get("name") if frontmatter is not None else None,
                repo_root,
            )
        )
        for error in skill_errors:
            errors.append(f"{skill_dir.relative_to(repo_root)}: {error}")
    return errors


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate active marketplace skills for Codex compatibility."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        help="Repository root (defaults to the root containing this script).",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    repo_root = (args.repo_root or Path(__file__).resolve().parents[3]).resolve()
    discovery = discover_active_skills(repo_root)
    errors = list(discovery.errors)
    errors.extend(validate_skills(discovery.active, repo_root))

    if errors:
        print("Validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    print(
        f"Validated {len(discovery.active)} active Codex-compatible skills "
        f"from {repo_root / '.claude-plugin' / 'marketplace.json'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
