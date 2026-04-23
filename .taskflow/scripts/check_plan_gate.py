#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json

from taskflow import GateResult, evaluate_gate, repo_root


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check the shared taskflow plan gate.")
    parser.add_argument("--file-path", required=True)
    parser.add_argument("--task-id")
    parser.add_argument("--json", action="store_true")
    return parser


def result_to_json(result: GateResult) -> dict[str, object]:
    payload: dict[str, object] = {
        "allowed": result.allowed,
        "message": result.message,
    }
    if result.task_id is not None:
        payload["task_id"] = result.task_id
    if result.phase is not None:
        payload["phase"] = result.phase
    return payload


def main() -> int:
    args = build_parser().parse_args()
    result = evaluate_gate(repo_root(), args.file_path, args.task_id)
    if args.json:
        print(json.dumps(result_to_json(result), indent=2, ensure_ascii=False))
    else:
        print(result.message)
    return 0 if result.allowed else 1


if __name__ == "__main__":
    raise SystemExit(main())
