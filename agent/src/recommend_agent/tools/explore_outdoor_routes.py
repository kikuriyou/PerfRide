from __future__ import annotations

import json
import urllib.request
from urllib.error import URLError

from recommend_agent.config import get_web_api_url
from recommend_agent.tools._request_context import resolve_user_id


def explore_outdoor_routes(
    latitude: float,
    longitude: float,
    radius_km: float = 10.0,
) -> dict:
    base_url = get_web_api_url()
    user_id = resolve_user_id()
    url = (
        f"{base_url}/api/strava/routes?lat={latitude}&lng={longitude}"
        f"&radius={radius_km}&user_id={user_id}"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            body = json.loads(resp.read())

        segments = [
            {
                "name": s.get("name", ""),
                "distance_km": s.get("distance_km", 0.0),
                "average_grade": s.get("average_grade", 0.0),
                "climb_category": s.get("climb_category", 0),
                "elevation_difference": s.get("elevation_difference", 0.0),
            }
            for s in body.get("segments", [])
        ]

        return {
            "status": "success",
            "data": {
                "segments": segments,
                "count": len(segments),
            },
        }
    except (URLError, KeyError, json.JSONDecodeError, TypeError) as e:
        return {
            "status": "error",
            "error_message": f"Failed to explore outdoor routes: {e}",
        }
