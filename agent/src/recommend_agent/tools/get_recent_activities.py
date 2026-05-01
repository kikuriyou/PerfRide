"""Tool to read recent activity data from GCS."""

import json

from recommend_agent.config import get_gcs_bucket
from recommend_agent.gcs import user_gcs_path
from recommend_agent.tools._request_context import activity_override_var, resolve_user_id


def get_recent_activities(user_id: str = "default") -> dict:
    """Retrieves recent cycling activity data and schema from GCS shared storage.

    Reads activity_cache.json (activity metrics including TSS, CTL, ATL, TSB)
    and schema.json (field definitions) from Google Cloud Storage.

    Returns:
        dict: A dictionary containing 'status' and either 'data' with activities
              and schema, or 'error_message' on failure.
    """
    override = activity_override_var.get()
    if override is not None:
        return {
            "status": "success",
            "data": {
                "activities": override.get("activities", []),
                "fitness_metrics": override.get("fitness_metrics", {}),
                "last_updated": override.get("last_updated", "unknown"),
                "schema": override.get("schema"),
            },
        }

    try:
        from google.cloud import storage

        resolved_user_id = resolve_user_id(user_id)
        client = storage.Client()
        bucket = client.bucket(get_gcs_bucket())

        activity_blob = bucket.blob(user_gcs_path("activity_cache.json", resolved_user_id))
        if not activity_blob.exists():
            activity_blob = bucket.blob("activity_cache.json")
        if not activity_blob.exists():
            return {
                "status": "error",
                "error_message": (
                    "Activity cache not found. Load the dashboard first to generate activity data."
                ),
            }

        activity_data = json.loads(activity_blob.download_as_text())

        schema_data = None
        schema_blob = bucket.blob(user_gcs_path("schema.json", resolved_user_id))
        if not schema_blob.exists():
            schema_blob = bucket.blob("schema.json")
        if schema_blob.exists():
            schema_data = json.loads(schema_blob.download_as_text())

        return {
            "status": "success",
            "data": {
                "activities": activity_data.get("activities", []),
                "fitness_metrics": activity_data.get("fitness_metrics", {}),
                "last_updated": activity_data.get("last_updated", "unknown"),
                "schema": schema_data,
            },
        }

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to read activity data from GCS: {e}",
        }
