#!/usr/bin/env python3
"""Classify source changes for the assessment image builds."""

from __future__ import annotations

import os
import subprocess
import sys
from collections.abc import Iterable

def is_common(path: str) -> bool:
    return path.startswith(".github/workflows/") or path.startswith("scripts/")


def classify(paths: Iterable[str], force_all: bool = False) -> tuple[bool, bool]:
    """Return (frontend, backend) build decisions."""
    paths = [path.strip() for path in paths if path.strip()]
    if force_all or any(is_common(path) for path in paths):
        return True, True

    frontend = any(path.startswith("frontend/") for path in paths)
    backend = any(path.startswith("backend/") for path in paths)
    if frontend or backend:
        return frontend, backend

    return False, False


def git_paths(base: str, head: str) -> list[str] | None:
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", base, head],
            check=True,
            capture_output=True,
            text=True,
        )
    except subprocess.CalledProcessError:
        return None
    return result.stdout.splitlines()


def commit_exists(revision: str) -> bool:
    return bool(revision) and subprocess.run(
        ["git", "cat-file", "-e", f"{revision}^{{commit}}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def event_decision(env: dict[str, str]) -> tuple[bool, bool]:
    event = env.get("GH_EVENT_NAME", "")
    head = env.get("GH_SHA", "")
    if event == "workflow_dispatch":
        return classify((), force_all=True)
    if event == "push":
        base = env.get("GH_BEFORE", "")
        if not commit_exists(base) or not commit_exists(head):
            return classify((), force_all=True)
        paths = git_paths(base, head)
        return classify(paths or (), force_all=paths is None)
    if event == "pull_request":
        base = env.get("GH_PR_BASE_SHA", "")
        pr_head = env.get("GH_PR_HEAD_SHA", head)
        if not commit_exists(base) or not commit_exists(pr_head):
            return classify((), force_all=True)
        try:
            merge_base = subprocess.run(
                ["git", "merge-base", base, pr_head],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        except subprocess.CalledProcessError:
            return classify((), force_all=True)
        paths = git_paths(merge_base, pr_head)
        return classify(paths or (), force_all=paths is None)
    return classify((), force_all=True)


def emit(frontend: bool, backend: bool, output: object = sys.stdout) -> None:
    print(f"frontend={'true' if frontend else 'false'}", file=output)
    print(f"backend={'true' if backend else 'false'}", file=output)


def self_test() -> None:
    cases = [
        ("frontend-only", ["frontend/src/app.ts"], False, (True, False)),
        ("backend-only", ["backend/src/main.ts"], False, (False, True)),
        ("both", ["frontend/src/app.ts", "backend/src/main.ts"], False, (True, True)),
        ("docs-only", ["README.md", "docs/runbook.md"], False, (False, False)),
        ("deployment-only", ["deploy/aks/backend.yaml"], False, (False, False)),
        ("frontend-and-deployment", ["frontend/src/app.ts", "deploy/aks/backend.yaml"], False, (True, False)),
        ("frontend-dockerfile", ["frontend/Dockerfile"], False, (True, False)),
        ("backend-dockerfile", ["backend/Dockerfile"], False, (False, True)),
        ("workflow", [".github/workflows/other.yml"], False, (True, True)),
        ("script", ["scripts/check.sh"], False, (True, True)),
        ("manual", [], True, (True, True)),
        ("push-multiple-commits", ["frontend/src/a.ts", "backend/src/b.ts"], False, (True, True)),
        ("missing-base", [], True, (True, True)),
    ]
    for name, paths, force_all, expected in cases:
        actual = classify(paths, force_all)
        assert actual == expected, f"{name}: expected {expected}, got {actual}"

    docs = {"GH_EVENT_NAME": "push", "GH_BEFORE": "x", "GH_SHA": "y"}
    original_exists = globals()["commit_exists"]
    original_paths = globals()["git_paths"]
    globals()["commit_exists"] = lambda revision: revision in {"x", "y"}
    globals()["git_paths"] = lambda base, head: ["docs/runbook.md"]
    try:
        assert event_decision(docs) == (False, False), "push range decision"
    finally:
        globals()["commit_exists"] = original_exists
        globals()["git_paths"] = original_paths


if __name__ == "__main__":
    if sys.argv[1:] == ["--self-test"]:
        self_test()
    elif sys.argv[1:] == ["--paths"]:
        emit(*classify(sys.stdin.read().splitlines()))
    elif len(sys.argv) == 1:
        frontend, backend = event_decision(os.environ)
        output_path = os.environ.get("GITHUB_OUTPUT")
        if output_path:
            with open(output_path, "a", encoding="utf-8") as output:
                emit(frontend, backend, output)
        else:
            emit(frontend, backend)
    else:
        raise SystemExit("usage: detect_changes.py [--self-test|--paths]")
