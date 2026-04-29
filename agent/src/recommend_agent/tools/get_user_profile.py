from __future__ import annotations

from recommend_agent.gcs import read_gcs_json

_ALLOWED_FIELDS = {
    "coach_autonomy",
    "ftp",
    "weight_kg",
    "max_hr",
    "goal",
    "training_preference",
    "zwift_id",
}


def get_user_profile(user_id: str = "default") -> dict:
    try:
        data = read_gcs_json("user_settings.json")
        if data is None:
            return {
                "status": "error",
                "error_message": "User settings not found in GCS.",
            }
        goal = data.get("goal") if isinstance(data.get("goal"), dict) else {}
        training_preference = (
            data.get("training_preference")
            if isinstance(data.get("training_preference"), dict)
            else {}
        )
        profile = {k: v for k, v in data.items() if k in _ALLOWED_FIELDS}
        profile["coach_autonomy"] = (
            data["coach_autonomy"]
            if isinstance(data.get("coach_autonomy"), str)
            else "suggest"
        )
        profile["goal"] = {
            "type": goal["type"] if isinstance(goal.get("type"), str) else "fitness_maintenance",
            "name": goal["name"] if isinstance(goal.get("name"), str) else "",
            "date": goal["date"] if isinstance(goal.get("date"), str) else None,
            "priority": goal["priority"] if isinstance(goal.get("priority"), str) else "medium",
        }
        profile["training_preference"] = {
            "mode": (
                training_preference["mode"]
                if isinstance(training_preference.get("mode"), str)
                else "outdoor_preferred"
            ),
            "weekly_schedule": (
                training_preference["weekly_schedule"]
                if isinstance(training_preference.get("weekly_schedule"), dict)
                else {}
            ),
            "location": (
                training_preference["location"]
                if isinstance(training_preference.get("location"), dict)
                else {"lat": 0, "lon": 0}
            ),
        }
        return {"status": "success", "profile": profile}

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to read user profile: {e}",
        }
