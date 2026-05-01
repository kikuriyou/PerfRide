from unittest.mock import patch

from recommend_agent.operation_log import new_operation_run_id, record_agent_operation


def test_new_operation_run_id_prefixes_operation():
    assert new_operation_run_id("daily_recommend").startswith("daily_recommend-")


@patch("recommend_agent.operation_log.append_gcs_jsonl")
def test_record_agent_operation_appends_user_scoped_log(mock_append):
    record_agent_operation(
        status="triggered",
        operation="daily_recommend",
        trigger="dashboard",
        message="Recommendation request received",
        user_id="123",
        run_id="run-1",
        session_id="session-1",
    )

    path, record = mock_append.call_args.args
    assert path == "users/123/agent_operation_log.jsonl"
    assert record["status"] == "triggered"
    assert record["operation"] == "daily_recommend"
    assert record["run_id"] == "run-1"
    assert record["session_id"] == "session-1"
    assert "created_at" in record


@patch("recommend_agent.operation_log.append_gcs_jsonl", side_effect=RuntimeError("GCS down"))
def test_record_agent_operation_is_best_effort(_mock_append):
    record_agent_operation(
        status="error",
        operation="daily_recommend",
        trigger="dashboard",
        message="failed",
        user_id="123",
    )
