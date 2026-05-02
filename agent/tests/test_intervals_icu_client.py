from unittest.mock import Mock, patch

import httpx

from intervals_icu.client import IntervalsIcuClient, IntervalsIcuCredentials


def test_upsert_workout_posts_bulk_event_with_basic_auth():
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = [{"id": 123, "external_id": "perfride:user:key"}]

    client = IntervalsIcuClient(IntervalsIcuCredentials(api_key="secret"))
    with patch("intervals_icu.client.httpx.post", return_value=response) as mock_post:
        result = client.upsert_workout(
            {"category": "WORKOUT", "external_id": "perfride:user:key"}
        )

    assert result.status == "registered"
    assert result.event_id == "123"
    assert result.external_id == "perfride:user:key"
    assert mock_post.call_args.args[0] == (
        "https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true"
    )
    headers = mock_post.call_args.kwargs["headers"]
    assert headers["Authorization"] == "Basic QVBJX0tFWTpzZWNyZXQ="
    assert mock_post.call_args.kwargs["json"][0]["external_id"] == "perfride:user:key"


def test_upsert_workout_normalizes_http_status_error():
    response = httpx.Response(
        401,
        request=httpx.Request(
            "POST",
            "https://intervals.icu/api/v1/athlete/0/events/bulk?upsert=true",
        ),
    )

    with patch("intervals_icu.client.httpx.post", return_value=response):
        result = IntervalsIcuClient(IntervalsIcuCredentials(api_key="secret")).upsert_workout({})

    assert result.status == "failed"
    assert result.message == "Intervals.icu request failed: HTTP 401"
    assert "secret" not in result.message


def test_upsert_workout_rejects_unexpected_response():
    response = Mock()
    response.raise_for_status.return_value = None
    response.json.return_value = {}

    with patch("intervals_icu.client.httpx.post", return_value=response):
        result = IntervalsIcuClient(IntervalsIcuCredentials(api_key="secret")).upsert_workout({})

    assert result.status == "failed"
    assert "unexpected" in result.message


def test_test_connection_gets_profile():
    response = Mock()
    response.raise_for_status.return_value = None

    client = IntervalsIcuClient(IntervalsIcuCredentials(api_key="secret", athlete_id="42"))
    with patch("intervals_icu.client.httpx.get", return_value=response) as mock_get:
        result = client.test_connection()

    assert result["ok"] is True
    assert result["status"] == "verified"
    assert mock_get.call_args.args[0] == "https://intervals.icu/api/v1/athlete/42/profile"

