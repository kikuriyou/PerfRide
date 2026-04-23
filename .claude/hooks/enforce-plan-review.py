#!/usr/bin/env python3
"""PreToolUse wrapper for the shared taskflow gate."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path, PurePosixPath

MAX_PATH_LENGTH = 4096
SOURCE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx"}
SOURCE_DIRS = {"web/src/", "agent/"}
TIMEOUT_SECONDS = 5


def validate_path(file_path: str) -> bool:
    if not file_path or len(file_path) > MAX_PATH_LENGTH:
        return False
    return ".." not in file_path


def relative_path(project_dir: Path, file_path: str) -> str:
    resolved = Path(file_path)
    if not resolved.is_absolute():
        resolved = project_dir / resolved
    try:
        return resolved.resolve().relative_to(project_dir.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def is_source_file(file_path: str) -> bool:
    ext = PurePosixPath(file_path).suffix.lower()
    if ext not in SOURCE_EXTENSIONS:
        return False
    return any(file_path.startswith(source_dir) for source_dir in SOURCE_DIRS)


def build_output(message: str) -> str:
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "additionalContext": f"[Taskflow Gate] {message}",
        }
    }
    return json.dumps(payload, ensure_ascii=False)


def main():
    try:
        data = json.load(sys.stdin)
        tool_input = data.get("tool_input", {})
        file_path = tool_input.get("file_path", "")
        if not validate_path(file_path):
            sys.exit(0)

        project_dir = Path(os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())).resolve()
        rel_path = relative_path(project_dir, file_path)
        if not is_source_file(rel_path):
            sys.exit(0)
        environment = dict(os.environ)
        environment.setdefault("UV_CACHE_DIR", "/tmp/uv-cache")

        command = [
            "uv",
            "run",
            "--no-project",
            "python3",
            str(project_dir / ".taskflow" / "scripts" / "check_plan_gate.py"),
            "--file-path",
            rel_path,
        ]
        result = subprocess.run(
            command,
            cwd=project_dir,
            capture_output=True,
            env=environment,
            text=True,
            timeout=TIMEOUT_SECONDS,
        )
        if result.returncode == 0:
            sys.exit(0)

        message = (result.stdout or result.stderr).strip() or "Source edit blocked."
        print(build_output(message))
        sys.exit(2)
    except subprocess.TimeoutExpired:
        print(build_output("Taskflow gate timed out. Retry after checking the task state."))
        sys.exit(2)
    except Exception as exc:
        print(f"Hook error: {exc}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
