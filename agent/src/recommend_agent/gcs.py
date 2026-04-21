"""Shared GCS read/write utilities for PerfRide agent."""

import json
import os
from datetime import datetime
from typing import TypeVar
from zoneinfo import ZoneInfo

from google.cloud import storage

T = TypeVar("T")

GCS_BUCKET = os.environ.get("GCS_BUCKET", "perfride-shared")
JST = ZoneInfo("Asia/Tokyo")


def _get_bucket() -> storage.Bucket:
    client = storage.Client()
    return client.bucket(GCS_BUCKET)


def read_gcs_json(filename: str) -> dict | None:
    try:
        bucket = _get_bucket()
        blob = bucket.blob(filename)
        if not blob.exists():
            return None
        return json.loads(blob.download_as_text())
    except Exception:
        return None


def write_gcs_json(filename: str, data: dict | list) -> None:
    bucket = _get_bucket()
    blob = bucket.blob(filename)
    blob.upload_from_string(
        json.dumps(data, ensure_ascii=False, indent=2),
        content_type="application/json",
    )


def append_gcs_jsonl(filename: str, record: dict) -> None:
    bucket = _get_bucket()
    blob = bucket.blob(filename)

    existing = ""
    if blob.exists():
        existing = blob.download_as_text()

    line = json.dumps(record, ensure_ascii=False)
    content = existing + line + "\n" if existing else line + "\n"
    blob.upload_from_string(content, content_type="application/x-ndjson")


def now_jst_iso() -> str:
    return datetime.now(JST).isoformat()
