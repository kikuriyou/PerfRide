#!/usr/bin/env python3
"""Generate and verify AI context entry files from `.claude` sources."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from ai_context_sync import (
    diff_output,
    load_registry,
    render_expected_output,
)


def build_parser() -> argparse.ArgumentParser:
    """Create the CLI argument parser."""
    parser = argparse.ArgumentParser(
        description="Sync generated AI context files from `.claude` sources.",
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--check",
        action="store_true",
        help="Fail if generated files drift from the source registry.",
    )
    group.add_argument(
        "--write",
        action="store_true",
        help="Regenerate all configured AI context outputs.",
    )
    parser.add_argument(
        "--project-root",
        default=None,
        help="Repository root. Defaults to the grandparent of .claude/scripts/.",
    )
    return parser


def main() -> int:
    """CLI entrypoint."""
    parser = build_parser()
    args = parser.parse_args()

    if args.project_root:
        project_root = Path(args.project_root).resolve()
    else:
        project_root = Path(__file__).resolve().parent.parent.parent

    registry = load_registry(project_root)
    failures: list[str] = []

    for output in registry.outputs.values():
        output_path = project_root / output.path
        existing_text = output_path.read_text(encoding="utf-8") if output_path.exists() else ""
        expected_text = render_expected_output(registry, output, existing_text)

        if args.write:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(expected_text, encoding="utf-8")
            print(f"updated {output.path}")
            continue

        if existing_text != expected_text:
            failures.append(
                "\n".join(
                    [
                        f"[drift] {output.path}",
                        f"  regenerate with: {registry.write_command}",
                        diff_output(existing_text, expected_text, output.path),
                    ],
                )
            )

    if args.write:
        print("AI context sync complete.")
        return 0

    if failures:
        print("\n\n".join(failures), file=sys.stderr)
        return 1

    print("AI context sync check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
