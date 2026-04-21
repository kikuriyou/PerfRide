from __future__ import annotations

from recommend_agent.gcs import now_jst_iso, read_gcs_json, write_gcs_json


def update_training_plan(
    session_date: str,
    session_type: str,
    duration_minutes: int = 0,
    target_tss: int = 0,
    status: str = "planned",
    zwift_workout: str | None = None,
    actual_tss: float | None = None,
) -> dict:
    try:
        data = read_gcs_json("training_plan.json")
        if data is None:
            data = {"weekly_plan": []}

        weekly_plan = data.get("weekly_plan", [])

        session_entry = {
            "date": session_date,
            "session_type": session_type,
            "duration_minutes": duration_minutes,
            "target_tss": target_tss,
            "status": status,
            "updated_by": "recommend_agent",
            "updated_at": now_jst_iso(),
        }
        if zwift_workout is not None:
            session_entry["zwift_workout"] = zwift_workout
        if actual_tss is not None:
            session_entry["actual_tss"] = actual_tss

        found = False
        for week in weekly_plan:
            sessions = week.get("sessions", [])
            for i, s in enumerate(sessions):
                if s.get("date") == session_date:
                    sessions[i] = {**sessions[i], **session_entry}
                    found = True
                    break
            if found:
                break

        if not found:
            if weekly_plan:
                target_week = weekly_plan[-1]
            else:
                target_week = {"week": session_date[:10], "sessions": []}
                weekly_plan.append(target_week)
            target_week.setdefault("sessions", []).append(session_entry)

        data["weekly_plan"] = weekly_plan
        write_gcs_json("training_plan.json", data)

        return {
            "status": "success",
            "updated_session": session_entry,
        }

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to update training plan: {e}",
        }
