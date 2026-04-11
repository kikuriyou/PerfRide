#!/usr/bin/env python3
"""
PostToolUse hook: Automatically run tests after significant implementation changes.

Tracks changed source files and their types (agent/ vs web/src/).
When threshold is reached (3+ source files OR 100+ lines changed),
runs the appropriate test suite automatically.
"""

import json
import os
import subprocess
import sys

# Input validation constants
MAX_PATH_LENGTH = 4096
MAX_CONTENT_LENGTH = 1_000_000

# State file to track changes across hook invocations
STATE_FILE = "/tmp/claude-code-auto-test-state.json"

# Source file extensions to track
SOURCE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx"}

# Thresholds for triggering tests
MIN_FILES_FOR_TEST = 3
MIN_LINES_FOR_TEST = 100

# Test command timeout
TEST_TIMEOUT = 60


def validate_input(file_path: str, content: str) -> bool:
    """Validate input for security."""
    if not file_path or len(file_path) > MAX_PATH_LENGTH:
        return False
    if len(content) > MAX_CONTENT_LENGTH:
        return False
    if ".." in file_path:
        return False
    return True


def is_source_file(path: str) -> bool:
    """Check if the file is a tracked source file."""
    _, ext = os.path.splitext(path)
    return ext in SOURCE_EXTENSIONS


def classify_file(file_path: str, project_dir: str) -> str | None:
    """Classify a file as 'agent' or 'frontend' based on its path."""
    if file_path.startswith(project_dir):
        rel_path = os.path.relpath(file_path, project_dir)
    else:
        rel_path = file_path

    if rel_path.startswith("agent/") or rel_path.startswith("agent" + os.sep):
        return "agent"
    if rel_path.startswith("web/src/") or rel_path.startswith("web" + os.sep + "src"):
        return "frontend"
    return None


def count_lines(content: str) -> int:
    """Count meaningful lines in content."""
    lines = content.split("\n")
    return len([line for line in lines if line.strip() and not line.strip().startswith("#")])


def load_state() -> dict:
    """Load session state."""
    try:
        if os.path.exists(STATE_FILE):
            with open(STATE_FILE) as f:
                return json.load(f)
    except Exception:
        pass
    return {
        "files_changed": [],
        "total_lines": 0,
        "tests_run": False,
        "agent_files": 0,
        "frontend_files": 0,
    }


def save_state(state: dict):
    """Save session state."""
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f)
    except Exception:
        pass


def should_run_tests(state: dict) -> bool:
    """Check if thresholds are met and tests haven't already run."""
    if state.get("tests_run"):
        return False

    files_count = len(state.get("files_changed", []))
    total_lines = state.get("total_lines", 0)

    return files_count >= MIN_FILES_FOR_TEST or total_lines >= MIN_LINES_FOR_TEST


def run_command(cmd: list[str], cwd: str) -> tuple[int, str, str]:
    """Run a command and return (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=TEST_TIMEOUT,
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", "Command timed out after 60s"
    except FileNotFoundError:
        return 1, "", f"Command not found: {cmd[0]}"


def run_tests(state: dict, project_dir: str) -> str:
    """Run appropriate test suites based on changed file types. Returns summary."""
    results = []
    agent_files = state.get("agent_files", 0)
    frontend_files = state.get("frontend_files", 0)

    if agent_files > 0:
        agent_dir = os.path.join(project_dir, "agent")
        ret, stdout, stderr = run_command(
            ["uv", "run", "pytest", "-v"],
            cwd=agent_dir,
        )
        if ret == 0:
            # Extract summary line from pytest output
            lines = stdout.strip().split("\n")
            summary = lines[-1] if lines else "passed"
            results.append(f"Agent tests PASSED: {summary}")
        else:
            output = (stdout or stderr).strip()
            # Truncate long output
            if len(output) > 500:
                output = output[-500:]
            results.append(f"Agent tests FAILED:\n{output}")

    if frontend_files > 0:
        # Run build as the primary frontend check
        web_dir = os.path.join(project_dir, "web")
        ret, stdout, stderr = run_command(
            ["npm", "run", "build"],
            cwd=web_dir,
        )
        if ret == 0:
            results.append("Frontend build PASSED")
        else:
            output = (stderr or stdout).strip()
            if len(output) > 500:
                output = output[-500:]
            results.append(f"Frontend build FAILED:\n{output}")

        # Also run npm test if it exists (check package.json)
        try:
            pkg_path = os.path.join(web_dir, "package.json")
            with open(pkg_path) as f:
                pkg = json.load(f)
            if "test" in pkg.get("scripts", {}):
                ret, stdout, stderr = run_command(
                    ["npm", "run", "test"],
                    cwd=web_dir,
                )
                if ret == 0:
                    results.append("Frontend tests PASSED")
                else:
                    output = (stderr or stdout).strip()
                    if len(output) > 500:
                        output = output[-500:]
                    results.append(f"Frontend tests FAILED:\n{output}")
        except Exception:
            pass

    return "; ".join(results) if results else "No tests to run"


def main():
    try:
        data = json.load(sys.stdin)
        tool_name = data.get("tool_name", "")

        # Only process Write/Edit tools
        if tool_name not in ["Write", "Edit"]:
            sys.exit(0)

        tool_input = data.get("tool_input", {})
        file_path = tool_input.get("file_path", "")
        content = tool_input.get("content", "") or tool_input.get("new_string", "")

        # Validate input
        if not validate_input(file_path, content):
            sys.exit(0)

        # Skip non-source files
        if not is_source_file(file_path):
            sys.exit(0)

        project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())

        # Classify the file
        file_type = classify_file(file_path, project_dir)
        if file_type is None:
            sys.exit(0)

        # Load and update state
        state = load_state()

        if file_path not in state["files_changed"]:
            state["files_changed"].append(file_path)
            if file_type == "agent":
                state["agent_files"] = state.get("agent_files", 0) + 1
            elif file_type == "frontend":
                state["frontend_files"] = state.get("frontend_files", 0) + 1

        state["total_lines"] += count_lines(content)
        save_state(state)

        # Check if we should run tests
        if not should_run_tests(state):
            sys.exit(0)

        # Mark tests as run to prevent duplicates
        state["tests_run"] = True
        save_state(state)

        # Run the appropriate test suites
        test_summary = run_tests(state, project_dir)

        files_count = len(state["files_changed"])
        total_lines = state["total_lines"]

        output = {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": (
                    f"[Auto-Test] Threshold reached ({files_count} files, {total_lines} lines). "
                    f"Test results: {test_summary}"
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
