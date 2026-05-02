from __future__ import annotations

import os

INTERVALS_ICU_API_BASE = os.environ.get(
    "INTERVALS_ICU_API_BASE",
    "https://intervals.icu/api/v1",
)
INTERVALS_ICU_API_KEY = os.environ.get("INTERVALS_ICU_API_KEY", "")
INTERVALS_ICU_ATHLETE_ID = os.environ.get("INTERVALS_ICU_ATHLETE_ID", "0")

