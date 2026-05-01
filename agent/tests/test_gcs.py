from unittest.mock import MagicMock, patch

import pytest
from google.api_core.exceptions import PreconditionFailed

from recommend_agent.gcs import (
    OptimisticLockError,
    read_gcs_json_with_generation,
    write_gcs_json,
)


@patch("recommend_agent.gcs._get_bucket")
def test_read_gcs_json_with_generation_returns_zero_when_missing(mock_get_bucket):
    blob = MagicMock()
    blob.exists.return_value = False
    bucket = MagicMock()
    bucket.blob.return_value = blob
    mock_get_bucket.return_value = bucket

    data, generation = read_gcs_json_with_generation("missing.json")
    assert data is None
    assert generation == 0


@patch("recommend_agent.gcs._get_bucket")
def test_read_gcs_json_with_generation_returns_payload_and_generation(mock_get_bucket):
    blob = MagicMock()
    blob.exists.return_value = True
    blob.download_as_text.return_value = '{"foo": 1}'
    blob.generation = 42
    bucket = MagicMock()
    bucket.blob.return_value = blob
    mock_get_bucket.return_value = bucket

    data, generation = read_gcs_json_with_generation("plan.json")
    assert data == {"foo": 1}
    assert generation == 42


@patch("recommend_agent.gcs._get_bucket")
def test_write_gcs_json_passes_precondition(mock_get_bucket):
    blob = MagicMock()
    blob.generation = 7
    bucket = MagicMock()
    bucket.blob.return_value = blob
    mock_get_bucket.return_value = bucket

    new_gen = write_gcs_json("plan.json", {"foo": 1}, if_generation_match=3)
    assert new_gen == 7
    blob.upload_from_string.assert_called_once()
    kwargs = blob.upload_from_string.call_args.kwargs
    assert kwargs["if_generation_match"] == 3


@patch("recommend_agent.gcs._get_bucket")
def test_write_gcs_json_raises_optimistic_lock_error_on_412(mock_get_bucket):
    blob = MagicMock()
    blob.upload_from_string.side_effect = PreconditionFailed("412")
    bucket = MagicMock()
    bucket.blob.return_value = blob
    mock_get_bucket.return_value = bucket

    with pytest.raises(OptimisticLockError):
        write_gcs_json("plan.json", {"foo": 1}, if_generation_match=3)


@patch("recommend_agent.gcs._get_bucket")
def test_write_gcs_json_omits_precondition_when_unspecified(mock_get_bucket):
    blob = MagicMock()
    blob.generation = 1
    bucket = MagicMock()
    bucket.blob.return_value = blob
    mock_get_bucket.return_value = bucket

    write_gcs_json("plan.json", {"foo": 1})
    kwargs = blob.upload_from_string.call_args.kwargs
    assert "if_generation_match" not in kwargs
