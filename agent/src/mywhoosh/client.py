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


@dataclass(frozen=True)
class MyWhooshCredentials:
    email: str
    password: str


class MyWhooshClient:
    def __init__(self, credentials: MyWhooshCredentials | None = None) -> None:
        self._credentials = credentials or MyWhooshCredentials(
            email=MYWHOOSH_EMAIL,
            password=MYWHOOSH_PASSWORD,
        )
        self._session: AuthSession | None = None

    def login(self) -> AuthSession:
        if not self._credentials.email or not self._credentials.password:
            raise RuntimeError("MyWhoosh credentials are not configured")
        payload = {
            "Username": self._credentials.email,
            "Password": self._credentials.password,
            "Platform": "web",
            "Action": 1001,
            "CorrelationId": str(uuid.uuid4()),
            "DeviceId": DEVICE_ID,
        }
        resp = httpx.post(LOGIN_URL, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        message = str(data.get("Message") or "")
        if not data.get("Success") and "already logged in" in message.lower():
            retry_payload = {**payload, "Action": 1002}
            resp = httpx.post(LOGIN_URL, json=retry_payload, timeout=30)
            resp.raise_for_status()
            data = resp.json()

        if not data.get("Success"):
            message = str(data.get("Message") or "unknown error")
            raise RuntimeError(f"MyWhoosh login failed: {message}")
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
