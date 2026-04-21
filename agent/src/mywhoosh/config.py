from __future__ import annotations

import os

MYWHOOSH_EMAIL = os.environ.get("MYWHOOSH_EMAIL", "")
MYWHOOSH_PASSWORD = os.environ.get("MYWHOOSH_PASSWORD", "")

LOGIN_URL = "https://services.mywhoosh.com/http-service/api/login"
COACHING_URL = "https://coaching.mywhoosh.com/api/v2"
