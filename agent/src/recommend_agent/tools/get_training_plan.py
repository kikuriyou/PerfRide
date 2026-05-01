from __future__ import annotations

from recommend_agent.gcs import read_user_gcs_json
from recommend_agent.tools._request_context import resolve_user_id


def get_training_plan(user_id: str = "default") -> dict:
    try:
        data = read_user_gcs_json("training_plan.json", user_id=resolve_user_id(user_id))
        if data is None:
            return {
                "status": "error",
                "error_message": "Training plan not found in GCS.",
            }
        return {"status": "success", **data}

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to read training plan: {e}",
        }
