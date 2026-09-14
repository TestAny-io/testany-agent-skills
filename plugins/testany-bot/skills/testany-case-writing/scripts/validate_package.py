"""Inspect a ZIP and JSON metadata without extraction, execution, or network."""
import argparse
import ast
import hashlib
import io
import json
from pathlib import Path
import re
import stat
import zipfile
import zlib


EXECUTORS = {"pyres", "python", "postman", "playwright", "maven", "gradle", "jmeter"}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON object key")
        result[key] = value
    return result


def parse_json(data):
    def reject_constant(value):
        raise ValueError("nonstandard JSON constant")
    return json.loads(data, object_pairs_hook=unique_object, parse_constant=reject_constant)


def safe_path(value):
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        return None
    if value.startswith("/") or re.match(r"^[A-Za-z]:", value):
        return None
    parts = value.split("/")
    if ".." in parts:
        return None
    normalized = "/".join(p for p in parts if p not in ("", "."))
    return normalized or None


def inspect_package(archive, metadata, max_bytes=64 * 1024 * 1024, max_files=2048):
    errors, gaps, checks = [], [], []
    result = {"status": "incomplete", "errors": errors, "gaps": gaps, "checks": checks,
              "not_verified": ["target runtime and dependency availability", "platform schema/permissions/credentials",
                               "remote upload and configuration", "test execution"],
              "limits": {"max_uncompressed_bytes": max_bytes, "max_members": max_files, "max_metadata_bytes": 1048576}}
    if max_bytes <= 0 or max_files <= 0:
        errors.append("inspection limits must be positive")
        result["status"] = "fail"
        return result
    try:
        with Path(metadata).open("rb") as stream:
            raw_meta = stream.read(1048577)
        if len(raw_meta) > 1048576:
            raise ValueError("metadata exceeds inspection limit")
        result["metadata_sha256"] = hashlib.sha256(raw_meta).hexdigest()
        document = parse_json(raw_meta)
    except (OSError, ValueError, UnicodeError, RecursionError):
        errors.append("metadata must be readable JSON")
        document = {}
    if not isinstance(document, dict):
        errors.append("metadata root must be an object")
        document = {}
    for field in ("name", "description"):
        if not isinstance(document.get(field), str) or not document[field].strip():
            errors.append(f"metadata.{field} must be a nonempty string")
    meta = document.get("case_meta", document)
    if not isinstance(meta, dict):
        errors.append("case_meta must be an object")
        meta = {}
    trigger = meta.get("trigger_method", meta)
    if not isinstance(trigger, dict):
        errors.append("trigger_method must be an object")
        trigger = {}
    executor = trigger.get("executor")
    if not isinstance(executor, str) or not executor:
        errors.append("metadata must declare an executor")
    elif executor not in EXECUTORS:
        gaps.append("executor is not supported by this local inspector; check the actual executor contract")
    variables = meta.get("environment_variables", [])
    if not isinstance(variables, list):
        errors.append("environment_variables must be an array")
        variables = []
    seen = set()
    for index, variable in enumerate(variables):
        label = f"environment_variables[{index}]"
        if not isinstance(variable, dict):
            errors.append(f"{label} must be an object")
            continue
        name = variable.get("name")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Z_][A-Z0-9_]*", name):
            errors.append(f"{label} has an invalid name")
        elif name in seen:
            errors.append(f"{label} repeats a name")
        else:
            seen.add(name)
        if not isinstance(variable.get("description"), str) or not variable["description"].strip():
            errors.append(f"{label} needs a description")
        kind = variable.get("type", "env")
        if kind == "secrets":
            if any(key in variable for key in ("value", "status", "status_reasons")):
                errors.append(f"{label} contains forbidden secret write fields")
            ref = variable.get("secret_ref")
            if not isinstance(ref, dict) or any(not isinstance(ref.get(k), str) or not ref[k].strip()
                                              for k in ("workspace_key", "credential_safe_key", "credential_key")):
                errors.append(f"{label} has incomplete secret_ref")
        elif kind in ("env", "output"):
            if not isinstance(variable.get("value"), str) or not variable["value"].strip():
                errors.append(f"{label} needs a nonempty string value")
            if "secret_ref" in variable:
                errors.append(f"{label} has secret_ref on a non-secret variable")
        else:
            errors.append(f"{label} has an unsupported type")
    entries = []
    if "trigger_path" in trigger:
        entry = safe_path(trigger["trigger_path"])
        if entry is None:
            errors.append("trigger_path must be a safe relative path")
        else:
            entries.append(entry)
    command = trigger.get("trigger_command")
    if "trigger_path" in trigger and command is not None:
        gaps.append("both path and command are declared; verify executor precedence without executing either")
    if command is not None:
        if not isinstance(command, list) or not command or any(not isinstance(v, str) or not v for v in command):
            errors.append("trigger_command must be a nonempty string array")
        elif command[:3] in (["python", "-m", "pytest"], ["python3", "-m", "pytest"]):
            # Only recognize unambiguous argv forms; never execute or shell-parse them.
            args = command[3:]
            candidates = [v for v in args if not v.startswith("-")]
            known_options = {"-v", "-vv", "-q", "--quiet"}
            if not candidates or any(v.startswith("-") and v not in known_options for v in args):
                gaps.append("pytest command entry cannot be resolved by this inspector")
            else:
                for value in candidates:
                    normalized = safe_path(value.split("::", 1)[0])
                    if normalized is None:
                        errors.append("command contains an unsafe entry path")
                    else:
                        entries.append(normalized)
        elif len(command) == 2 and command[0] in ("python", "python3"):
            entry = safe_path(command[1])
            if entry is None or command[1].startswith("-"):
                errors.append("Python command has an invalid script entry")
            else:
                entries.append(entry)
        else:
            gaps.append("command entry requires separate static review; command was not executed")
    if "trigger_path" not in trigger and command is None:
        errors.append("missing trigger_path or trigger_command")
    files = {}
    try:
        path = Path(archive)
        if path.stat().st_size > max_bytes:
            raise ValueError("archive exceeds inspection byte limit")
        with path.open("rb") as stream:
            raw_zip = stream.read(max_bytes + 1)
        if len(raw_zip) > max_bytes:
            raise ValueError("archive exceeds inspection byte limit")
        result["archive_sha256"] = hashlib.sha256(raw_zip).hexdigest()
        with zipfile.ZipFile(io.BytesIO(raw_zip)) as bundle:
            members = bundle.infolist()
            if len(members) > max_files or sum(i.file_size for i in members) > max_bytes:
                raise ValueError("archive exceeds inspection member/uncompressed byte limits")
            all_names = set()
            file_names = set()
            for info in members:
                name = safe_path(info.orig_filename)
                kind = stat.S_IFMT(info.external_attr >> 16)
                if name is None or kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                    errors.append("archive contains an unsafe member path, symlink, or special file")
                    continue
                if name in all_names:
                    errors.append("archive contains duplicate normalized member paths")
                    continue
                all_names.add(name)
                if info.flag_bits & 1:
                    errors.append("encrypted archive members cannot be inspected")
                    continue
                if info.is_dir():
                    continue
                if kind == stat.S_IFDIR:
                    errors.append("archive member has inconsistent directory attributes")
                    continue
                file_names.add(name)
                files[name] = bundle.read(info)
            for name in all_names:
                parts = name.split("/")
                if any("/".join(parts[:i]) in file_names for i in range(1, len(parts))):
                    errors.append("archive has a file/directory parent-path collision")
            checks.append("ZIP members read with CRC verification; no extraction")
    except (OSError, ValueError, RuntimeError, NotImplementedError, zipfile.BadZipFile, zlib.error, EOFError):
        errors.append("archive unreadable, corrupt, unsupported, or exceeds reported inspection limits")
    if not files:
        errors.append("archive contains no inspectable files")
    for entry in entries:
        if entry not in files and not any(name.startswith(entry + "/") for name in files):
            errors.append("declared entry is missing from the archive")
        elif executor in ("postman", "playwright", "maven", "gradle", "jmeter", "python") and entry not in files:
            errors.append("executor entry must resolve to a file, not a directory")
    if entries:
        checks.append("declared file/directory entry existence checked")
    syntax_count = 0
    for name, data in files.items():
        try:
            if name.endswith(".py"):
                ast.parse(data, filename=name)
                syntax_count += 1
            elif name.endswith(".json"):
                parse_json(data)
                syntax_count += 1
        except (SyntaxError, ValueError, UnicodeError, RecursionError):
            errors.append("archive contains invalid Python syntax or JSON")
    checks.append(f"Python AST / JSON parse checked: {syntax_count} file(s); no code execution")
    if executor in ("playwright", "maven", "gradle", "jmeter"):
        gaps.append("executor-specific source/build/entry syntax requires an available static checker")
    if executor == "postman":
        for entry in entries:
            if entry in files:
                try:
                    collection = parse_json(files[entry])
                    if not isinstance(collection, dict) or not isinstance(collection.get("info"), dict) or not isinstance(collection.get("item"), list):
                        errors.append("Postman entry is not a collection with info and item")
                except (ValueError, UnicodeError, RecursionError):
                    errors.append("Postman entry is not readable JSON")
    if not errors:
        checks.append("supported local metadata rules checked")
    result["status"] = "fail" if errors else "incomplete" if gaps else "pass"
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--max-bytes", type=int, default=64 * 1024 * 1024)
    parser.add_argument("--max-files", type=int, default=2048)
    args = parser.parse_args()
    result = inspect_package(args.archive, args.metadata, args.max_bytes, args.max_files)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return {"pass": 0, "fail": 1, "incomplete": 2}[result["status"]]


if __name__ == "__main__":
    raise SystemExit(main())
