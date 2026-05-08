#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/agent/.env"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local python_bin
  python_bin="$(command -v python3 || command -v python)"
  if [ -z "$python_bin" ]; then
    echo "python3 or python is required to update ${ENV_FILE}" >&2
    exit 1
  fi
  "$python_bin" - "$ENV_FILE" "$key" "$value" <<'PY'
from __future__ import annotations

import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
value = sys.argv[3]
line = f"{key}={value}\n"

lines = path.read_text(encoding="utf-8").splitlines(keepends=True) if path.exists() else []
updated = False
for index, existing in enumerate(lines):
    if existing.startswith(f"{key}="):
        lines[index] = line
        updated = True
        break
if not updated:
    if lines and not lines[-1].endswith("\n"):
        lines[-1] += "\n"
    lines.append(line)
path.write_text("".join(lines), encoding="utf-8")
PY
}

usage() {
  cat <<'USAGE'
Usage:
  scripts/local-weekly-scheduler.sh up [HH:MM]
  scripts/local-weekly-scheduler.sh up [DAY] HH:MM
  scripts/local-weekly-scheduler.sh set HH:MM
  scripts/local-weekly-scheduler.sh set [DAY] HH:MM
  scripts/local-weekly-scheduler.sh stop
  scripts/local-weekly-scheduler.sh status
  scripts/local-weekly-scheduler.sh logs

Examples:
  scripts/local-weekly-scheduler.sh up 10:00
  scripts/local-weekly-scheduler.sh up thu 12:15
  scripts/local-weekly-scheduler.sh set 04:00
  scripts/local-weekly-scheduler.sh set mon 04:00
  docker compose --profile scheduler up -d
USAGE
}

normalize_day() {
  local value
  value="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$value" in
    0|mon|monday) echo "mon" ;;
    1|tue|tues|tuesday) echo "tue" ;;
    2|wed|wednesday) echo "wed" ;;
    3|thu|thur|thurs|thursday) echo "thu" ;;
    4|fri|friday) echo "fri" ;;
    5|sat|saturday) echo "sat" ;;
    6|sun|sunday) echo "sun" ;;
    *)
      echo "Invalid day: ${1}. Use mon, tue, wed, thu, fri, sat, or sun." >&2
      exit 2
      ;;
  esac
}

set_time() {
  local value="$1"
  if [[ ! "$value" =~ ^([0-1][0-9]|2[0-3]):([0-5][0-9])$ ]]; then
    echo "Invalid time: ${value}. Use HH:MM, for example 10:00." >&2
    exit 2
  fi
  set_env_value LOCAL_WEEKLY_PLAN_HOUR "${value%:*}"
  set_env_value LOCAL_WEEKLY_PLAN_MINUTE "${value#*:}"
  set_env_value LOCAL_WEEKLY_PLAN_TIME_ZONE "Asia/Tokyo"
  set_env_value LOCAL_WEEKLY_PLAN_RUN_MISSED_ON_STARTUP "true"
}

set_schedule() {
  local day="$1"
  local time="$2"
  local normalized_day
  normalized_day="$(normalize_day "$day")"
  set_env_value LOCAL_WEEKLY_PLAN_DAY_OF_WEEK "$normalized_day"
  set_time "$time"
  echo "Local weekly scheduler set to ${normalized_day} ${time} Asia/Tokyo in agent/.env"
}

command="${1:-}"
case "$command" in
  up)
    if [[ $# -eq 2 ]]; then
      set_schedule mon "$2"
    elif [[ $# -eq 3 ]]; then
      set_schedule "$2" "$3"
    elif [[ $# -gt 3 ]]; then
      usage
      exit 2
    fi
    (cd "$ROOT_DIR" && compose --profile scheduler up -d --build local-weekly-scheduler)
    ;;
  set)
    if [[ $# -eq 2 ]]; then
      set_schedule mon "$2"
    elif [[ $# -eq 3 ]]; then
      set_schedule "$2" "$3"
    else
      usage
      exit 2
    fi
    ;;
  stop)
    (cd "$ROOT_DIR" && compose stop local-weekly-scheduler)
    ;;
  status)
    (cd "$ROOT_DIR" && compose ps local-weekly-scheduler)
    ;;
  logs)
    (cd "$ROOT_DIR" && compose logs -f local-weekly-scheduler)
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    echo "Unknown command: ${command}" >&2
    usage
    exit 2
    ;;
esac
