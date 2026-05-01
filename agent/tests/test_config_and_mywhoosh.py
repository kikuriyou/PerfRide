import importlib
from unittest.mock import Mock, patch

import pytest

from mywhoosh.client import MyWhooshClient, MyWhooshCredentials
from recommend_agent.config import ConfigError, get_gcs_bucket, get_web_api_url


def test_main_imports_without_runtime_env(monkeypatch):
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    monkeypatch.delenv("WEB_API_URL", raising=False)
    importlib.import_module("recommend_agent.main")


def test_config_requires_runtime_env(monkeypatch):
    monkeypatch.delenv("GCS_BUCKET", raising=False)
    monkeypatch.delenv("WEB_API_URL", raising=False)
    with pytest.raises(ConfigError):
        get_gcs_bucket()
    with pytest.raises(ConfigError):
        get_web_api_url()


def test_mywhoosh_client_uses_injected_credentials():
    client = MyWhooshClient(MyWhooshCredentials(email="u@example.com", password="pw"))
    with patch("mywhoosh.client.httpx.post") as mock_post:
        mock_post.return_value.json.return_value = {
            "Success": True,
            "AccessToken": "token",
            "WhooshId": "whoosh",
        }
        client.login()

    payload = mock_post.call_args.kwargs["json"]
    assert payload["Username"] == "u@example.com"
    assert payload["Password"] == "pw"


def test_mywhoosh_client_retries_already_logged_in_case_insensitive():
    client = MyWhooshClient(MyWhooshCredentials(email="u@example.com", password="pw"))
    first = Mock()
    first.json.return_value = {"Success": False, "Message": "Already Logged In"}
    second = Mock()
    second.json.return_value = {
        "Success": True,
        "AccessToken": "token",
        "WhooshId": "whoosh",
    }
    with patch("mywhoosh.client.httpx.post", side_effect=[first, second]) as mock_post:
        client.login()

    assert mock_post.call_count == 2
    assert mock_post.call_args_list[0].kwargs["json"]["Action"] == 1001
    assert mock_post.call_args_list[1].kwargs["json"]["Action"] == 1002


def test_mywhoosh_client_rejects_missing_credentials(monkeypatch):
    monkeypatch.delenv("MYWHOOSH_EMAIL", raising=False)
    monkeypatch.delenv("MYWHOOSH_PASSWORD", raising=False)
    with pytest.raises(RuntimeError, match="credentials"):
        MyWhooshClient().login()


def test_mywhoosh_credentials_prefer_agent_env(monkeypatch):
    from recommend_agent.tools import build_and_register_workout as workout

    monkeypatch.setenv("MYWHOOSH_EMAIL", "env@example.com")
    monkeypatch.setenv("MYWHOOSH_PASSWORD", "env-password")
    read_mock = Mock(return_value={"email": "saved@example.com", "password": "saved-password"})
    monkeypatch.setattr(workout, "read_user_gcs_json", read_mock)

    credentials = workout._load_mywhoosh_credentials("123")

    assert credentials == MyWhooshCredentials(email="env@example.com", password="env-password")
    read_mock.assert_not_called()


def test_mywhoosh_credentials_fall_back_to_saved_settings(monkeypatch):
    from recommend_agent.tools import build_and_register_workout as workout

    monkeypatch.delenv("MYWHOOSH_EMAIL", raising=False)
    monkeypatch.delenv("MYWHOOSH_PASSWORD", raising=False)
    monkeypatch.setattr(
        workout,
        "read_user_gcs_json",
        lambda *args, **kwargs: {"email": "saved@example.com", "password": "saved-password"},
    )

    credentials = workout._load_mywhoosh_credentials("123")

    assert credentials == MyWhooshCredentials(email="saved@example.com", password="saved-password")


def test_mywhoosh_login_check_verifies_credentials(monkeypatch):
    from recommend_agent.tools import build_and_register_workout as workout

    monkeypatch.setattr(
        workout,
        "_load_mywhoosh_credentials",
        lambda user_id: MyWhooshCredentials(email="u@example.com", password="pw"),
    )
    with patch("mywhoosh.client.MyWhooshClient.login") as mock_login:
        result = workout.test_mywhoosh_login("123")

    mock_login.assert_called_once()
    assert result == {
        "ok": True,
        "status": "verified",
        "message": "MyWhoosh login verified",
    }


def test_mywhoosh_login_check_sanitizes_failures(monkeypatch):
    from recommend_agent.tools import build_and_register_workout as workout

    monkeypatch.setattr(
        workout,
        "_load_mywhoosh_credentials",
        lambda user_id: MyWhooshCredentials(email="u@example.com", password="secret-password"),
    )
    with patch("mywhoosh.client.MyWhooshClient.login", side_effect=RuntimeError("secret-password")):
        result = workout.test_mywhoosh_login("123")

    assert result["ok"] is False
    assert result["status"] == "failed"
    assert "secret-password" not in str(result["message"])


def test_mywhoosh_login_check_reports_decrypt_failure(monkeypatch):
    from recommend_agent.tools import build_and_register_workout as workout

    monkeypatch.setattr(workout, "_load_mywhoosh_credentials", lambda user_id: None)
    monkeypatch.setattr(workout, "_has_saved_mywhoosh_ciphertext", lambda user_id: True)

    result = workout.test_mywhoosh_login("123")

    assert result["ok"] is False
    assert result["status"] == "missing"
    assert "decrypted" in str(result["message"])
