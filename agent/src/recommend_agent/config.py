from __future__ import annotations

import os

DEFAULT_USER_ID = "default"


class ConfigError(RuntimeError):
    pass


def get_gcs_bucket() -> str:
    bucket = os.environ.get("GCS_BUCKET")
    if not bucket:
        raise ConfigError("GCS_BUCKET is not set")
    return bucket


def get_web_api_url() -> str:
    url = os.environ.get("WEB_API_URL")
    if not url:
        raise ConfigError("WEB_API_URL is not set")
    return url.rstrip("/")
