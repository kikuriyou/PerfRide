from __future__ import annotations

from zwift.zwo_templates import ZwoInterval


def intervals_to_intervals_icu_text(intervals: list[ZwoInterval]) -> str:
    lines: list[str] = []
    for interval in intervals:
        if (
            interval.type == "IntervalsT"
            and interval.repeat
            and interval.on_duration
            and interval.off_duration
        ):
            for _ in range(interval.repeat):
                lines.append(_line(interval.on_duration, interval.on_power, interval.label))
                lines.append(_line(interval.off_duration, interval.off_power, "Rest"))
        elif interval.type in {"Warmup", "Cooldown"}:
            lines.append(
                _line(
                    interval.duration_seconds,
                    _avg(interval.power_low, interval.power_high),
                    interval.type,
                )
            )
        elif interval.type == "FreeRide":
            lines.append(_line(interval.duration_seconds, 0.55, "Free ride"))
        else:
            lines.append(_line(interval.duration_seconds, interval.power, interval.label))
    return "\n".join(lines)


def _avg(low: float | None, high: float | None) -> float:
    values = [value for value in [low, high] if value is not None]
    return sum(values) / len(values) if values else 0.55


def _line(seconds: int, power: float | None, label: str = "") -> str:
    duration = _duration(seconds)
    pct = round((power or 0.55) * 100)
    suffix = f" {label}" if label else ""
    return f"- {duration} {pct}%{suffix}"


def _duration(seconds: int) -> str:
    if seconds % 60 == 0:
        return f"{seconds // 60}m"
    return f"{seconds}s"
