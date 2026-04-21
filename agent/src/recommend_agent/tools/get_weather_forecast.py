from __future__ import annotations

import json
import urllib.request
from urllib.error import URLError

_WMO_CONDITION: dict[str, list[range]] = {
    "sunny": [range(0, 4)],
    "cloudy": [range(45, 49)],
    "rainy": [range(51, 68), range(80, 83), range(95, 100)],
    "snowy": [range(71, 78), range(85, 87)],
}

_WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _weather_code_to_condition(code: int) -> str:
    for condition, ranges in _WMO_CONDITION.items():
        for r in ranges:
            if code in r:
                return condition
    return "cloudy"


def _degrees_to_compass(deg: float) -> str:
    idx = round(deg / 45) % 8
    return _WIND_DIRS[idx]


def _condition_label_ja(condition: str) -> str:
    return {"sunny": "晴れ", "cloudy": "曇り", "rainy": "雨", "snowy": "雪"}.get(
        condition, condition
    )


def _ride_recommendation(condition: str, precip_prob: float, wind_speed: float) -> str:
    if precip_prob > 0.6 or wind_speed > 30:
        return "avoid"
    if precip_prob > 0.3 or wind_speed > 20 or condition in ("rainy", "snowy"):
        return "marginal"
    return "good"


def _wind_label_ja(speed: float) -> str:
    if speed < 10:
        return "微風"
    if speed < 20:
        return "やや風あり"
    return "強風"


def get_weather_forecast(latitude: float, longitude: float, date: str) -> dict:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}&longitude={longitude}"
        f"&daily=temperature_2m_max,temperature_2m_min,"
        "precipitation_probability_max,wind_speed_10m_max,"
        "wind_direction_10m_dominant,weather_code"
        f"&timezone=Asia/Tokyo"
        f"&start_date={date}&end_date={date}"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            body = json.loads(resp.read())

        daily = body["daily"]
        weather_code = daily["weather_code"][0]
        temp_high = daily["temperature_2m_max"][0]
        temp_low = daily["temperature_2m_min"][0]
        precip_prob_pct = daily["precipitation_probability_max"][0] or 0
        wind_speed = daily["wind_speed_10m_max"][0] or 0.0
        wind_deg = daily["wind_direction_10m_dominant"][0] or 0.0

        condition = _weather_code_to_condition(weather_code)
        precip_prob = precip_prob_pct / 100.0
        wind_dir = _degrees_to_compass(wind_deg)
        recommendation = _ride_recommendation(condition, precip_prob, wind_speed)

        summary = (
            f"{_condition_label_ja(condition)} "
            f"{temp_high:.0f}/{temp_low:.0f}\u2103 "
            f"{_wind_label_ja(wind_speed)}"
        )

        return {
            "status": "success",
            "data": {
                "date": date,
                "condition": condition,
                "temperature_high_c": temp_high,
                "temperature_low_c": temp_low,
                "precipitation_probability": precip_prob,
                "wind_speed_kmh": wind_speed,
                "wind_direction": wind_dir,
                "ride_recommendation": recommendation,
                "summary": summary,
            },
        }
    except (URLError, KeyError, IndexError, json.JSONDecodeError, TypeError) as e:
        return {
            "status": "error",
            "error_message": f"Failed to fetch weather forecast: {e}",
        }
