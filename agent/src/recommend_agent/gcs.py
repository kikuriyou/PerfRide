"""Shared GCS read/write utilities for PerfRide agent."""

import json
from datetime import datetime
from typing import TypeVar
from zoneinfo import ZoneInfo

from google.api_core.exceptions import PreconditionFailed
from google.cloud import storage

from recommend_agent.config import get_gcs_bucket
from recommend_agent.tools._request_context import resolve_user_id

T = TypeVar("T")

JST = ZoneInfo("Asia/Tokyo")


class OptimisticLockError(Exception):
    """Raised when a GCS write fails its `if_generation_match` precondition."""


def _get_bucket() -> storage.Bucket:
    client = storage.Client()
    return client.bucket(get_gcs_bucket())


def user_gcs_path(filename: str, user_id: str | None = None) -> str:
    clean = filename.lstrip("/")
    if clean.startswith("users/"):
        return clean
    return f"users/{resolve_user_id(user_id)}/{clean}"


def read_gcs_json(filename: str) -> dict | None:
    try:
        bucket = _get_bucket()
        blob = bucket.blob(filename)
        if not blob.exists():
            return None
        return json.loads(blob.download_as_text())
    except Exception:
        return None


def read_user_gcs_json(
    filename: str,
    *,
    user_id: str | None = None,
    fallback_legacy: bool = True,
) -> dict | None:
    scoped = user_gcs_path(filename, user_id)
    data = read_gcs_json(scoped)
    if data is not None or not fallback_legacy or scoped == filename:
        return data
    legacy_filename = "user_settings.json" if filename == "settings.json" else filename
    return read_gcs_json(legacy_filename)


def read_gcs_json_with_generation(filename: str) -> tuple[dict | None, int]:
    """Return (data, generation). Generation is 0 when the object does not exist."""
    bucket = _get_bucket()
    blob = bucket.blob(filename)
    if not blob.exists():
        return None, 0
    text = blob.download_as_text()
    generation = blob.generation or 0
    return json.loads(text), generation


def read_user_gcs_json_with_generation(
    filename: str,
    *,
    user_id: str | None = None,
    fallback_legacy: bool = True,
) -> tuple[dict | None, int]:
    scoped = user_gcs_path(filename, user_id)
    data, generation = read_gcs_json_with_generation(scoped)
    if data is not None or not fallback_legacy or scoped == filename:
        return data, generation
    legacy = read_gcs_json(filename)
    return legacy, 0


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


def write_user_gcs_json(
    filename: str,
    data: dict | list,
    *,
    user_id: str | None = None,
    if_generation_match: int | None = None,
) -> int:
    return write_gcs_json(
        user_gcs_path(filename, user_id),
        data,
        if_generation_match=if_generation_match,
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
