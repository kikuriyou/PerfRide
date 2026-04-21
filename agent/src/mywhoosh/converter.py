from __future__ import annotations

import random

from zwift.zwo_templates import ZwoInterval


def intervals_to_mywhoosh_payload(
    name: str,
    description: str,
    intervals: list[ZwoInterval],
    estimated_tss: float,
) -> dict:
    """ZwoIntervalリストをMyWhooshのワークアウトペイロードに変換する"""
    steps = _build_steps(intervals)
    total_seconds = _total_duration(intervals)

    return {
        "Id": random.randint(100000, 999999),
        "Name": name,
        "Description": description,
        "Mode": "E_Ride",
        "ERGMode": "E_OFF",
        "IsRecovery": False,
        "IsIntervals": any(iv.type == "IntervalsT" for iv in intervals),
        "FTPMode": "E_NoFTP",
        "IsTT": False,
        "IsTSS": False,
        "IsIF": False,
        "FTPMultiplier": 0,
        "StressPoint": 0,
        "Time": total_seconds,
        "CustomTagDescription": "",
        "CategoryId": 1,
        "SubcategoryId": 0,
        "Type": "E_Custom",
        "DisplayType": "E_byWatts",
        "StepCount": len(steps),
        "IsFavorite": False,
        "CompletedCount": 0,
        "WorkoutStepsArray": steps,
        "AuthorName": "PerfRide",
        "WorkoutSteps": {},
        "WorkoutstepsTMap": [],
        "WokoutAssociationId": 0,
        "IF": 0,
        "TSS": round(estimated_tss),
        "KJ": 0,
        "IsVODAvailable": False,
    }


def _build_steps(intervals: list[ZwoInterval]) -> list[dict]:
    steps: list[dict] = []
    step_id = 1

    for iv in intervals:
        if iv.type == "IntervalsT" and iv.repeat and iv.on_duration and iv.off_duration:
            for _ in range(iv.repeat):
                steps.append(_make_step(
                    step_id, "E_Normal", iv.on_duration,
                    power=iv.on_power or 0,
                ))
                step_id += 1
                steps.append(_make_step(
                    step_id, "E_Normal", iv.off_duration,
                    power=iv.off_power or 0,
                ))
                step_id += 1
        elif iv.type == "Warmup":
            steps.append(_make_step(
                step_id, "E_WarmUp", iv.duration_seconds,
                start_power=iv.power_low or 0,
                end_power=iv.power_high or 0,
            ))
            step_id += 1
        elif iv.type == "Cooldown":
            steps.append(_make_step(
                step_id, "E_CoolDown", iv.duration_seconds,
                start_power=iv.power_low or 0,
                end_power=iv.power_high or 0,
            ))
            step_id += 1
        elif iv.type == "FreeRide":
            steps.append(_make_step(step_id, "E_FreeRide", iv.duration_seconds))
            step_id += 1
        else:
            steps.append(_make_step(
                step_id, "E_Normal", iv.duration_seconds,
                power=iv.power,
            ))
            step_id += 1

    return steps


def _make_step(
    step_id: int,
    step_type: str,
    time: int,
    power: float = 0,
    start_power: float = 0,
    end_power: float = 0,
) -> dict:
    return {
        "Id": step_id,
        "Pace": 1,
        "IntervalId": 0,
        "WorkoutMessage": [],
        "Rpm": 0,
        "StepType": step_type,
        "Power": power,
        "StartPower": start_power,
        "EndPower": end_power,
        "Time": time,
        "IsManualGrade": False,
        "ManualGradeValue": 0,
        "ShowAveragePower": False,
        "FlatRoad": 0,
    }


def _total_duration(intervals: list[ZwoInterval]) -> int:
    total = 0
    for iv in intervals:
        if iv.type == "IntervalsT" and iv.repeat and iv.on_duration and iv.off_duration:
            total += iv.repeat * (iv.on_duration + iv.off_duration)
        else:
            total += iv.duration_seconds
    return total
