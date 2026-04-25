"""PerfRide Training Recommendation API Server."""

import asyncio
import json
import os
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from recommend_agent.agent import build_agent, build_insight_agent
from recommend_agent.constants import RECOMMEND_MODE, USE_PERSONAL_DATA
from recommend_agent.plan_store import (
    StalePlanRevisionError,
    WeekPayload,
    get_review,
    replace_current_week,
    review_id_for_week_start,
    update_review_status,
    upsert_review,
)
from recommend_agent.tools._request_context import (
    activity_override_var,
    as_of_var,
    parse_as_of,
    parse_week_start,
    reference_date_var,
    resolve_week_start_and_as_of,
    webhook_trace_id_var,
    week_start_var,
)
from recommend_agent.tools.detect_signals import detect_signals
from recommend_agent.tools.get_user_profile import get_user_profile
from recommend_agent.tools.search_latest_knowledge import (
    reset_search_count,
    set_search_limit,
)
from recommend_agent.tools.send_notification import send_notification
from recommend_agent.tools.update_training_plan import update_training_plan
from recommend_agent.weekly_logic import (
    build_baseline_week,
    coerce_weekly_draft,
    current_session_context,
)

JST = ZoneInfo("Asia/Tokyo")

app = FastAPI(
    title="PerfRide Recommend Training API",
    description="AI-powered cycling training recommendation service",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache configuration
CACHE_DIR = Path(__file__).parent / "cache"
CACHE_DIR.mkdir(exist_ok=True)
CACHE_FILE = CACHE_DIR / "recommendation_cache.json"
MAX_GENERATIONS_PER_DAY = 2

# GCS config
GCS_BUCKET = os.environ.get("GCS_BUCKET", "perfride-shared")

# ADK session service
session_service = InMemorySessionService()


class RecommendRequest(BaseModel):
    goal: str
    ftp: int = 200
    goal_custom: str | None = None
    recommend_mode: str | None = None
    use_personal_data: bool | None = None
    coach_autonomy: str | None = None
    plan_context_key: str | None = None
    constraint: str | None = None
    mode: str = "recommend"
    as_of: str | None = None
    activity_override: dict[str, object] | None = None


class InsightItem(BaseModel):
    type: str
    title: str
    summary: str
    why_now: str
    based_on: str
    priority: str


class InsightResponse(BaseModel):
    items: list[InsightItem]


class RecommendResponse(BaseModel):
    summary: str
    detail: str
    created_at: str
    from_cache: bool = False
    workout_intervals: list[dict[str, str | int | float | None]] | None = None
    totalDurationMin: int | None = None
    workoutName: str | None = None
    references: list[dict[str, str | None]] | None = None
    why_now: str | None = None
    based_on: str | None = None
    plan_context_key: str | None = None


class WeeklyPlanRequest(BaseModel):
    trigger: str = "scheduler"
    week_start: str | None = None
    as_of: str | None = None
    force: bool = False


class WeeklyPlanResponse(BaseModel):
    status: str
    week_start: str
    review_id: str | None = None
    plan_revision: int | None = None
    sessions_planned: int = 0
    sessions_registered: int = 0
    session_id: str | None = None
    message: str | None = None


class WeeklyPlanRespondRequest(BaseModel):
    review_id: str
    action: str
    user_message: str | None = None
    expected_plan_revision: int


class WeeklyPlanAppendRequest(BaseModel):
    session_date: str
    session_type: str
    duration_minutes: int = 0
    target_tss: int = 0
    notes: str | None = None
    expected_plan_revision: int


class WeeklyPlanAppendResponse(BaseModel):
    status: str
    week_start: str | None = None
    plan_revision: int | None = None
    appended_session: dict[str, Any] | None = None
    current_plan_revision: int | None = None
    current_sessions: list[dict[str, Any]] | None = None
    message: str | None = None


def _load_cache() -> dict[str, object] | None:
    if not CACHE_FILE.exists():
        return None
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _save_cache(data: dict[str, object]) -> None:
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_activity_cache_json() -> dict | None:
    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        blob = bucket.blob("activity_cache.json")
        if not blob.exists():
            return None
        return json.loads(blob.download_as_text())
    except Exception:
        return None


def _get_activity_cache(override: dict[str, object] | None = None) -> dict | None:
    if override is not None:
        return dict(override)
    return _load_activity_cache_json()


def _parse_as_of(as_of_str: str | None) -> datetime | None:
    return parse_as_of(as_of_str)


def _activity_jst_date(start_date_local: str) -> str | None:
    """Strava の `start_date_local` から JST 上の日付 (YYYY-MM-DD) を抽出する。

    Strava は "2026-04-15T18:30:00Z" 形式で返すが中身は JST ローカル時刻。
    タイムゾーン付き/無しの両対応で、日付部分のみ取り出す。
    """
    if not start_date_local or not isinstance(start_date_local, str):
        return None
    # 先頭 10 文字 (YYYY-MM-DD) を日付として扱う。
    # Z 付きでも JST local のため、日付部分は信頼できる。
    head = start_date_local[:10]
    if len(head) == 10 and head[4] == "-" and head[7] == "-":
        return head
    return None


def _summarize_recent_rides(activities: list[dict], today_jst: datetime) -> str:
    """直近3日（一昨日/昨日/今日）のライド概要を人間可読なテキストに整形する。

    LLM が大量の activities 配列から「昨日」の行を拾い損ねるのを防ぐため、
    `user_message` に事前要約として埋め込む前提。
    """
    labels = [("今日", 0), ("昨日", 1), ("一昨日", 2)]
    target_dates = {
        offset: (today_jst - timedelta(days=offset)).strftime("%Y-%m-%d") for _, offset in labels
    }

    by_date: dict[str, list[dict]] = {d: [] for d in target_dates.values()}
    for act in activities:
        ride_date = _activity_jst_date(act.get("start_date_local", ""))
        if ride_date in by_date:
            by_date[ride_date].append(act)

    lines: list[str] = []
    for label, offset in labels:
        ymd = target_dates[offset]
        rides = by_date[ymd]
        if not rides:
            lines.append(f"- {label} ({ymd}): ライドなし")
            continue
        parts = []
        for r in rides:
            name = r.get("name", "Ride")
            tss = r.get("tss_estimated")
            intensity = r.get("intensity_factor")
            tss_text = f"TSS={tss}" if tss is not None else "TSS=N/A"
            if_text = f"IF={intensity}" if intensity is not None else "IF=N/A"
            parts.append(f"{name} ({tss_text}, {if_text})")
        lines.append(f"- {label} ({ymd}): " + "; ".join(parts))
    return "\n".join(lines)


def _get_activity_cache_mtime() -> datetime | None:
    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(GCS_BUCKET)
        blob = bucket.blob("activity_cache.json")
        blob.reload()
        return blob.updated
    except Exception:
        return None


def _should_regenerate(cache: dict[str, object] | None, use_personal_data: bool) -> bool:
    """Determine if recommendation should be regenerated based on cache logic.

    Logic:
    - Activity cache changed → regenerate (up to MAX_GENERATIONS_PER_DAY)
    - No change, 0 days since last change → use cache
    - No change, 1-3 days → regenerate
    - No change, 4-6 days → use cache
    - No change, 7 days → regenerate
    - No change, 8+ days → use cache
    """
    if cache is None:
        return True

    now_jst = datetime.now(JST)

    # Check daily generation limit (JST-based)
    today_str = now_jst.strftime("%Y-%m-%d")
    cache_date = cache.get("generation_date", "")
    generation_count = cache.get("generation_count", 0)
    if (
        cache_date == today_str
        and isinstance(generation_count, int)
        and generation_count >= MAX_GENERATIONS_PER_DAY
    ):
        return False

    # When personal data is disabled, skip GCS activity check (daily regeneration only)
    if not use_personal_data:
        try:
            created_at = cache["created_at"]
            if not isinstance(created_at, str):
                return True
            cache_created = datetime.fromisoformat(created_at)
            if cache_created.tzinfo is None:
                cache_created = cache_created.replace(tzinfo=UTC)
            cache_date_jst = cache_created.astimezone(JST).date()
            days_elapsed = (now_jst.date() - cache_date_jst).days
        except (KeyError, ValueError):
            return True
        return days_elapsed >= 1

    # Check if activity cache has changed
    activity_mtime = _get_activity_cache_mtime()
    cached_activity_mtime = cache.get("activity_cache_mtime")

    if (
        activity_mtime
        and cached_activity_mtime
        and activity_mtime.isoformat() != cached_activity_mtime
    ):
        return True  # Data changed → regenerate

    # Calculate days since last activity cache modification (calendar date diff in JST)
    if activity_mtime:
        activity_date = activity_mtime.astimezone(JST).date()
        days_elapsed = (now_jst.date() - activity_date).days
    else:
        try:
            created_at = cache["created_at"]
            if not isinstance(created_at, str):
                return True
            cache_created = datetime.fromisoformat(created_at)
            if cache_created.tzinfo is None:
                cache_created = cache_created.replace(tzinfo=UTC)
            cache_date_jst = cache_created.astimezone(JST).date()
            days_elapsed = (now_jst.date() - cache_date_jst).days
        except (KeyError, ValueError):
            return True

    if days_elapsed == 0:
        return False
    if 1 <= days_elapsed <= 3:
        return True
    if 4 <= days_elapsed <= 6:
        return False
    return days_elapsed == 7


def _parse_agent_json_response(raw_response: str) -> dict[str, Any] | None:
    text = raw_response.strip()
    if "```json" in text:
        text = text.split("```json", 1)[1].split("```", 1)[0].strip()
    elif text.startswith("```") and "```" in text[3:]:
        text = text.split("```", 1)[1].split("```", 1)[0].strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def _goal_text(goal: str, goal_custom: str | None) -> str:
    goal_labels = {
        "hillclimb_tt": "レース準備（ヒルクライム/TT）",
        "road_race": "レース準備（ロードレース）",
        "ftp_improvement": "FTP向上",
        "fitness_maintenance": "体力維持",
        "other": goal_custom or "その他",
    }
    return goal_labels.get(goal, goal)


def _coach_plan_message(now_jst: datetime) -> str:
    context = current_session_context(now_jst.date())
    if context is None:
        return ""
    week = context.get("week")
    if not isinstance(week, dict):
        return ""
    sessions = context.get("sessions") or []
    source = context.get("source", "approved")
    phase = week.get("phase", "maintenance")
    revision = week.get("plan_revision", 1)
    lines = [
        "",
        "## 今週の計画コンテキスト",
        f"- source: {source}",
        f"- week_start: {week.get('week_start', now_jst.date().isoformat())}",
        f"- phase: {phase}",
        f"- plan_revision: {revision}",
    ]
    if sessions:
        lines.append("- today_sessions:")
        for session in sessions:
            if not isinstance(session, dict):
                continue
            origin = session.get("origin", "baseline")
            lines.append(
                f"  ({origin}) {session.get('type', 'rest')} / "
                f"{session.get('duration_minutes', 0)}min / "
                f"TSS {session.get('target_tss', 0)}"
            )
    else:
        lines.append("- today_sessions: rest")
    return "\n".join(lines)


def _count_planned_sessions(week: WeekPayload) -> int:
    return sum(1 for session in week.get("sessions", []) if session.get("type") != "rest")


def _weekly_notification_actions() -> list[dict[str, str]]:
    return [
        {"id": "open_review", "label": "確認する"},
        {"id": "approve", "label": "承認"},
        {"id": "dismiss", "label": "見送る"},
    ]


def _weekly_notification_metadata(review_id: str, week: WeekPayload) -> dict[str, object]:
    return {
        "kind": "weekly_review",
        "review_id": review_id,
        "week_start": week["week_start"],
        "plan_revision": week["plan_revision"],
        "respond_path": "/respond",
    }


def _profile_goal(profile: dict[str, object]) -> dict[str, Any]:
    goal = profile.get("goal")
    return dict(goal) if isinstance(goal, dict) else {}


def _profile_goal_label(profile: dict[str, object]) -> str:
    goal = _profile_goal(profile)
    goal_type = goal.get("type")
    goal_name = goal.get("name")
    if isinstance(goal_name, str) and goal_name.strip():
        return goal_name.strip()
    return goal_type if isinstance(goal_type, str) else "fitness_maintenance"


def _weekly_request_message(
    profile: dict[str, object],
    week_start_date: date,
    effective_as_of: datetime,
    baseline_week: WeekPayload,
    user_message: str | None = None,
) -> str:
    goal = _profile_goal(profile)
    goal_date = goal.get("date")
    weekly_schedule = (
        profile.get("training_preference", {}).get("weekly_schedule")
        if isinstance(profile.get("training_preference"), dict)
        else {}
    )
    message = (
        "今週の週次プラン draft を作成してください。\n"
        f"- week_start: {week_start_date.isoformat()}\n"
        f"- as_of: {effective_as_of.isoformat()}\n"
        f"- goal: {_profile_goal_label(profile)}\n"
        f"- goal_date: {goal_date if isinstance(goal_date, str) and goal_date else 'unset'}\n"
        f"- coach_autonomy: {profile.get('coach_autonomy', 'suggest')}\n"
        "以下の baseline を必要なら安全側に調整してください。\n"
        f"```json\n{json.dumps(baseline_week, ensure_ascii=False)}\n```"
    )
    if weekly_schedule:
        message += (
            f"\navailable days:\n```json\n{json.dumps(weekly_schedule, ensure_ascii=False)}\n```"
        )
    if user_message:
        message += f"\nユーザーからの追加要望:\n{user_message}"
    return message


async def _handle_insight(request: RecommendRequest) -> InsightResponse:
    """Detect signals via rules, then use LLM to generate user-facing text."""
    as_of = _parse_as_of(request.as_of)
    signals = detect_signals(override=request.activity_override, as_of=as_of)

    if not signals:
        return InsightResponse(items=[])

    try:
        agent = build_insight_agent()

        session = await session_service.create_session(
            app_name="perfride_insight",
            user_id="perfride_user",
        )

        runner = Runner(
            agent=agent,
            app_name="perfride_insight",
            session_service=session_service,
        )

        user_message = (
            f"以下の検知されたシグナルについて、ユーザー向けの通知テキストを生成してください。\n\n"
            f"シグナル:\n```json\n{json.dumps(signals, ensure_ascii=False)}\n```"
        )

        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)],
        )

        final_response = ""
        async for event in runner.run_async(
            user_id="perfride_user",
            session_id=session.id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_response = event.content.parts[0].text

        response_text = final_response.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        parsed = json.loads(response_text)
        items = []
        for item in parsed:
            signal_match = next((s for s in signals if s["type"] == item.get("type")), None)
            based_on = item.get("based_on", "")
            if not based_on and signal_match:
                data = signal_match.get("data", {})
                based_on = f"直近のトレーニングデータ ({json.dumps(data, ensure_ascii=False)})"
            items.append(
                InsightItem(
                    type=item.get("type", "unknown"),
                    title=item.get("title", ""),
                    summary=item.get("summary", ""),
                    why_now=item.get("why_now", ""),
                    based_on=based_on,
                    priority=signal_match["priority"] if signal_match else "medium",
                )
            )

        return InsightResponse(items=items)

    except Exception:
        items = []
        for s in signals:
            items.append(
                InsightItem(
                    type=s["type"],
                    title=s["type"].replace("_", " ").title(),
                    summary=json.dumps(s["data"], ensure_ascii=False),
                    why_now="",
                    based_on="",
                    priority=s["priority"],
                )
            )
        return InsightResponse(items=items)


@app.post("/recommend")
async def recommend_training(request: RecommendRequest) -> InsightResponse | RecommendResponse:
    """Generate training recommendation or insight signals."""
    if request.mode == "insight":
        return await _handle_insight(request)

    effective_mode = request.recommend_mode or RECOMMEND_MODE
    effective_personal = (
        request.use_personal_data if request.use_personal_data is not None else USE_PERSONAL_DATA
    )

    as_of = _parse_as_of(request.as_of)
    bypass_cache = as_of is not None or request.constraint is not None

    if as_of is not None:
        print(f"[DEV as_of={as_of.isoformat()}]")

    cache = None if bypass_cache else _load_cache()

    if cache and (
        cache.get("goal") != request.goal
        or cache.get("mode") != effective_mode
        or cache.get("use_personal_data") != effective_personal
        or cache.get("ftp") != request.ftp
        or cache.get("coach_autonomy") != request.coach_autonomy
        or cache.get("plan_context_key") != request.plan_context_key
    ):
        cache = None

    if cache and not _should_regenerate(cache, effective_personal):
        if effective_personal and _should_trigger_ambient():
            asyncio.create_task(_run_ambient_flow())
        return RecommendResponse(
            summary=str(cache.get("summary", "")),
            detail=str(cache.get("detail", "")),
            created_at=str(cache.get("created_at", "")),
            from_cache=True,
            workout_intervals=cache.get("workout_intervals"),  # type: ignore[arg-type]
            totalDurationMin=cache.get("totalDurationMin"),  # type: ignore[arg-type]
            workoutName=cache.get("workoutName"),  # type: ignore[arg-type]
            references=cache.get("references"),  # type: ignore[arg-type]
            why_now=cache.get("why_now"),  # type: ignore[arg-type]
            based_on=cache.get("based_on"),  # type: ignore[arg-type]
            plan_context_key=cache.get("plan_context_key"),  # type: ignore[arg-type]
        )

    goal_text = _goal_text(request.goal, request.goal_custom)

    now_jst = as_of if as_of is not None else datetime.now(JST)
    if effective_personal:
        user_message = (
            f"今日のおすすめトレーニングを提案してください。\n"
            f"- トレーニング目標: {goal_text}\n"
            f"- FTP: {request.ftp}W\n"
            f"- 今日の日付: {now_jst.strftime('%Y-%m-%d (%A)')}"
        )
        cache_json = _get_activity_cache(request.activity_override)
        if cache_json is not None:
            summary = _summarize_recent_rides(cache_json.get("activities", []) or [], now_jst)
            if summary:
                user_message += "\n\n## 直近ライドサマリ（事前計算済み）\n" + summary
    else:
        user_message = (
            f"今日のおすすめトレーニングを提案してください。\n"
            f"- 今日の日付: {now_jst.strftime('%Y-%m-%d (%A)')}"
        )

    if request.constraint:
        user_message += f"\n- 制約: {request.constraint}"
    if request.coach_autonomy == "coach":
        user_message += _coach_plan_message(now_jst)

    override_token = activity_override_var.set(request.activity_override)
    as_of_token = as_of_var.set(as_of)
    request_week_start, _ = resolve_week_start_and_as_of(None, request.as_of, now_jst)
    week_start_token = week_start_var.set(request_week_start)
    reference_date_token = reference_date_var.set(now_jst.date())

    try:
        reset_search_count()
        set_search_limit(effective_mode)

        trigger = (
            "coach_daily"
            if effective_personal and request.coach_autonomy == "coach"
            else "dashboard"
        )
        agent = build_agent(effective_mode, effective_personal, trigger=trigger)

        session = await session_service.create_session(
            app_name="perfride_recommend",
            user_id="perfride_user",
        )

        runner = Runner(
            agent=agent,
            app_name="perfride_recommend",
            session_service=session_service,
        )

        content = types.Content(
            role="user",
            parts=[types.Part.from_text(text=user_message)],
        )

        final_response = ""
        async for event in runner.run_async(
            user_id="perfride_user",
            session_id=session.id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_response = event.content.parts[0].text

        parsed = _parse_agent_json_response(final_response) or {
            "summary": "今日のおすすめトレーニングです 🚴",
            "detail": final_response,
        }

        if as_of is not None:
            created_at = as_of.astimezone(UTC).isoformat()
        else:
            created_at = datetime.now(UTC).isoformat()

        today_str = now_jst.strftime("%Y-%m-%d")
        prev_count = 0
        if cache and cache.get("generation_date") == today_str:
            count = cache.get("generation_count", 0)
            prev_count = count if isinstance(count, int) else 0

        activity_mtime = (
            _get_activity_cache_mtime()
            if effective_personal and request.activity_override is None
            else None
        )
        cache_data: dict[str, object] = {
            "summary": parsed.get("summary", ""),
            "detail": parsed.get("detail", ""),
            "created_at": created_at,
            "generation_date": today_str,
            "generation_count": prev_count + 1,
            "activity_cache_mtime": activity_mtime.isoformat() if activity_mtime else None,
            "goal": request.goal,
            "mode": effective_mode,
            "use_personal_data": effective_personal,
            "ftp": request.ftp,
            "coach_autonomy": request.coach_autonomy,
            "plan_context_key": request.plan_context_key,
            "workout_intervals": parsed.get("workout_intervals"),
            "totalDurationMin": parsed.get("totalDurationMin"),
            "workoutName": parsed.get("workoutName"),
            "references": parsed.get("references"),
            "why_now": parsed.get("why_now"),
            "based_on": parsed.get("based_on"),
        }
        if not bypass_cache:
            _save_cache(cache_data)

        if effective_personal and not bypass_cache and _should_trigger_ambient():
            asyncio.create_task(_run_ambient_flow())

        return RecommendResponse(
            summary=parsed.get("summary", ""),
            detail=parsed.get("detail", ""),
            created_at=created_at,
            from_cache=False,
            workout_intervals=parsed.get("workout_intervals"),
            totalDurationMin=parsed.get("totalDurationMin"),
            workoutName=parsed.get("workoutName"),
            references=parsed.get("references"),
            why_now=parsed.get("why_now"),
            based_on=parsed.get("based_on"),
            plan_context_key=request.plan_context_key,
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recommendation: {e}",
        ) from e
    finally:
        activity_override_var.reset(override_token)
        as_of_var.reset(as_of_token)
        week_start_var.reset(week_start_token)
        reference_date_var.reset(reference_date_token)


class WebhookRecommendRequest(BaseModel):
    trigger: str = "webhook"
    activity_id: int | None = None
    trace_id: str | None = None


class RespondRequest(BaseModel):
    session_id: str
    action: str
    user_message: str | None = None
    modification_count: int = 0


# Store session IDs for webhook conversations
_webhook_sessions: dict[str, str] = {}

# Ambient flow state
_ambient_running = False


def _log_webhook_flow(trace_id: str, message: str) -> None:
    print(f"[agent-webhook trace_id={trace_id}] {message}")


def _save_ambient_state(session_id: str, trigger: str) -> None:
    from recommend_agent.gcs import now_jst_iso, write_gcs_json

    activity_mtime = _get_activity_cache_mtime()
    write_gcs_json(
        "ambient_state.json",
        {
            "last_run_at": now_jst_iso(),
            "activity_cache_mtime": activity_mtime.isoformat() if activity_mtime else None,
            "session_id": session_id,
            "trigger": trigger,
        },
    )


def _should_trigger_ambient() -> bool:
    if _ambient_running:
        return False
    try:
        from recommend_agent.gcs import read_gcs_json

        activity_mtime = _get_activity_cache_mtime()
        if activity_mtime is None:
            return False
        state = read_gcs_json("ambient_state.json")
        if state is None:
            return True
        stored_mtime = state.get("activity_cache_mtime")
        if stored_mtime is None:
            return True
        return activity_mtime.isoformat() != stored_mtime
    except Exception:
        return False


async def _run_ambient_flow() -> None:
    global _ambient_running
    if _ambient_running:
        return
    _ambient_running = True
    try:
        agent = build_agent(mode=RECOMMEND_MODE, use_personal_data=True, trigger="webhook")
        session = await session_service.create_session(
            app_name="perfride_webhook",
            user_id="perfride_user",
        )
        _webhook_sessions["latest"] = session.id

        runner = Runner(
            agent=agent,
            app_name="perfride_webhook",
            session_service=session_service,
        )
        content = types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text=(
                        "ダッシュボード表示をトリガーとして次回セッションを判断します。\n"
                        "最新のアクティビティデータに基づき、次回セッションを判断し、"
                        "必要に応じてワークアウトプラットフォームに登録してください。"
                    )
                )
            ],
        )

        async for _event in runner.run_async(
            user_id="perfride_user",
            session_id=session.id,
            new_message=content,
        ):
            pass

        _save_ambient_state(session.id, "dashboard")
        print(f"[ambient] Completed via dashboard trigger, session={session.id}")
    except Exception as e:
        print(f"[ambient] Flow failed: {e}")
    finally:
        _ambient_running = False


def _require_profile() -> dict[str, Any]:
    result = get_user_profile()
    if result.get("status") != "success" or not isinstance(result.get("profile"), dict):
        raise HTTPException(status_code=500, detail="Failed to load user profile")
    return dict(result["profile"])


async def _run_weekly_agent(
    *,
    profile: dict[str, Any],
    week_start_date: date,
    effective_as_of: datetime,
    baseline_week: WeekPayload,
    user_message: str | None = None,
) -> tuple[str, str]:
    as_of_token = as_of_var.set(effective_as_of)
    week_start_token = week_start_var.set(week_start_date)
    reference_date_token = reference_date_var.set(week_start_date)
    try:
        agent = build_agent(RECOMMEND_MODE, True, trigger="weekly")
        session = await session_service.create_session(
            app_name="perfride_weekly_plan",
            user_id="perfride_user",
        )
        runner = Runner(
            agent=agent,
            app_name="perfride_weekly_plan",
            session_service=session_service,
        )
        content = types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text=_weekly_request_message(
                        profile,
                        week_start_date,
                        effective_as_of,
                        baseline_week,
                        user_message,
                    )
                )
            ],
        )

        final_response = ""
        async for event in runner.run_async(
            user_id="perfride_user",
            session_id=session.id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_response = event.content.parts[0].text
        return session.id, final_response
    finally:
        as_of_var.reset(as_of_token)
        week_start_var.reset(week_start_token)
        reference_date_var.reset(reference_date_token)


async def _create_or_update_weekly_review(
    *,
    week_start_date: date,
    effective_as_of: datetime,
    force: bool,
    user_message: str | None = None,
) -> WeeklyPlanResponse:
    profile = _require_profile()
    if profile.get("coach_autonomy") != "coach":
        return WeeklyPlanResponse(
            status="skipped",
            week_start=week_start_date.isoformat(),
            message="coach mode is disabled",
        )

    review_id = review_id_for_week_start(week_start_date.isoformat())
    existing_review = get_review(review_id)
    if existing_review and existing_review.get("status") == "applied" and not force:
        return WeeklyPlanResponse(
            status="skipped",
            week_start=week_start_date.isoformat(),
            review_id=review_id,
            plan_revision=existing_review.get("plan_revision"),
            message="review already applied",
        )

    next_revision = (
        existing_review["plan_revision"] + 1
        if existing_review and isinstance(existing_review.get("plan_revision"), int)
        else 1
    )
    baseline_week = build_baseline_week(profile, week_start_date, plan_revision=next_revision)
    session_id, raw_response = await _run_weekly_agent(
        profile=profile,
        week_start_date=week_start_date,
        effective_as_of=effective_as_of,
        baseline_week=baseline_week,
        user_message=user_message,
    )
    review_status = "modified" if user_message else "pending"
    draft = coerce_weekly_draft(
        raw_response,
        baseline_week=baseline_week,
        week_start_date=week_start_date,
        plan_revision=next_revision,
        status=review_status,
    )
    metadata = _weekly_notification_metadata(review_id, draft)
    review_record = {
        "review_id": review_id,
        "week_start": week_start_date.isoformat(),
        "plan_revision": next_revision,
        "status": review_status,
        "draft": draft,
        "session_id": session_id,
        "user_message": user_message,
        "created_at": (
            existing_review["created_at"]
            if existing_review and isinstance(existing_review.get("created_at"), str)
            else effective_as_of.isoformat()
        ),
        "notified_at": (
            existing_review.get("notified_at") if user_message and existing_review else None
        ),
        "approved_at": None,
        "applied_at": None,
        "dismissed_at": None,
        "error_message": None,
        "notification_metadata": metadata,
    }
    saved_review = upsert_review(review_record)

    if not user_message:
        notification = send_notification(
            user_id=str(profile.get("user_id", "default")),
            title="今週のプラン案を確認してください",
            body=draft.get("summary", "今週のトレーニングプラン案を作成しました。"),
            actions=_weekly_notification_actions(),
            metadata=metadata,
        )
        if notification.get("status") == "success":
            saved_review = (
                update_review_status(
                    review_id,
                    review_status,
                    notified_at=effective_as_of.isoformat(),
                    notification_metadata=metadata,
                )
                or saved_review
            )

    return WeeklyPlanResponse(
        status="draft_created" if not user_message else "modified",
        week_start=week_start_date.isoformat(),
        review_id=review_id,
        plan_revision=saved_review.get("plan_revision"),
        sessions_planned=_count_planned_sessions(draft),
        session_id=session_id,
    )


async def _approve_weekly_review(
    review_id: str,
    *,
    expected_plan_revision: int,
) -> WeeklyPlanResponse:
    review = get_review(review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Weekly review not found")
    current_revision = review.get("plan_revision")
    if current_revision != expected_plan_revision:
        return WeeklyPlanResponse(
            status="conflict",
            week_start=str(review.get("week_start", "")),
            review_id=review_id,
            plan_revision=current_revision if isinstance(current_revision, int) else None,
            message="stale plan revision",
        )
    if isinstance(review.get("applied_at"), str):
        return WeeklyPlanResponse(
            status="approved",
            week_start=str(review.get("week_start", "")),
            review_id=review_id,
            plan_revision=current_revision if isinstance(current_revision, int) else None,
            message="already applied",
        )

    draft = review.get("draft")
    if not isinstance(draft, dict):
        raise HTTPException(status_code=500, detail="Weekly review draft is invalid")

    profile = _require_profile()
    draft_revision = draft.get("plan_revision")
    expected_current_revision = int(draft_revision) if isinstance(draft_revision, int) else None
    try:
        replace_current_week(
            draft,
            user_id=str(profile.get("user_id", "default")),
            goal_event=_profile_goal_label(profile),
            current_phase=str(draft.get("phase", "maintenance")),
            expected_current_revision=expected_current_revision,
        )
    except StalePlanRevisionError as exc:
        # The draft was generated against a now-stale approved week; an
        # appended session may have been added in the meantime. Surface the
        # conflict so the client can re-fetch and re-decide.
        return WeeklyPlanResponse(
            status="conflict",
            week_start=str(review.get("week_start", "")),
            review_id=review_id,
            plan_revision=exc.current_revision,
            message="approved week has advanced since the draft was generated",
        )

    from recommend_agent.tools.build_and_register_workout import build_and_register_workout

    sessions_registered = 0
    for session in draft.get("sessions", []):
        if not isinstance(session, dict):
            continue
        session_type = session.get("type")
        if not isinstance(session_type, str) or session_type == "rest":
            continue
        duration_minutes = int(session.get("duration_minutes", 0))
        target_tss = float(session.get("target_tss", 0))
        built = build_and_register_workout(
            session_type=session_type,
            duration_minutes=duration_minutes,
            ftp=int(profile.get("ftp", 200)),
            target_tss=target_tss,
        )
        if built.get("status") != "success":
            continue
        update_training_plan(
            session_date=str(session.get("date")),
            session_type=session_type,
            duration_minutes=duration_minutes,
            target_tss=int(target_tss),
            status="registered",
            workout_id=(
                str(built["workout_id"]) if isinstance(built.get("workout_id"), str) else None
            ),
            mode="replace",
            target_origin="baseline",
            preserve_plan_revision=True,
        )
        sessions_registered += 1

    applied_at = datetime.now(JST).isoformat()
    update_review_status(
        review_id,
        "applied",
        approved_at=applied_at,
        applied_at=applied_at,
        draft=draft,
    )
    return WeeklyPlanResponse(
        status="approved",
        week_start=str(review.get("week_start", "")),
        review_id=review_id,
        plan_revision=current_revision if isinstance(current_revision, int) else None,
        sessions_planned=_count_planned_sessions(draft),
        sessions_registered=sessions_registered,
    )


@app.post("/api/agent/recommend")
async def recommend_webhook(request: WebhookRecommendRequest):
    """Webhook-triggered recommendation (called by Next.js after Strava webhook)."""
    trace_id = request.trace_id or (
        f"activity-{request.activity_id or 'unknown'}-{int(datetime.now(UTC).timestamp())}"
    )
    trace_token = webhook_trace_id_var.set(trace_id)
    _log_webhook_flow(
        trace_id,
        f"Received request: trigger={request.trigger} activity_id={request.activity_id}",
    )

    try:
        agent = build_agent(
            mode=RECOMMEND_MODE,
            use_personal_data=True,
            trigger="webhook",
        )
        _log_webhook_flow(trace_id, "Agent built")

        session = await session_service.create_session(
            app_name="perfride_webhook",
            user_id="perfride_user",
        )
        _webhook_sessions["latest"] = session.id
        _log_webhook_flow(trace_id, f"Session created: session_id={session.id}")

        runner = Runner(
            agent=agent,
            app_name="perfride_webhook",
            session_service=session_service,
        )

        content = types.Content(
            role="user",
            parts=[
                types.Part.from_text(
                    text=(
                        f"アクティビティが完了しました。\n"
                        f"Activity ID: {request.activity_id}\n"
                        f"Trace ID: {trace_id}\n"
                        f"次回セッションを判断し、必要に応じてワークアウトプラットフォームに登録してください。"
                    )
                )
            ],
        )

        final_response = ""
        _log_webhook_flow(trace_id, "Runner started")
        async for event in runner.run_async(
            user_id="perfride_user",
            session_id=session.id,
            new_message=content,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_response = event.content.parts[0].text

        _save_ambient_state(session.id, "webhook")
        _log_webhook_flow(
            trace_id,
            f"Runner completed: session_id={session.id} response_chars={len(final_response)}",
        )

        return {
            "status": "ok",
            "session_id": session.id,
            "response": final_response,
            "trace_id": trace_id,
        }
    except Exception as e:
        _log_webhook_flow(trace_id, f"Flow failed: {e}")
        raise
    finally:
        webhook_trace_id_var.reset(trace_token)


@app.post("/recommend/respond")
async def recommend_respond(request: RespondRequest):
    """Handle user response to a notification (feedback loop)."""
    agent = build_agent(
        mode=RECOMMEND_MODE,
        use_personal_data=True,
        trigger="webhook",
    )

    runner = Runner(
        agent=agent,
        app_name="perfride_webhook",
        session_service=session_service,
    )

    content = types.Content(
        role="user",
        parts=[
            types.Part.from_text(
                text=(
                    f"ユーザーの応答: {request.action}\n"
                    f"メッセージ: {request.user_message or 'なし'}\n"
                    f"修正回数: {request.modification_count}/3"
                )
            )
        ],
    )

    final_response = ""
    async for event in runner.run_async(
        user_id="perfride_user",
        session_id=request.session_id,
        new_message=content,
    ):
        if event.is_final_response() and event.content and event.content.parts:
            final_response = event.content.parts[0].text

    return {
        "status": "ok",
        "session_id": request.session_id,
        "response": final_response,
    }


@app.post("/api/agent/weekly-plan")
async def weekly_plan(request: WeeklyPlanRequest) -> WeeklyPlanResponse:
    if request.week_start is not None and parse_week_start(request.week_start) is None:
        raise HTTPException(status_code=400, detail="week_start must be a Monday in YYYY-MM-DD")
    if request.as_of is not None and parse_as_of(request.as_of) is None:
        raise HTTPException(status_code=400, detail="as_of must be a valid ISO datetime")
    week_start_date, effective_as_of = resolve_week_start_and_as_of(
        request.week_start,
        request.as_of,
    )
    return await _create_or_update_weekly_review(
        week_start_date=week_start_date,
        effective_as_of=effective_as_of,
        force=request.force,
    )


@app.post("/api/agent/weekly-plan/respond")
async def weekly_plan_respond(request: WeeklyPlanRespondRequest) -> WeeklyPlanResponse:
    review = get_review(request.review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Weekly review not found")

    if review.get("plan_revision") != request.expected_plan_revision:
        return WeeklyPlanResponse(
            status="conflict",
            week_start=str(review.get("week_start", "")),
            review_id=request.review_id,
            plan_revision=(
                review["plan_revision"] if isinstance(review.get("plan_revision"), int) else None
            ),
            message="stale plan revision",
        )

    if request.action == "approve":
        return await _approve_weekly_review(
            request.review_id,
            expected_plan_revision=request.expected_plan_revision,
        )
    if request.action == "modify":
        week_start_value = review.get("week_start")
        if not isinstance(week_start_value, str):
            raise HTTPException(status_code=500, detail="Weekly review week_start is invalid")
        week_start_date = date.fromisoformat(week_start_value)
        _, effective_as_of = resolve_week_start_and_as_of(week_start_value, None)
        return await _create_or_update_weekly_review(
            week_start_date=week_start_date,
            effective_as_of=effective_as_of,
            force=True,
            user_message=request.user_message,
        )
    if request.action == "dismiss":
        dismissed_at = datetime.now(JST).isoformat()
        update_review_status(
            request.review_id,
            "dismissed",
            dismissed_at=dismissed_at,
        )
        return WeeklyPlanResponse(
            status="dismissed",
            week_start=str(review.get("week_start", "")),
            review_id=request.review_id,
            plan_revision=(
                review["plan_revision"] if isinstance(review.get("plan_revision"), int) else None
            ),
        )

    raise HTTPException(status_code=400, detail=f"Unknown weekly action: {request.action}")


@app.post("/api/agent/weekly-plan/append")
async def weekly_plan_append(request: WeeklyPlanAppendRequest) -> WeeklyPlanAppendResponse:
    """Append a session to the existing weekly plan (does not overwrite)."""
    result = update_training_plan(
        session_date=request.session_date,
        session_type=request.session_type,
        duration_minutes=request.duration_minutes,
        target_tss=request.target_tss,
        notes=request.notes,
        mode="append",
        expected_plan_revision=request.expected_plan_revision,
    )

    status = result.get("status")
    if status == "success":
        return WeeklyPlanAppendResponse(
            status="success",
            week_start=result.get("week_start"),
            plan_revision=result.get("plan_revision"),
            appended_session=result.get("updated_session"),
        )
    if status == "conflict":
        return WeeklyPlanAppendResponse(
            status="conflict",
            week_start=result.get("week_start"),
            current_plan_revision=result.get("current_plan_revision"),
            current_sessions=result.get("current_sessions"),
            message=result.get("error_message", "stale plan revision"),
        )

    error_message = result.get("error_message", "append failed")
    if "outside" in error_message or "Invalid session_date" in error_message:
        raise HTTPException(status_code=400, detail=error_message)
    raise HTTPException(status_code=500, detail=error_message)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "perfride-recommend-agent"}
