#!/usr/bin/env python3
"""Read-only structural checks and bounded views of a delivery ledger (stdlib only)."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict, deque
import json
from pathlib import Path
import re
import sys

STATES = ("todo", "doing", "blocked", "failed", "needs_confirmation", "done", "deferred", "cancelled")
QUESTION_STATES = ("draft", "pending", "answered", "closed", "unavailable")
ID = re.compile(r"[A-Za-z][A-Za-z0-9_.:-]{0,79}\Z")


class LedgerError(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise LedgerError(message)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def id_list(value, label):
    require(isinstance(value, list), f"{label}: expected an ID array")
    require(all(isinstance(x, str) and ID.fullmatch(x) for x in value), f"{label}: invalid ID")
    require(len(value) == len(set(value)), f"{label}: duplicate ID")
    return value


def indexed(value, label):
    require(isinstance(value, list), f"{label}: expected an array")
    result = {}
    for entry in value:
        require(isinstance(entry, dict), f"{label}: expected an object")
        key = entry.get("id")
        require(isinstance(key, str) and ID.fullmatch(key), f"{label}: invalid ID")
        require(key not in result, f"{label}: duplicate ID {key}")
        result[key] = entry
    return result


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"Duplicate JSON key: {key}")
        result[key] = value
    return result


class Ledger:
    def __init__(self, data):
        require(isinstance(data, dict), "Ledger must be an object")
        require(type(data.get("schema_version")) is int and data["schema_version"] == 1,
                "Unsupported schema_version")
        require(isinstance(data.get("project"), str), "project: expected a string")
        require(type(data.get("revision")) is int and data["revision"] >= 0, "revision: expected nonnegative integer")
        require(data.get("as_of") is None or nonempty(data["as_of"]), "as_of: expected timestamp or null")
        require(isinstance(data.get("roles"), dict), "roles: expected an object")
        require(isinstance(data.get("changes"), list), "changes: expected an array")
        self.data = data
        self.tasks = indexed(data.get("tasks"), "tasks")
        self.collections = indexed(data.get("collections"), "collections")
        self.questions = indexed(data.get("questions"), "questions")
        self.children = defaultdict(list)
        for key, task in self.tasks.items():
            for field in ("title", "owner", "done_when", "source"):
                require(nonempty(task.get(field)), f"{key}.{field}: required nonempty string")
            require(task.get("scope") in ("accepted", "proposed"), f"{key}: invalid scope")
            require(task.get("status") in STATES, f"{key}: invalid status")
            parent = task.get("parent_id")
            require(parent is None or isinstance(parent, str) and parent in self.tasks,
                    f"{key}: unknown parent")
            self.children[parent].append(key)
            deps = id_list(task.get("depends_on"), f"{key}.depends_on")
            require(all(dep in self.tasks for dep in deps), f"{key}: unknown dependency")
            evidence = task.get("evidence")
            require(isinstance(evidence, list) and all(nonempty(x) for x in evidence),
                    f"{key}.evidence: expected reference strings")
            require(task.get("updated_at") is None or nonempty(task["updated_at"]),
                    f"{key}.updated_at: expected timestamp or null")
            if task["status"] in ("done", "cancelled", "deferred"):
                require(bool(evidence), f"{key}: {task['status']} requires a result/decision reference")
        for key, collection in self.collections.items():
            require(nonempty(collection.get("title")) and nonempty(collection.get("source")),
                    f"{key}: collection title/source required")
            ids = id_list(collection.get("task_ids"), f"{key}.task_ids")
            require(all(x in self.tasks for x in ids), f"{key}: unknown collection member")
        for key, question in self.questions.items():
            ids = id_list(question.get("task_ids"), f"{key}.task_ids")
            require(ids and all(x in self.tasks for x in ids), f"{key}: unknown/missing question task")
            require(question.get("status") in QUESTION_STATES, f"{key}: invalid question status")
            require(nonempty(question.get("to")) and nonempty(question.get("question")),
                    f"{key}: recipient/question required")
            if question["status"] == "pending":
                require(nonempty(question.get("sent_ref")), f"{key}: pending question needs sent_ref")
            if question["status"] in ("answered", "closed"):
                require(nonempty(question.get("answer_ref")), f"{key}: answered question needs answer_ref")
        self.needs = {key: set(self.children[key]) | set(task["depends_on"])
                      for key, task in self.tasks.items()}
        order = self.order()
        focus = id_list(data.get("focus"), "focus")
        require(all(x in self.tasks for x in focus), "focus: unknown task")
        require(all(b in self.needs[a] for a, b in zip(focus, focus[1:])),
                "focus: adjacent tasks must be a child or prerequisite")
        self.effective = {}
        self.conflicts = {}
        for key in order:
            task = self.tasks[key]
            unmet = {x for x in self.children[key] if self.tasks[x]["scope"] == "accepted"
                     and self.effective[x] not in ("done", "cancelled")}
            unmet.update(x for x in task["depends_on"]
                         if self.effective[x] != "done" or self.tasks[x]["scope"] != "accepted")
            self.effective[key] = task["status"]
            if task["status"] == "done" and unmet:
                self.effective[key] = "needs_confirmation"
                self.conflicts[key] = sorted(unmet)

    def order(self):
        """Prerequisites first; detect combined containment/dependency cycles without recursion."""
        remaining = {key: len(values) for key, values in self.needs.items()}
        consumers = defaultdict(list)
        for key, values in self.needs.items():
            for value in values:
                consumers[value].append(key)
        ready = deque(key for key in self.tasks if remaining[key] == 0)
        result = []
        while ready:
            key = ready.popleft()
            result.append(key)
            for consumer in consumers[key]:
                remaining[consumer] -= 1
                if remaining[consumer] == 0:
                    ready.append(consumer)
        require(len(result) == len(self.tasks),
                "Combined hierarchy/dependency cycle: " + ", ".join(k for k, n in remaining.items() if n)[:400])
        return result

    def counts(self, ids):
        accepted = [x for x in ids if self.tasks[x]["scope"] == "accepted"]
        statuses = Counter(self.effective[x] for x in accepted)
        return {"units": len(ids), "accepted": len(accepted), "proposed": len(ids) - len(accepted),
                "states": {x: statuses[x] for x in STATES},
                "active_remaining": sum(statuses[x] for x in STATES[:5])}

    def item(self, key):
        task = self.tasks[key]
        return {"id": key, "title": task["title"][:120], "scope": task["scope"],
                "declared_status": task["status"], "effective_status": self.effective[key],
                "owner": task["owner"][:80], "child_count": len(self.children[key]),
                "dependency_count": len(task["depends_on"])}

    def base(self, limit):
        conflicts = list(self.conflicts.items())
        return {"recorded_structure_only": True, "revision": self.data["revision"],
                "as_of": self.data.get("as_of"), "task_nodes": len(self.tasks),
                "question_states": dict(Counter(q["status"] for q in self.questions.values())),
                "completion_conflict_count": len(conflicts),
                "completion_conflicts": [{"id": key, "unmet": unmet[:limit], "unmet_count": len(unmet)}
                                         for key, unmet in conflicts[:limit]],
                "completion_conflicts_omitted": max(0, len(conflicts) - limit)}

    def status(self, collection=None, focus=None, pending_only=False, limit=12, offset=0):
        result = self.base(limit)
        if collection:
            require(collection in self.collections, f"Unknown collection: {collection}")
            ids = self.collections[collection]["task_ids"]
            result.update(unit_basis="fixed_collection_members", collection=collection)
        elif focus:
            require(focus in self.tasks, f"Unknown focus: {focus}")
            ids = self.children[focus]
            ancestry = []
            cursor = focus
            while cursor is not None:
                ancestry.append(cursor)
                cursor = self.tasks[cursor].get("parent_id")
            deps = self.tasks[focus]["depends_on"]
            path = list(reversed(ancestry))
            result.update(unit_basis="direct_children", focus=self.item(focus),
                          containment_path=path[-limit:], containment_path_omitted=max(0, len(path) - limit),
                          containment_root=path[0],
                          dependencies=[self.item(x) for x in deps[:limit]],
                          dependencies_omitted=max(0, len(deps) - limit))
        else:
            ids = self.children[None]
            collections = list(self.collections.items())
            path = self.data["focus"]
            result.update(unit_basis="top_level_goals", focus_path=path[-limit:],
                          focus_path_omitted=max(0, len(path) - limit), focus_root=path[0] if path else None,
                          collections=[{"id": key, **self.counts(c["task_ids"])}
                                       for key, c in collections[:limit]],
                          collections_omitted=max(0, len(collections) - limit))
        result["counts"] = self.counts(ids)
        visible = [x for x in ids if not pending_only or self.tasks[x]["scope"] == "accepted"
                   and self.effective[x] not in ("done", "cancelled")]
        selected = visible[offset:offset + limit]
        result.update(items=[self.item(x) for x in selected], items_total=len(visible), offset=offset,
                      items_omitted=len(visible) - len(selected))
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "status"))
    parser.add_argument("ledger", type=Path)
    view = parser.add_mutually_exclusive_group()
    view.add_argument("--collection")
    view.add_argument("--focus")
    parser.add_argument("--pending-only", action="store_true")
    parser.add_argument("--limit", type=int, default=12)
    parser.add_argument("--offset", type=int, default=0)
    args = parser.parse_args()
    try:
        require(1 <= args.limit <= 100 and args.offset >= 0, "limit must be 1..100; offset must be nonnegative")
        require(args.command != "check" or not (args.collection or args.focus or args.pending_only or args.offset),
                "View filters apply only to status")
        data = json.loads(args.ledger.read_text(encoding="utf-8"), object_pairs_hook=unique_keys)
        ledger = Ledger(data)
        result = ledger.base(args.limit) if args.command == "check" else ledger.status(
            args.collection, args.focus, args.pending_only, args.limit, args.offset)
        print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        return 0
    except (LedgerError, OSError, ValueError, TypeError) as exc:
        print(json.dumps({"error": str(exc)[:800], "recorded_structure_only": True}, ensure_ascii=False), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
