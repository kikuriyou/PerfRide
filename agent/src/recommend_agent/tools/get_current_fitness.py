from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from recommend_agent.gcs import read_gcs_json

JST = ZoneInfo("Asia/Tokyo")


def get_current_fitness(user_id: str = "default") -> dict:
    try:
        data = read_gcs_json("activity_cache.json")
        if data is None:
            return {
                "status": "error",
                "error_message": "Activity cache not found in GCS.",
            }

        fitness_metrics = data.get("fitness_metrics", {})
        activities = data.get("activities", [])
        latest_activity = activities[0] if activities else None

        today = datetime.now(JST).date()
        cutoff_7d = today - timedelta(days=7)
        cutoff_14d = today - timedelta(days=14)

        recent_7d: list[dict] = []
        tss_14d = 0.0

        for act in activities:
            date_str = act.get("start_date_local", "")[:10]
            if not date_str:
                continue
            try:
                act_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            except ValueError:
                continue

            tss = act.get("tss_estimated", 0.0) or 0.0

            if act_date >= cutoff_7d:
                recent_7d.append(
                    {
                        "date": date_str,
                        "name": act.get("name", ""),
                        "type": act.get("type", ""),
                        "tss_estimated": tss,
                        "distance_km": act.get("distance_km"),
                        "moving_time_seconds": act.get("moving_time"),
                    }
                )
            if act_date >= cutoff_14d:
                tss_14d += tss

        return {
            "status": "success",
            "latest_activity": latest_activity,
            "fitness_metrics": fitness_metrics,
            "recent_activities_7d": recent_7d,
            "recent_activities_14d_tss": round(tss_14d, 1),
        }

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to compute fitness data: {e}",
        }
