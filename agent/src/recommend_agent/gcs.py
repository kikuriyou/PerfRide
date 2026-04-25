"""Shared GCS read/write utilities for PerfRide agent."""

import json
import os
from datetime import datetime
from typing import TypeVar
from zoneinfo import ZoneInfo

from google.api_core.exceptions import PreconditionFailed
from google.cloud import storage

T = TypeVar("T")

GCS_BUCKET = os.environ.get("GCS_BUCKET", "perfride-shared")
JST = ZoneInfo("Asia/Tokyo")


class OptimisticLockError(Exception):
    """Raised when a GCS write fails its `if_generation_match` precondition."""


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


def read_gcs_json_with_generation(filename: str) -> tuple[dict | None, int]:
    """Return (data, generation). Generation is 0 when the object does not exist."""
    bucket = _get_bucket()
    blob = bucket.blob(filename)
    if not blob.exists():
        return None, 0
    text = blob.download_as_text()
    generation = blob.generation or 0
    return json.loads(text), generation


def write_gcs_json(
    filename: str,
    data: dict | list,
    *,
    if_generation_match: int | None = None,
) -> int:
    """Write JSON to GCS. Returns the new object's generation.

    When `if_generation_match` is provided, raises `OptimisticLockError` on 412.
    Pass 0 to assert the object does not exist.
    """
    bucket = _get_bucket()
    blob = bucket.blob(filename)
    kwargs: dict = {}
    if if_generation_match is not None:
        kwargs["if_generation_match"] = if_generation_match
    try:
        blob.upload_from_string(
            json.dumps(data, ensure_ascii=False, indent=2),
            content_type="application/json",
            **kwargs,
        )
    except PreconditionFailed as exc:
        raise OptimisticLockError(
            f"GCS precondition failed for {filename} (generation {if_generation_match})"
        ) from exc
    return blob.generation or 0


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
