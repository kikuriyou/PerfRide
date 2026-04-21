from __future__ import annotations

import os

ZWIFT_MAC_HOST = os.environ.get("ZWIFT_MAC_HOST", "mac.tailscale")
ZWIFT_MAC_USER = os.environ.get("ZWIFT_MAC_USER", "akira")
ZWIFT_WORKOUTS_DIR = os.environ.get(
    "ZWIFT_WORKOUTS_DIR",
    "/Users/akira/Documents/Zwift/Workouts/{zwift_id}",
)
ZWIFT_ID = os.environ.get("ZWIFT_ID", "8021282")
RESTART_SCRIPT = os.environ.get("ZWIFT_RESTART_SCRIPT", "~/restart-zwift.sh")
