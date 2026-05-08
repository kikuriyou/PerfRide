from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from datetime import time as clock_time
from pathlib import Path
from zoneinfo import ZoneInfo

DEFAULT_AGENT_URL = "http://localhost:8000"
DEFAULT_TIME_ZONE = "Asia/Tokyo"
DEFAULT_STATE_FILE = "/app/.local-scheduler/weekly-plan-state.json"
DAY_OF_WEEK_ALIASES = {
    "0": 0,
    "mon": 0,
    "monday": 0,
    "1": 1,
    "tue": 1,
    "tues": 1,
    "tuesday": 1,
    "2": 2,
    "wed": 2,
    "wednesday": 2,
    "3": 3,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "thursday": 3,
    "4": 4,
    "fri": 4,
    "friday": 4,
    "5": 5,
    "sat": 5,
    "saturday": 5,
    "6": 6,
    "sun": 6,
    "sunday": 6,
}
DAY_OF_WEEK_LABELS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


@dataclass(frozen=True)
class LocalWeeklyPlanSchedulerConfig:
    agent_url: str
    time_zone: ZoneInfo
    day_of_week: int
    hour: int
    minute: int
    user_id: str
    force: bool
    run_missed_on_startup: bool
    state_file: Path
    startup_timeout_seconds: int
    startup_poll_seconds: int
    retry_seconds: int


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(
    name: str,
    default: int,
    *,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    value = int(raw)
    if minimum is not None and value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    if maximum is not None and value > maximum:
        raise ValueError(f"{name} must be <= {maximum}")
    return value


def parse_day_of_week(value: str | None) -> int:
    key = (value or "mon").strip().lower()
    if key not in DAY_OF_WEEK_ALIASES:
        allowed = ", ".join(DAY_OF_WEEK_LABELS)
        raise ValueError(f"LOCAL_WEEKLY_PLAN_DAY_OF_WEEK must be one of: {allowed}")
    return DAY_OF_WEEK_ALIASES[key]


def day_of_week_label(day_of_week: int) -> str:
    return DAY_OF_WEEK_LABELS[day_of_week]


def load_config() -> LocalWeeklyPlanSchedulerConfig:
    zone_name = os.environ.get("LOCAL_WEEKLY_PLAN_TIME_ZONE", DEFAULT_TIME_ZONE)
    return LocalWeeklyPlanSchedulerConfig(
        agent_url=os.environ.get("LOCAL_WEEKLY_PLAN_AGENT_URL", DEFAULT_AGENT_URL).rstrip("/"),
        time_zone=ZoneInfo(zone_name),
        day_of_week=parse_day_of_week(os.environ.get("LOCAL_WEEKLY_PLAN_DAY_OF_WEEK")),
        hour=_env_int("LOCAL_WEEKLY_PLAN_HOUR", 4, minimum=0, maximum=23),
        minute=_env_int("LOCAL_WEEKLY_PLAN_MINUTE", 0, minimum=0, maximum=59),
        user_id=os.environ.get("LOCAL_WEEKLY_PLAN_USER_ID", "default"),
        force=_env_bool("LOCAL_WEEKLY_PLAN_FORCE", False),
        run_missed_on_startup=_env_bool("LOCAL_WEEKLY_PLAN_RUN_MISSED_ON_STARTUP", True),
        state_file=Path(os.environ.get("LOCAL_WEEKLY_PLAN_STATE_FILE", DEFAULT_STATE_FILE)),
        startup_timeout_seconds=_env_int(
            "LOCAL_WEEKLY_PLAN_STARTUP_TIMEOUT_SECONDS",
            600,
            minimum=1,
        ),
        startup_poll_seconds=_env_int("LOCAL_WEEKLY_PLAN_STARTUP_POLL_SECONDS", 5, minimum=1),
        retry_seconds=_env_int("LOCAL_WEEKLY_PLAN_RETRY_SECONDS", 900, minimum=1),
    )


def monday_of_week(target: date) -> date:
    return target - timedelta(days=target.weekday())


def scheduled_at_for_week(
    week_start: date,
    *,
    time_zone: ZoneInfo,
    day_of_week: int,
    hour: int,
    minute: int,
) -> datetime:
    scheduled_date = week_start + timedelta(days=day_of_week)
    return datetime.combine(scheduled_date, clock_time(hour=hour, minute=minute, tzinfo=time_zone))


def due_week_start_on_startup(
    now: datetime,
    *,
    time_zone: ZoneInfo,
    day_of_week: int,
    hour: int,
    minute: int,
) -> date | None:
    now_local = now.astimezone(time_zone)
    week_start = monday_of_week(now_local.date())
    scheduled_at = scheduled_at_for_week(
        week_start,
        time_zone=time_zone,
        day_of_week=day_of_week,
        hour=hour,
        minute=minute,
    )
    return week_start if now_local >= scheduled_at else None


def next_scheduled_at(
    now: datetime,
    *,
    time_zone: ZoneInfo,
    day_of_week: int,
    hour: int,
    minute: int,
) -> datetime:
    now_local = now.astimezone(time_zone)
    week_start = monday_of_week(now_local.date())
    candidate = scheduled_at_for_week(
        week_start,
        time_zone=time_zone,
        day_of_week=day_of_week,
        hour=hour,
        minute=minute,
    )
    if candidate <= now_local:
        candidate += timedelta(days=7)
    return candidate


def read_state(path: Path) -> dict[str, object]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def already_ran_schedule(path: Path, week_start: date, scheduled_at: datetime) -> bool:
    state = read_state(path)
    return (
        state.get("last_week_start") == week_start.isoformat()
        and state.get("last_scheduled_at") == scheduled_at.isoformat()
    )


def write_state(
    path: Path,
    *,
    week_start: date,
    scheduled_at: datetime,
    ran_at: datetime,
    response: dict[str, object],
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "last_week_start": week_start.isoformat(),
                "last_scheduled_at": scheduled_at.isoformat(),
                "last_run_at": ran_at.isoformat(),
                "last_response": response,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def _json_post(url: str, payload: dict[str, object], *, timeout: int = 600) -> dict[str, object]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        text = response.read().decode("utf-8")
    parsed = json.loads(text) if text else {}
    return parsed if isinstance(parsed, dict) else {"response": parsed}


def wait_for_agent(config: LocalWeeklyPlanSchedulerConfig) -> None:
    health_url = f"{config.agent_url}/health"
    deadline = time.monotonic() + config.startup_timeout_seconds
    while True:
        try:
            with urllib.request.urlopen(
                health_url,
                timeout=config.startup_poll_seconds,
            ) as response:
                if 200 <= response.status < 300:
                    print(f"[local-weekly-scheduler] agent ready: {health_url}", flush=True)
                    return
        except (urllib.error.URLError, TimeoutError):
            pass

        if time.monotonic() >= deadline:
            raise TimeoutError(f"agent did not become ready: {health_url}")
        time.sleep(config.startup_poll_seconds)


def run_weekly_plan(
    week_start: date,
    *,
    config: LocalWeeklyPlanSchedulerConfig,
    scheduled_at: datetime | None = None,
) -> dict[str, object]:
    if scheduled_at is None:
        scheduled_at = scheduled_at_for_week(
            week_start,
            time_zone=config.time_zone,
            day_of_week=config.day_of_week,
            hour=config.hour,
            minute=config.minute,
        )
    payload: dict[str, object] = {
        "user_id": config.user_id,
        "trigger": "local_scheduler",
        "week_start": week_start.isoformat(),
        "as_of": scheduled_at.isoformat(),
        "force": config.force,
    }
    url = f"{config.agent_url}/api/agent/weekly-plan"
    print(
        f"[local-weekly-scheduler] POST {url} week_start={week_start.isoformat()}",
        flush=True,
    )
    return _json_post(url, payload)


def run_until_success(
    week_start: date,
    *,
    config: LocalWeeklyPlanSchedulerConfig,
    scheduled_at: datetime,
) -> None:
    while True:
        try:
            response = run_weekly_plan(week_start, config=config, scheduled_at=scheduled_at)
            write_state(
                config.state_file,
                week_start=week_start,
                scheduled_at=scheduled_at,
                ran_at=datetime.now(config.time_zone),
                response=response,
            )
            print(
                "[local-weekly-scheduler] weekly plan completed "
                f"status={response.get('status', 'unknown')}",
                flush=True,
            )
            return
        except Exception as exc:
            print(
                "[local-weekly-scheduler] weekly plan failed; "
                f"retrying in {config.retry_seconds}s: {exc}",
                flush=True,
            )
            time.sleep(config.retry_seconds)


def main() -> None:
    config = load_config()
    print(
        "[local-weekly-scheduler] configured "
        f"agent_url={config.agent_url} "
        f"schedule={day_of_week_label(config.day_of_week)} "
        f"{config.hour:02d}:{config.minute:02d} "
        f"tz={config.time_zone.key} "
        f"state_file={config.state_file}",
        flush=True,
    )
    wait_for_agent(config)

    if config.run_missed_on_startup:
        due_week_start = due_week_start_on_startup(
            datetime.now(config.time_zone),
            time_zone=config.time_zone,
            day_of_week=config.day_of_week,
            hour=config.hour,
            minute=config.minute,
        )
        if due_week_start is not None:
            scheduled_at = scheduled_at_for_week(
                due_week_start,
                time_zone=config.time_zone,
                day_of_week=config.day_of_week,
                hour=config.hour,
                minute=config.minute,
            )
            if not already_ran_schedule(config.state_file, due_week_start, scheduled_at):
                run_until_success(
                    due_week_start,
                    config=config,
                    scheduled_at=scheduled_at,
                )

    while True:
        now = datetime.now(config.time_zone)
        next_run = next_scheduled_at(
            now,
            time_zone=config.time_zone,
            day_of_week=config.day_of_week,
            hour=config.hour,
            minute=config.minute,
        )
        sleep_seconds = max(1, int((next_run - now).total_seconds()))
        print(
            f"[local-weekly-scheduler] next run at {next_run.isoformat()}",
            flush=True,
        )
        time.sleep(sleep_seconds)
        week_start = monday_of_week(next_run.date())
        if already_ran_schedule(config.state_file, week_start, next_run):
            continue
        run_until_success(week_start, config=config, scheduled_at=next_run)


if __name__ == "__main__":
    main()
