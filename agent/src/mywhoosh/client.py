from __future__ import annotations

import hashlib
import os
import time
import uuid
from dataclasses import dataclass
from threading import Lock

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


@dataclass
class _CachedAuthSession:
    session: AuthSession
    expires_at: float


_SESSION_CACHE: dict[str, _CachedAuthSession] = {}
_SESSION_CACHE_LOCK = Lock()
_DEFAULT_SESSION_TTL_SECONDS = 50 * 60


def _session_ttl_seconds() -> int:
    raw = os.environ.get("MYWHOOSH_SESSION_TTL_SECONDS", str(_DEFAULT_SESSION_TTL_SECONDS))
    try:
        return max(0, int(raw))
    except ValueError:
        return _DEFAULT_SESSION_TTL_SECONDS


def _credentials_cache_key(credentials: MyWhooshCredentials) -> str:
    digest = hashlib.sha256()
    digest.update(credentials.email.encode())
    digest.update(b"\0")
    digest.update(credentials.password.encode())
    return digest.hexdigest()


def clear_mywhoosh_session_cache() -> None:
    with _SESSION_CACHE_LOCK:
        _SESSION_CACHE.clear()


class MyWhooshClient:
    def __init__(
        self,
        credentials: MyWhooshCredentials | None = None,
        *,
        use_session_cache: bool = True,
    ) -> None:
        self._credentials = credentials or MyWhooshCredentials(
            email=MYWHOOSH_EMAIL,
            password=MYWHOOSH_PASSWORD,
        )
        self._session: AuthSession | None = None
        self._use_session_cache = use_session_cache
        self._cache_key = _credentials_cache_key(self._credentials)

    def _cached_session(self) -> AuthSession | None:
        if not self._use_session_cache:
            return None

        now = time.time()
        with _SESSION_CACHE_LOCK:
            cached = _SESSION_CACHE.get(self._cache_key)
            if cached and cached.expires_at > now:
                return cached.session
            if cached:
                _SESSION_CACHE.pop(self._cache_key, None)
        return None

    def _store_cached_session(self, session: AuthSession) -> None:
        if not self._use_session_cache:
            return

        ttl_seconds = _session_ttl_seconds()
        if ttl_seconds <= 0:
            return
        with _SESSION_CACHE_LOCK:
            _SESSION_CACHE[self._cache_key] = _CachedAuthSession(
                session=session,
                expires_at=time.time() + ttl_seconds,
            )

    def _invalidate_cached_session(self) -> None:
        with _SESSION_CACHE_LOCK:
            _SESSION_CACHE.pop(self._cache_key, None)

    def login(self, *, allow_reconnect: bool = True) -> AuthSession:
        if not self._credentials.email or not self._credentials.password:
            raise RuntimeError("MyWhoosh credentials are not configured")

        cached = self._cached_session()
        if cached is not None:
            self._session = cached
            return cached

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
        if (
            allow_reconnect
            and not data.get("Success")
            and "already logged in" in message.lower()
        ):
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
        self._store_cached_session(self._session)
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
            if resp.status_code in {401, 403}:
                self._invalidate_cached_session()
                self._session = None
                headers = {"Authorization": f"Bearer {self.session.access_token}"}
                payload["UserId"] = self.session.whoosh_id
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
