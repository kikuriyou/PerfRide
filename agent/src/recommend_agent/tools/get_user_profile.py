from __future__ import annotations

from recommend_agent.gcs import read_gcs_json

_ALLOWED_FIELDS = {
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
        profile = {k: v for k, v in data.items() if k in _ALLOWED_FIELDS}
        return {"status": "success", "profile": profile}

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to read user profile: {e}",
        }
