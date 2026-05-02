from __future__ import annotations

import base64
from dataclasses import dataclass
from typing import Any

import httpx

from intervals_icu.config import INTERVALS_ICU_API_BASE


@dataclass(frozen=True)
class IntervalsIcuCredentials:
    api_key: str
    athlete_id: str = "0"


@dataclass
class IntervalsIcuDeployResult:
    status: str
    message: str
    event_id: str | None = None
    external_id: str | None = None


class IntervalsIcuClient:
    def __init__(self, credentials: IntervalsIcuCredentials) -> None:
        self.credentials = credentials

    def _headers(self) -> dict[str, str]:
        token = base64.b64encode(
            f"API_KEY:{self.credentials.api_key}".encode()
        ).decode("ascii")
        return {
            "Authorization": f"Basic {token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "PerfRide workout sync",
        }

    def upsert_workout(self, event: dict[str, Any]) -> IntervalsIcuDeployResult:
        url = (
            f"{INTERVALS_ICU_API_BASE}/athlete/"
            f"{self.credentials.athlete_id}/events/bulk?upsert=true"
        )
        try:
            resp = httpx.post(url, json=[event], headers=self._headers(), timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPStatusError as exc:
            return IntervalsIcuDeployResult(
                status="failed",
                message=f"Intervals.icu request failed: HTTP {exc.response.status_code}",
            )
        except (httpx.HTTPError, ValueError) as exc:
            return IntervalsIcuDeployResult(
                status="failed",
                message=self._safe_error_message(exc),
            )

        if not isinstance(data, list) or not data or not isinstance(data[0], dict):
            return IntervalsIcuDeployResult(
                status="failed",
                message="Intervals.icu returned an unexpected response",
            )

        first = data[0]
        event_id = first.get("id")
        response_external_id = first.get("external_id")
        external_id = response_external_id if isinstance(response_external_id, str) else None
        if external_id is None and isinstance(event.get("external_id"), str):
            external_id = event["external_id"]

        return IntervalsIcuDeployResult(
            status="registered",
            message="Intervals.icuに登録しました。MyWhooshへの反映には数分かかることがあります。",
            event_id=str(event_id) if event_id is not None else None,
            external_id=external_id,
        )

    def test_connection(self) -> dict[str, str | bool]:
        url = f"{INTERVALS_ICU_API_BASE}/athlete/{self.credentials.athlete_id}/profile"
        resp = httpx.get(url, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        return {
            "ok": True,
            "status": "verified",
            "message": "Intervals.icu API key verified",
        }

    def _safe_error_message(self, exc: Exception) -> str:
        message = str(exc) or exc.__class__.__name__
        if self.credentials.api_key:
            message = message.replace(self.credentials.api_key, "[redacted]")
        return f"Intervals.icu request failed: {message}"

