from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import date, datetime, timedelta
from typing import TYPE_CHECKING, Any
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from recommend_agent.gcs import read_user_gcs_json
from recommend_agent.operation_log import new_operation_run_id, record_agent_operation
from recommend_agent.tools._request_context import (
    resolve_user_id,
    webhook_trace_id_var,
    workout_registration_result_var,
)
from zwift.zwo_templates import ZwoInterval, estimate_tss, get_template

if TYPE_CHECKING:
    from intervals_icu.client import IntervalsIcuCredentials
    from mywhoosh.client import MyWhooshCredentials

JST = ZoneInfo("Asia/Tokyo")

WORKOUT_PLATFORM = os.environ.get(
    "WORKOUT_PLATFORM",
    "intervals_icu",
)  # "intervals_icu" | "mywhoosh_direct" | "zwift"

_SESSION_LABELS: dict[str, str] = {
    "vo2max": "VO2max",
    "threshold": "Threshold",
    "sweetspot": "Sweet Spot",
    "endurance": "Endurance",
    "recovery": "Recovery",
    "over_under": "Over/Under",
    "tempo": "Tempo",
    "sprint": "Sprint",
    "race_simulation": "Race Sim",
}

_SESSION_TYPE_ALIASES: dict[str, str] = {
    "vo2max": "vo2max",
    "vo2 max": "vo2max",
    "vo2": "vo2max",
    "threshold": "threshold",
    "threshold intervals": "threshold",
    "ftp": "threshold",
    "ftp intervals": "threshold",
    "sweetspot": "sweetspot",
    "sweet spot": "sweetspot",
    "sweet spot intervals": "sweetspot",
    "endurance": "endurance",
    "endurance ride": "endurance",
    "zone 2": "endurance",
    "zone2": "endurance",
    "zone 2 steady state": "endurance",
    "z2": "endurance",
    "recovery": "recovery",
    "recovery ride": "recovery",
    "recovery spin": "recovery",
    "easy spin": "recovery",
    "over under": "over_under",
    "over/under": "over_under",
    "over-under": "over_under",
    "tempo": "tempo",
    "tempo intervals": "tempo",
    "sprint": "sprint",
    "sprints": "sprint",
    "race simulation": "race_simulation",
    "race sim": "race_simulation",
    "race pace": "race_simulation",
}


def _current_jst() -> datetime:
    return datetime.now(JST)


def _normalize_session_type(session_type: str) -> str:
    normalized = " ".join(session_type.replace("_", " ").replace("-", " ").strip().lower().split())
    if normalized in _SESSION_TYPE_ALIASES:
        return _SESSION_TYPE_ALIASES[normalized]
    compact = normalized.replace(" ", "")
    return _SESSION_TYPE_ALIASES.get(compact, compact)


def _log_build(message: str) -> None:
    trace_id = webhook_trace_id_var.get()
    if trace_id:
        print(f"[workout-register trace_id={trace_id}] {message}")
    else:
        print(f"[workout-register] {message}")


def _workout_platform() -> str:
    return os.environ.get("WORKOUT_PLATFORM", WORKOUT_PLATFORM).strip().lower()


def _canonical_platform(platform: str) -> str:
    if platform in {"intervals_icu", "intervals.icu", "intervalicu"}:
        return "intervals_icu"
    if platform in {"mywhoosh", "mywhoosh_direct"}:
        return "mywhoosh_direct"
    return platform


def _build_interval_name(session_type: str, intervals: list) -> str:
    label = _SESSION_LABELS.get(session_type, session_type)
    for iv in intervals:
        if iv.type == "IntervalsT" and iv.repeat and iv.on_duration:
            on_min = iv.on_duration // 60
            return f"{label} {iv.repeat}x{on_min}min"
        if iv.type == "SteadyState" and iv.label and iv.label != "Rest":
            dur_min = iv.duration_seconds // 60
            return f"{label} {dur_min}min"
    return label


def _build_workout_name(base_name: str, registered_at: datetime) -> str:
    registered_label = registered_at.strftime("%Y%m%d-%H%M")
    return f"PerfRide {registered_label} {base_name}"


def _build_description(base_name: str, registered_at: datetime) -> str:
    registered_label = registered_at.strftime("%Y-%m-%d %H:%M JST")
    return f"PerfRide auto-generated {base_name} (registered {registered_label})"


def _format_intervals(intervals: list) -> list[dict]:
    result: list[dict] = []
    cursor_min = 0.0
    for iv in intervals:
        if iv.type == "IntervalsT" and iv.repeat and iv.on_duration and iv.off_duration:
            for rep in range(iv.repeat):
                on_start = cursor_min
                on_end = on_start + iv.on_duration / 60
                result.append(
                    {
                        "start_min": round(on_start, 1),
                        "end_min": round(on_end, 1),
                        "power_percent": round((iv.on_power or 0) * 100),
                        "label": f"{iv.label} {rep + 1}",
                    }
                )
                off_start = on_end
                off_end = off_start + iv.off_duration / 60
                result.append(
                    {
                        "start_min": round(off_start, 1),
                        "end_min": round(off_end, 1),
                        "power_percent": round((iv.off_power or 0) * 100),
                        "label": "Rest",
                    }
                )
                cursor_min = off_end
        else:
            dur_min = iv.duration_seconds / 60
            power_pct = 0
            if iv.power:
                power_pct = round(iv.power * 100)
            elif iv.power_low and iv.power_high:
                power_pct = round((iv.power_low + iv.power_high) / 2 * 100)
            result.append(
                {
                    "start_min": round(cursor_min, 1),
                    "end_min": round(cursor_min + dur_min, 1),
                    "power_percent": power_pct,
                    "label": iv.label,
                }
            )
            cursor_min += dur_min
    return result


def _deploy_zwift(name: str, desc: str, intervals: list, zwo_content: str) -> dict:
    from zwift.deployer import deploy_workout
    from zwift.zwo_generator import generate_filename

    today_str = _current_jst().strftime("%Y%m%d")
    session = intervals[0].type if intervals else "workout"
    zwo_filename = generate_filename(session, today_str, zwo_content)

    try:
        result = deploy_workout(zwo_content, zwo_filename)
        return {
            "platform_status": result.status,
            "platform_message": result.message,
            "filename": zwo_filename,
        }
    except Exception as e:
        return {
            "platform_status": "failed",
            "platform_message": str(e),
            "filename": zwo_filename,
        }


def _decrypt_kms_ciphertext(ciphertext: str) -> str | None:
    key_name = os.environ.get("KMS_KEY_NAME")
    if not key_name:
        return None
    try:
        import google.auth
        from google.auth.transport.requests import Request as GoogleAuthRequest

        credentials, _project_id = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        credentials.refresh(GoogleAuthRequest())
        token = credentials.token
        if not token:
            return None
        req = Request(
            f"https://cloudkms.googleapis.com/v1/{key_name}:decrypt",
            data=json.dumps({"ciphertext": ciphertext}).encode(),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode())
        plaintext = body.get("plaintext")
        if not isinstance(plaintext, str):
            return None
        return base64.b64decode(plaintext).decode()
    except Exception:
        return None


def _load_mywhoosh_credentials(user_id: str) -> MyWhooshCredentials | None:
    from mywhoosh.client import MyWhooshCredentials

    env_email = os.environ.get("MYWHOOSH_EMAIL", "")
    env_password = os.environ.get("MYWHOOSH_PASSWORD", "")
    if env_email and env_password:
        return MyWhooshCredentials(email=env_email, password=env_password)

    data = read_user_gcs_json(
        "integrations/mywhoosh.json",
        user_id=user_id,
        fallback_legacy=False,
    )
    if isinstance(data, dict):
        email = data.get("email") if isinstance(data.get("email"), str) else ""
        password = data.get("password") if isinstance(data.get("password"), str) else ""
        ciphertext = data.get("ciphertext") if isinstance(data.get("ciphertext"), str) else None
        if not ciphertext and isinstance(data.get("password_ciphertext"), str):
            ciphertext = data["password_ciphertext"]
        if not password and ciphertext:
            password = _decrypt_kms_ciphertext(ciphertext) or ""
        if email and password:
            return MyWhooshCredentials(email=email, password=password)

    return None


def _has_saved_mywhoosh_ciphertext(user_id: str) -> bool:
    data = read_user_gcs_json(
        "integrations/mywhoosh.json",
        user_id=user_id,
        fallback_legacy=False,
    )
    return isinstance(data, dict) and (
        isinstance(data.get("password_ciphertext"), str) or isinstance(data.get("ciphertext"), str)
    )


def _format_mywhoosh_failure(message: str, *, sanitize_unknown: bool = False) -> tuple[str, str]:
    if "already logged in" in message.lower():
        return (
            "already_logged_in",
            "MyWhoosh account is already logged in from another device. Log out there and retry.",
        )
    if "mywhoosh login failed" in message.lower():
        return ("failed", "MyWhoosh login failed. Check the email and password.")
    if sanitize_unknown:
        return ("failed", "MyWhoosh login failed. Check the email and password.")
    return ("failed", message)


def test_mywhoosh_login(user_id: str) -> dict[str, str | bool]:
    from mywhoosh.client import MyWhooshClient

    credentials = _load_mywhoosh_credentials(user_id)
    if credentials is None:
        message = "MyWhoosh credentials are not configured"
        if _has_saved_mywhoosh_ciphertext(user_id):
            message = "MyWhoosh credentials could not be decrypted"
        return {"ok": False, "status": "missing", "message": message}

    try:
        MyWhooshClient(credentials=credentials).login(allow_reconnect=False)
    except Exception as exc:
        status, message = _format_mywhoosh_failure(str(exc), sanitize_unknown=True)
        return {
            "ok": False,
            "status": status,
            "message": message,
        }
    return {"ok": True, "status": "verified", "message": "MyWhoosh login verified"}


def _deploy_mywhoosh(
    name: str,
    desc: str,
    intervals: list,
    estimated_tss: float,
    user_id: str,
) -> dict:
    from mywhoosh.client import MyWhooshClient
    from mywhoosh.converter import intervals_to_mywhoosh_payload

    credentials = _load_mywhoosh_credentials(user_id)
    if credentials is None:
        return {
            "platform_status": "skipped",
            "platform_message": "MyWhoosh credentials are not configured",
        }

    payload = intervals_to_mywhoosh_payload(name, desc, intervals, estimated_tss)
    client = MyWhooshClient(credentials=credentials)

    try:
        result = client.upload_workout(payload)
        return {"platform_status": result.status, "platform_message": result.message}
    except Exception as e:
        _, message = _format_mywhoosh_failure(str(e))
        return {"platform_status": "failed", "platform_message": message}


def _resolve_session_date(
    session_date: str | None,
    registered_at: datetime,
    *,
    minimum_date: date | None = None,
) -> str:
    current_date = registered_at.astimezone(JST).date()
    floor_date = minimum_date or current_date
    if session_date:
        try:
            parsed_date = date.fromisoformat(session_date.strip())
        except ValueError as exc:
            raise ValueError("session_date must be YYYY-MM-DD") from exc
        return max(parsed_date, floor_date).isoformat()
    return (current_date + timedelta(days=1)).isoformat()


def _safe_external_part(value: str) -> str:
    raw = value.strip()
    if not raw:
        return "empty"
    if "@" in raw:
        return f"h:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"
    cleaned = "".join(ch if ch.isalnum() or ch in "._:-" else "-" for ch in raw)
    return cleaned[:160] if cleaned else "empty"


def _build_intervals_icu_external_id(
    user_id: str,
    *,
    session_date: str,
    session_type: str,
    duration_minutes: int,
    target_tss: float | None,
    workout_key: str | None,
    trace_id: str | None,
) -> str:
    if workout_key and workout_key.strip():
        stable_key = workout_key
    elif trace_id and trace_id.strip():
        stable_key = trace_id
    else:
        seed = f"{session_date}:{session_type}:{duration_minutes}:{round(target_tss or 0)}"
        stable_key = f"auto:{hashlib.sha256(seed.encode()).hexdigest()[:16]}"
    return f"perfride:{_safe_external_part(user_id)}:{_safe_external_part(stable_key)}"


def _total_duration_seconds(intervals: list[ZwoInterval]) -> int:
    total = 0
    for interval in intervals:
        if (
            interval.type == "IntervalsT"
            and interval.repeat
            and interval.on_duration
            and interval.off_duration
        ):
            total += interval.repeat * (interval.on_duration + interval.off_duration)
        else:
            total += interval.duration_seconds
    return total


def _build_intervals_icu_event(
    *,
    name: str,
    workout_text: str,
    intervals: list[ZwoInterval],
    session_date: str,
    external_id: str,
    estimated_tss: float,
) -> dict[str, Any]:
    return {
        "category": "WORKOUT",
        "type": "Ride",
        "start_date_local": f"{session_date}T00:00:00",
        "name": name,
        "description": workout_text,
        "moving_time": _total_duration_seconds(intervals),
        "target": "POWER",
        "icu_training_load": round(estimated_tss),
        "external_id": external_id,
    }


def _load_intervals_icu_credentials(user_id: str) -> IntervalsIcuCredentials | None:
    from intervals_icu.client import IntervalsIcuCredentials

    env_key = os.environ.get("INTERVALS_ICU_API_KEY", "")
    env_athlete_id = os.environ.get("INTERVALS_ICU_ATHLETE_ID", "0")
    if env_key:
        return IntervalsIcuCredentials(api_key=env_key, athlete_id=env_athlete_id or "0")

    data = read_user_gcs_json(
        "integrations/intervals_icu.json",
        user_id=user_id,
        fallback_legacy=False,
    )
    if not isinstance(data, dict):
        return None

    ciphertext = data.get("api_key_ciphertext")
    api_key = _decrypt_kms_ciphertext(ciphertext) if isinstance(ciphertext, str) else ""
    athlete_id = data.get("athlete_id") if isinstance(data.get("athlete_id"), str) else "0"
    if api_key:
        return IntervalsIcuCredentials(api_key=api_key, athlete_id=athlete_id or "0")
    return None


def _has_saved_intervals_icu_ciphertext(user_id: str) -> bool:
    data = read_user_gcs_json(
        "integrations/intervals_icu.json",
        user_id=user_id,
        fallback_legacy=False,
    )
    return isinstance(data, dict) and isinstance(data.get("api_key_ciphertext"), str)


def _format_intervals_icu_failure(
    message: str,
    *,
    api_key: str = "",
    sanitize_unknown: bool = False,
) -> str:
    if api_key:
        message = message.replace(api_key, "[redacted]")
    lower = message.lower()
    if "401" in lower or "403" in lower or "unauthorized" in lower or "forbidden" in lower:
        return "Intervals.icu API key could not be verified"
    if sanitize_unknown:
        return "Intervals.icu connection check failed"
    return message


def test_intervals_icu_connection(user_id: str) -> dict[str, str | bool]:
    from intervals_icu.client import IntervalsIcuClient

    credentials = _load_intervals_icu_credentials(user_id)
    if credentials is None:
        message = "Intervals.icu API key is not configured"
        if _has_saved_intervals_icu_ciphertext(user_id):
            message = "Intervals.icu API key could not be decrypted"
        return {"ok": False, "status": "missing", "message": message}

    try:
        return IntervalsIcuClient(credentials).test_connection()
    except Exception as exc:
        return {
            "ok": False,
            "status": "failed",
            "message": _format_intervals_icu_failure(
                str(exc),
                api_key=credentials.api_key,
                sanitize_unknown=True,
            ),
        }


def _deploy_intervals_icu(
    *,
    name: str,
    intervals: list[ZwoInterval],
    estimated_tss: float,
    user_id: str,
    session_date: str,
    session_type: str,
    duration_minutes: int,
    target_tss: float | None,
    workout_key: str | None,
    trace_id: str | None,
) -> dict[str, str | None]:
    from intervals_icu.client import IntervalsIcuClient
    from intervals_icu.converter import intervals_to_intervals_icu_text

    credentials = _load_intervals_icu_credentials(user_id)
    if credentials is None:
        return {
            "platform_status": "skipped",
            "platform_message": "Intervals.icu API key is not configured",
        }

    external_id = _build_intervals_icu_external_id(
        user_id,
        session_date=session_date,
        session_type=session_type,
        duration_minutes=duration_minutes,
        target_tss=target_tss,
        workout_key=workout_key,
        trace_id=trace_id,
    )
    workout_text = intervals_to_intervals_icu_text(intervals)
    event = _build_intervals_icu_event(
        name=name,
        workout_text=workout_text,
        intervals=intervals,
        session_date=session_date,
        external_id=external_id,
        estimated_tss=estimated_tss,
    )
    result = IntervalsIcuClient(credentials).upsert_workout(event)
    return {
        "platform_status": result.status,
        "platform_message": result.message,
        "workout_id": result.event_id or result.external_id,
        "external_id": result.external_id,
        "intervals_event_id": result.event_id,
    }


def build_and_register_workout(
    session_type: str,
    duration_minutes: int,
    ftp: int,
    target_tss: float | None = None,
    description: str | None = None,
    session_date: str | None = None,
    workout_key: str | None = None,
) -> dict:
    user_id = resolve_user_id()
    trace_id = webhook_trace_id_var.get()
    trigger = "webhook" if trace_id else "agent_tool"
    operation_run_id = new_operation_run_id("workout_registration")
    requested_session_type = session_type
    session_type = _normalize_session_type(session_type)
    platform = _canonical_platform(_workout_platform())
    record_agent_operation(
        status="triggered",
        operation="workout_registration",
        trigger=trigger,
        message="Workout registration trigger turned on",
        user_id=user_id,
        run_id=operation_run_id,
        trace_id=trace_id,
        metadata={
            "session_type": requested_session_type,
            "duration_minutes": duration_minutes,
            "target_tss": target_tss,
            "platform": platform,
            "session_date": session_date,
            "workout_key": workout_key,
        },
    )
    record_agent_operation(
        status="started",
        operation="workout_registration",
        trigger=trigger,
        message="Workout registration processing started",
        user_id=user_id,
        run_id=operation_run_id,
        trace_id=trace_id,
    )
    _log_build(
        "Requested: "
        f"session_type={requested_session_type} normalized_session_type={session_type} "
        f"duration_minutes={duration_minutes} ftp={ftp} "
        f"target_tss={target_tss} platform={platform} user_id={user_id}"
    )

    try:
        intervals = get_template(session_type, duration_minutes, ftp)
    except ValueError as e:
        _log_build(f"Template build failed: {e}")
        record_agent_operation(
            status="error",
            operation="workout_registration",
            trigger=trigger,
            message=f"Workout template build failed: {e}",
            user_id=user_id,
            run_id=operation_run_id,
            trace_id=trace_id,
        )
        return {
            "status": "error",
            "error_message": (
                f"{e}. Supported session types: "
                "vo2max, threshold, sweetspot, endurance, recovery, "
                "over_under, tempo, sprint, race_simulation"
            ),
        }

    estimated_tss = estimate_tss(intervals, ftp)
    registered_at = _current_jst()
    current_date = registered_at.astimezone(JST).date()
    minimum_session_date = (
        current_date + timedelta(days=1) if trigger == "webhook" else current_date
    )
    try:
        resolved_session_date = _resolve_session_date(
            session_date,
            registered_at,
            minimum_date=minimum_session_date,
        )
    except ValueError as exc:
        _log_build(f"Session date validation failed: {exc}")
        record_agent_operation(
            status="error",
            operation="workout_registration",
            trigger=trigger,
            message=f"Workout registration failed: {exc}",
            user_id=user_id,
            run_id=operation_run_id,
            trace_id=trace_id,
        )
        return {"status": "error", "error_message": str(exc)}
    requested_session_date = session_date.strip() if session_date else None
    if requested_session_date and requested_session_date != resolved_session_date:
        _log_build(
            "Adjusted session_date: "
            f"requested={requested_session_date} resolved={resolved_session_date}"
        )

    base_name = _build_interval_name(session_type, intervals)
    name = _build_workout_name(base_name, registered_at)
    desc = description or _build_description(base_name, registered_at)
    formatted = _format_intervals(intervals)
    _log_build(
        f"Template built: base_summary={base_name} summary={name} "
        f"estimated_tss={round(estimated_tss, 1)} "
        f"intervals={len(formatted)}"
    )

    if platform == "zwift":
        from zwift.zwo_generator import generate_zwo

        zwo_content = generate_zwo(name, desc, intervals)
        deploy_info = _deploy_zwift(name, desc, intervals, zwo_content)
    elif platform == "intervals_icu":
        deploy_info = _deploy_intervals_icu(
            name=name,
            intervals=intervals,
            estimated_tss=estimated_tss,
            user_id=user_id,
            session_date=resolved_session_date,
            session_type=session_type,
            duration_minutes=duration_minutes,
            target_tss=target_tss,
            workout_key=workout_key,
            trace_id=trace_id,
        )
    elif platform == "mywhoosh_direct":
        deploy_info = _deploy_mywhoosh(name, desc, intervals, estimated_tss, user_id)
    else:
        deploy_info = {
            "platform_status": "skipped",
            "platform_message": f"Unsupported workout platform: {platform}",
        }

    platform_status = deploy_info.get("platform_status")
    result = {
        "status": (
            "error"
            if platform_status == "failed"
            else "skipped"
            if platform_status == "skipped"
            else "success"
        ),
        "platform": platform,
        "intervals": formatted,
        "estimated_tss": estimated_tss,
        "summary": name,
        "base_summary": base_name,
        "registered_at": registered_at.isoformat(),
        "session_date": resolved_session_date,
        **deploy_info,
    }
    if deploy_info.get("workout_id"):
        result["workout_id"] = deploy_info["workout_id"]
    elif deploy_info.get("filename"):
        result["workout_id"] = deploy_info["filename"]
    _log_build(
        "Registration result: "
        f"status={result['status']} platform_status={deploy_info.get('platform_status')} "
        f"workout_id={result.get('workout_id')} message={deploy_info.get('platform_message')}"
    )
    result_status = result["status"]
    operation_message = f"Workout registration {result_status}"
    if deploy_info.get("platform_message"):
        operation_message = f"{operation_message}: {deploy_info.get('platform_message')}"
    record_agent_operation(
        status=(
            "completed"
            if result_status == "success"
            else "skipped"
            if result_status == "skipped"
            else "error"
        ),
        operation="workout_registration",
        trigger=trigger,
        message=operation_message,
        user_id=user_id,
        run_id=operation_run_id,
        trace_id=trace_id,
        metadata={
            "session_type": session_type,
            "platform": platform,
            "platform_status": deploy_info.get("platform_status"),
            "workout_id": result.get("workout_id"),
            "external_id": deploy_info.get("external_id"),
            "intervals_event_id": deploy_info.get("intervals_event_id"),
            "requested_session_date": requested_session_date,
            "session_date": resolved_session_date,
            "platform_message": deploy_info.get("platform_message"),
        },
    )
    workout_registration_result_var.set(dict(result))
    return result
