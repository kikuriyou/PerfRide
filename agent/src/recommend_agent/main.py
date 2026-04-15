"""PerfRide Training Recommendation API Server."""

import json
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from recommend_agent.agent import build_agent, build_insight_agent
from recommend_agent.constants import RECOMMEND_MODE, USE_PERSONAL_DATA
from recommend_agent.tools.detect_signals import detect_signals
from recommend_agent.tools.search_latest_knowledge import (
    reset_search_count,
    set_search_limit,
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
GCS_BUCKET = os.environ["GCS_BUCKET"]

# ADK session service
session_service = InMemorySessionService()


class RecommendRequest(BaseModel):
    goal: str
    ftp: int = 200
    goal_custom: str | None = None
    recommend_mode: str | None = None
    use_personal_data: bool | None = None
    constraint: str | None = None
    mode: str = "recommend"


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


async def _handle_insight(request: RecommendRequest) -> InsightResponse:
    """Detect signals via rules, then use LLM to generate user-facing text."""
    signals = detect_signals()

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

    cache = _load_cache()

    # Invalidate cache if goal, mode, personal data, or FTP changed
    if cache and (
        cache.get("goal") != request.goal
        or cache.get("mode") != effective_mode
        or cache.get("use_personal_data") != effective_personal
        or cache.get("ftp") != request.ftp
    ):
        cache = None

    if cache and not request.constraint and not _should_regenerate(cache, effective_personal):
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
        )

    # Build the user message with goal and FTP context
    goal_labels = {
        "hillclimb_tt": "レース準備（ヒルクライム/TT）",
        "road_race": "レース準備（ロードレース）",
        "ftp_improvement": "FTP向上",
        "fitness_maintenance": "体力維持",
        "other": request.goal_custom or "その他",
    }
    goal_text = goal_labels.get(request.goal, request.goal)

    now_jst = datetime.now(JST)
    if effective_personal:
        user_message = (
            f"今日のおすすめトレーニングを提案してください。\n"
            f"- トレーニング目標: {goal_text}\n"
            f"- FTP: {request.ftp}W\n"
            f"- 今日の日付: {now_jst.strftime('%Y-%m-%d (%A)')}"
        )
        cache_json = _load_activity_cache_json()
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

    try:
        reset_search_count()
        set_search_limit(effective_mode)

        agent = build_agent(effective_mode, effective_personal)

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

        response_text = final_response.strip()
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        try:
            parsed = json.loads(response_text)
        except json.JSONDecodeError:
            parsed = {
                "summary": "今日のおすすめトレーニングです 🚴",
                "detail": final_response,
            }

        now_utc = datetime.now(UTC)
        created_at = now_utc.isoformat()

        today_str = datetime.now(JST).strftime("%Y-%m-%d")
        prev_count = 0
        if cache and cache.get("generation_date") == today_str:
            count = cache.get("generation_count", 0)
            prev_count = count if isinstance(count, int) else 0

        activity_mtime = _get_activity_cache_mtime() if effective_personal else None
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
            "workout_intervals": parsed.get("workout_intervals"),
            "totalDurationMin": parsed.get("totalDurationMin"),
            "workoutName": parsed.get("workoutName"),
            "references": parsed.get("references"),
            "why_now": parsed.get("why_now"),
            "based_on": parsed.get("based_on"),
        }
        if not request.constraint:
            _save_cache(cache_data)

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
        )

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate recommendation: {e}",
        ) from e


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "perfride-recommend-agent"}
