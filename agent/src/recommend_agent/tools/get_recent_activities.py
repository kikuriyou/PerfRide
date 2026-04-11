"""Tool to read recent activity data from GCS."""

import json
import os


def get_recent_activities() -> dict:
    """Retrieves recent cycling activity data and schema from GCS shared storage.

    Reads activity_cache.json (activity metrics including TSS, CTL, ATL, TSB)
    and schema.json (field definitions) from Google Cloud Storage.

    Returns:
        dict: A dictionary containing 'status' and either 'data' with activities
              and schema, or 'error_message' on failure.
    """
    bucket_name = os.environ["GCS_BUCKET"]

    try:
        from google.cloud import storage

        client = storage.Client()
        bucket = client.bucket(bucket_name)

        # Read activity cache
        activity_blob = bucket.blob("activity_cache.json")
        if not activity_blob.exists():
            return {
                "status": "error",
                "error_message": "Activity cache not found. The dashboard needs to be loaded first to generate activity data.",
            }

        activity_data = json.loads(activity_blob.download_as_text())

        # Read schema
        schema_data = None
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
