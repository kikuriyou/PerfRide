from __future__ import annotations

import json
import os
import urllib.request


def send_notification(
    user_id: str,
    title: str,
    body: str,
    actions: list[dict] | None = None,
    metadata: dict | None = None,
) -> dict:
    web_api_url = os.environ.get("WEB_API_URL", "http://web:3000")
    url = f"{web_api_url}/api/notify"

    payload: dict = {
        "user_id": user_id,
        "title": title,
        "body": body,
    }
    if actions is not None:
        payload["actions"] = actions
    if metadata is not None:
        payload["metadata"] = metadata

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        return {
            "status": "success",
            "channels_sent": data.get("channels_sent", []),
        }
    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to send notification: {e}",
        }
