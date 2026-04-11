#!/usr/bin/env python3
"""
PreToolUse hook: Warn when implementation starts without plan review.

Tracks plan creation (writes to tasks/) and ensures user approval
before source file edits proceed. Uses a state file to persist
across tool invocations.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path, PurePosixPath

STATE_FILE = Path("/tmp/claude-code-plan-review-state.json")
MAX_PATH_LENGTH = 4096

# Source file extensions that require plan review
SOURCE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx"}

# Source directories where plan review is enforced
SOURCE_DIRS = {"web/src/", "agent/"}

# Directories to skip (no plan review needed)
SKIP_DIRS = {".claude/", "public/", "docs/"}


def load_state() -> dict:
    """Load state from file, returning defaults if missing or corrupt."""
    try:
        if STATE_FILE.exists():
            data = json.loads(STATE_FILE.read_text())
            return {
                "plan_written": bool(data.get("plan_written", False)),
                "plan_approved": bool(data.get("plan_approved", False)),
            }
    except (json.JSONDecodeError, OSError, KeyError):
        pass
    return {"plan_written": False, "plan_approved": False}


def save_state(state: dict) -> None:
    """Persist state to file."""
    try:
        STATE_FILE.write_text(json.dumps(state))
    except OSError:
        pass


def validate_path(file_path: str) -> bool:
    """Validate file path for safety."""
    if not file_path or len(file_path) > MAX_PATH_LENGTH:
        return False
    if ".." in file_path:
        return False
    return True


def get_relative_path(file_path: str) -> str:
    """Convert absolute path to project-relative path."""
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", "")
    if project_dir and file_path.startswith(project_dir):
        rel = file_path[len(project_dir) :]
        return rel.lstrip("/")
    return file_path


def is_in_directory(rel_path: str, directories: set[str]) -> bool:
    """Check if a relative path starts with any of the given directories."""
    for d in directories:
        if rel_path.startswith(d):
            return True
    return False


def is_source_file(rel_path: str) -> bool:
    """Check if file is a source file in a monitored directory."""
    ext = PurePosixPath(rel_path).suffix.lower()
    if ext not in SOURCE_EXTENSIONS:
        return False
    if not is_in_directory(rel_path, SOURCE_DIRS):
        return False
    return True


def main():
    try:
        data = json.load(sys.stdin)
        tool_input = data.get("tool_input", {})
        file_path = tool_input.get("file_path", "")

        if not validate_path(file_path):
            sys.exit(0)

        rel_path = get_relative_path(file_path)
        state = load_state()

        # Case 1: Writing to tasks/ directory = plan creation
        if rel_path.startswith("tasks/"):
            state["plan_written"] = True
            state["plan_approved"] = False
            save_state(state)
            sys.exit(0)

        # Case 2: Skip non-source files and excluded directories
        if is_in_directory(rel_path, SKIP_DIRS):
            sys.exit(0)

        if not is_source_file(rel_path):
            sys.exit(0)

        # Case 3: Source file edit - check plan review state
        if state["plan_written"] and not state["plan_approved"]:
            state["plan_approved"] = True
            save_state(state)

            output = {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "additionalContext": (
                        "[Plan Review Required] "
                        "計画が作成されましたが、まだユーザーの承認を得ていません。"
                        "tasks/YYYYMMDD/todo.md の計画をユーザーに提示し、"
                        "承認を得てから実装を開始してください。"
                    ),
                }
            }
            print(json.dumps(output))

        sys.exit(0)

    except Exception as e:
        print(f"Hook error: {e}", file=sys.stderr)
        sys.exit(0)


if __name__ == "__main__":
    main()
