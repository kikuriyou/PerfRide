from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass


@dataclass
class ZwoInterval:
    type: str  # "Warmup", "SteadyState", "IntervalsT", "Cooldown", "FreeRide"
    duration_seconds: int
    power: float = 0.0
    power_low: float | None = None
    power_high: float | None = None
    repeat: int | None = None
    on_duration: int | None = None
    off_duration: int | None = None
    on_power: float | None = None
    off_power: float | None = None
    label: str = ""


def _minutes(m: int) -> int:
    return m * 60


def _cooldown(minutes: int) -> ZwoInterval:
    return ZwoInterval(
        "Cooldown", _minutes(minutes),
        power_low=0.65, power_high=0.45, label="Cooldown",
    )


def vo2max(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    if duration_minutes >= 75:
        repeats, on_min = 4, 4
    elif duration_minutes >= 60:
        repeats, on_min = 3, 4
    else:
        repeats, on_min = 3, 3

    interval_block_min = repeats * (on_min + 4)
    cooldown_min = duration_minutes - 10 - interval_block_min
    cooldown_min = max(cooldown_min, 5)

    return [
        ZwoInterval("Warmup", _minutes(10), power_low=0.45, power_high=0.75, label="Warmup"),
        ZwoInterval(
            "IntervalsT",
            duration_seconds=0,
            repeat=repeats,
            on_duration=_minutes(on_min),
            off_duration=_minutes(4),
            on_power=1.12,
            off_power=0.50,
            label="VO2max",
        ),
        _cooldown(cooldown_min),
    ]


def threshold(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    cooldown_min = max(duration_minutes - 10 - 20 - 10 - 20, 5)
    return [
        ZwoInterval("Warmup", _minutes(10), power_low=0.45, power_high=0.75, label="Warmup"),
        ZwoInterval("SteadyState", _minutes(20), power=1.00, label="FTP 1"),
        ZwoInterval("SteadyState", _minutes(10), power=0.50, label="Rest"),
        ZwoInterval("SteadyState", _minutes(20), power=1.00, label="FTP 2"),
        _cooldown(cooldown_min),
    ]


def sweetspot(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    if duration_minutes >= 90:
        sets = 3
    elif duration_minutes >= 70:
        sets = 2
    else:
        sets = 2

    intervals: list[ZwoInterval] = [
        ZwoInterval("Warmup", _minutes(10), power_low=0.45, power_high=0.75, label="Warmup"),
    ]
    for i in range(sets):
        intervals.append(ZwoInterval("SteadyState", _minutes(15), power=0.90, label=f"SS {i + 1}"))
        if i < sets - 1:
            intervals.append(ZwoInterval("SteadyState", _minutes(5), power=0.50, label="Rest"))

    used = 10 + sets * 15 + (sets - 1) * 5
    cooldown_min = max(duration_minutes - used, 5)
    intervals.append(_cooldown(cooldown_min))
    return intervals


def endurance(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    steady_min = duration_minutes - 10 - 5
    steady_min = max(steady_min, 10)
    return [
        ZwoInterval("Warmup", _minutes(10), power_low=0.45, power_high=0.65, label="Warmup"),
        ZwoInterval("SteadyState", _minutes(steady_min), power=0.65, label="Endurance"),
        ZwoInterval("Cooldown", _minutes(5), power_low=0.60, power_high=0.45, label="Cooldown"),
    ]


def recovery(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    return [
        ZwoInterval("SteadyState", _minutes(duration_minutes), power=0.50, label="Recovery"),
    ]


def over_under(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    sets = 3 if duration_minutes >= 60 else 2

    intervals: list[ZwoInterval] = [
        ZwoInterval("Warmup", _minutes(10), power_low=0.45, power_high=0.75, label="Warmup"),
    ]
    for i in range(sets):
        intervals.append(ZwoInterval("SteadyState", _minutes(2), power=1.05, label=f"Over {i + 1}"))
        intervals.append(
            ZwoInterval("SteadyState", _minutes(2), power=0.85, label=f"Under {i + 1}"),
        )

    used = 10 + sets * 4
    cooldown_min = max(duration_minutes - used, 5)
    intervals.append(_cooldown(cooldown_min))
    return intervals


def tempo(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    cooldown_min = max(duration_minutes - 10 - 20 - 10 - 20, 5)
    return [
        ZwoInterval("Warmup", _minutes(10), power_low=0.45, power_high=0.75, label="Warmup"),
        ZwoInterval("SteadyState", _minutes(20), power=0.82, label="Tempo 1"),
        ZwoInterval("SteadyState", _minutes(10), power=0.50, label="Rest"),
        ZwoInterval("SteadyState", _minutes(20), power=0.82, label="Tempo 2"),
        _cooldown(cooldown_min),
    ]


def sprint(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    if duration_minutes >= 75:
        repeats = 6
    elif duration_minutes >= 60:
        repeats = 5
    else:
        repeats = 4

    intervals: list[ZwoInterval] = [
        ZwoInterval("Warmup", _minutes(15), power_low=0.45, power_high=0.75, label="Warmup"),
        ZwoInterval(
            "IntervalsT",
            duration_seconds=0,
            repeat=repeats,
            on_duration=30,
            off_duration=_minutes(4) + 30,
            on_power=1.50,
            off_power=0.50,
            label="Sprint",
        ),
    ]
    used = 15 + repeats * 5
    cooldown_min = max(duration_minutes - used, 5)
    intervals.append(_cooldown(cooldown_min))
    return intervals


def race_simulation(duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    steady_min = max(duration_minutes - 20 - 30, 20)
    return [
        ZwoInterval("Warmup", _minutes(20), power_low=0.45, power_high=0.75, label="Warmup"),
        ZwoInterval("SteadyState", _minutes(steady_min), power=0.95, label="Race Pace"),
        ZwoInterval("Cooldown", _minutes(30), power_low=0.75, power_high=0.45, label="Cooldown"),
    ]


_TEMPLATE_MAP: dict[str, Callable[[int, int], list[ZwoInterval]]] = {
    "vo2max": vo2max,
    "threshold": threshold,
    "sweetspot": sweetspot,
    "endurance": endurance,
    "recovery": recovery,
    "over_under": over_under,
    "tempo": tempo,
    "sprint": sprint,
    "race_simulation": race_simulation,
}


def get_template(session_type: str, duration_minutes: int, ftp: int) -> list[ZwoInterval]:
    func = _TEMPLATE_MAP.get(session_type)
    if func is None:
        raise ValueError(f"Unknown session type: {session_type}")
    return func(duration_minutes, ftp)


def estimate_tss(intervals: list[ZwoInterval], ftp: int) -> float:
    total_seconds = 0.0
    weighted_power_sum = 0.0

    for iv in intervals:
        if iv.type == "IntervalsT" and iv.repeat and iv.on_duration and iv.off_duration:
            on_total = iv.repeat * iv.on_duration
            off_total = iv.repeat * iv.off_duration
            on_watts = (iv.on_power or 0.0) * ftp
            off_watts = (iv.off_power or 0.0) * ftp
            weighted_power_sum += on_watts**4 * on_total + off_watts**4 * off_total
            total_seconds += on_total + off_total
        elif iv.type in ("Warmup", "Cooldown"):
            low = (iv.power_low or 0.0) * ftp
            high = (iv.power_high or 0.0) * ftp
            avg = (low + high) / 2
            weighted_power_sum += avg**4 * iv.duration_seconds
            total_seconds += iv.duration_seconds
        else:
            watts = iv.power * ftp
            weighted_power_sum += watts**4 * iv.duration_seconds
            total_seconds += iv.duration_seconds

    if total_seconds == 0:
        return 0.0

    np_watts = (weighted_power_sum / total_seconds) ** 0.25
    intensity_factor = np_watts / ftp
    tss = (total_seconds * np_watts * intensity_factor) / (ftp * 3600) * 100
    return round(tss, 1)
