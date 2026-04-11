"""PerfRide Training Recommendation API Server."""

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel

from recommend_agent.agent import build_agent
from recommend_agent.constants import RECOMMEND_MODE, USE_PERSONAL_DATA
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
    """Request body for training recommendation."""

    goal: str
    ftp: int = 200
    goal_custom: str | None = None
    recommend_mode: str | None = None
    use_personal_data: bool | None = None


class RecommendResponse(BaseModel):
    """Response body with training recommendation."""

    summary: str
    detail: str
    created_at: str
    from_cache: bool = False
    workout_intervals: list[dict[str, str | int | float | None]] | None = None
    totalDurationMin: int | None = None
    workoutName: str | None = None
    references: list[dict[str, str | None]] | None = None


def _load_cache() -> dict[str, object] | None:
    if not CACHE_FILE.exists():
        return None
    try:
        return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def _save_cache(data: dict[str, object]) -> None:
    CACHE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


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


@app.post("/recommend", response_model=RecommendResponse)
async def recommend_training(request: RecommendRequest) -> RecommendResponse:
    """Generate or return cached training recommendation."""
    effective_mode = request.recommend_mode or RECOMMEND_MODE
    effective_personal = (
        request.use_personal_data if request.use_personal_data is not None else USE_PERSONAL_DATA
    )

    cache = _load_cache()

    # Invalidate cache if goal, mode, or personal data setting changed
    if cache and (
        cache.get("goal") != request.goal
        or cache.get("mode") != effective_mode
        or cache.get("use_personal_data") != effective_personal
    ):
        cache = None

    if cache and not _should_regenerate(cache, effective_personal):
        return RecommendResponse(
            summary=str(cache.get("summary", "")),
            detail=str(cache.get("detail", "")),
            created_at=str(cache.get("created_at", "")),
            from_cache=True,
            workout_intervals=cache.get("workout_intervals"),  # type: ignore[arg-type]
            totalDurationMin=cache.get("totalDurationMin"),  # type: ignore[arg-type]
            workoutName=cache.get("workoutName"),  # type: ignore[arg-type]
            references=cache.get("references"),  # type: ignore[arg-type]
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

    if effective_personal:
        user_message = (
            f"今日のおすすめトレーニングを提案してください。\n"
            f"- トレーニング目標: {goal_text}\n"
            f"- FTP: {request.ftp}W\n"
            f"- 今日の日付: {datetime.now(JST).strftime('%Y-%m-%d (%A)')}"
        )
    else:
        user_message = (
            f"今日のおすすめトレーニングを提案してください。\n"
            f"- 今日の日付: {datetime.now(JST).strftime('%Y-%m-%d (%A)')}"
        )

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
            "workout_intervals": parsed.get("workout_intervals"),
            "totalDurationMin": parsed.get("totalDurationMin"),
            "workoutName": parsed.get("workoutName"),
            "references": parsed.get("references"),
        }
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
