from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass

import httpx

from mywhoosh.config import COACHING_URL, LOGIN_URL, MYWHOOSH_EMAIL, MYWHOOSH_PASSWORD

DEVICE_ID = hashlib.md5(b"perfride-agent").hexdigest()


@dataclass
class AuthSession:
    access_token: str
    whoosh_id: str


@dataclass
class DeployResult:
    status: str  # "registered" | "failed"
    message: str


class MyWhooshClient:
    def __init__(self) -> None:
        self._session: AuthSession | None = None

    def login(self) -> AuthSession:
        payload = {
            "Username": MYWHOOSH_EMAIL,
            "Password": MYWHOOSH_PASSWORD,
            "Platform": "web",
            "Action": 1001,
            "CorrelationId": str(uuid.uuid4()),
            "DeviceId": DEVICE_ID,
        }
        resp = httpx.post(LOGIN_URL, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if not data.get("Success") and "already logged in" in (data.get("Message") or ""):
            payload["Action"] = 1002
            resp = httpx.post(LOGIN_URL, json=payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()

        if not data.get("Success"):
            raise RuntimeError(f"MyWhoosh login failed: {data.get('Message')}")
        self._session = AuthSession(
            access_token=data["AccessToken"],
            whoosh_id=data["WhooshId"],
        )
        return self._session

    @property
    def session(self) -> AuthSession:
        if self._session is None:
            return self.login()
        return self._session

    def upload_workout(self, workout_payload: dict) -> DeployResult:
        headers = {"Authorization": f"Bearer {self.session.access_token}"}
        payload = {
            "UserId": self.session.whoosh_id,
            "SportsModeType": 0,
            "WorkoutsData": [workout_payload],
        }
        try:
            resp = httpx.post(
                f"{COACHING_URL}/client/custom-workout-upload",
                json=payload,
                headers=headers,
                timeout=30,
            )
        except httpx.HTTPError as e:
            return DeployResult(status="failed", message=str(e))

        if resp.status_code >= 400:
            return DeployResult(
                status="failed",
                message=f"HTTP {resp.status_code}: {resp.text[:200]}",
            )

        return DeployResult(
            status="registered",
            message="MyWhooshにワークアウトを登録しました",
        )
