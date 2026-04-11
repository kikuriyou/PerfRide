"""Shared constants for the recommend agent package."""

import os
from pathlib import Path

# Knowledge directory: agent/knowledge/
KNOWLEDGE_DIR = Path(__file__).parent.parent.parent / "knowledge"

# Recommend mode: hybrid (default), web_only, no_grounding
RECOMMEND_MODE = os.environ.get("RECOMMEND_MODE", "hybrid")

# Personal data mode: true (default) uses Strava activities/goals/FTP,
# false generates generic cycling recommendations with date only
USE_PERSONAL_DATA = os.environ.get("USE_PERSONAL_DATA", "true").lower() == "true"
