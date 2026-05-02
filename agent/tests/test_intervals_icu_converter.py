from intervals_icu.converter import intervals_to_intervals_icu_text
from zwift.zwo_templates import ZwoInterval


def test_converter_expands_intervals_without_repeat_headers():
    intervals = [
        ZwoInterval(
            "IntervalsT",
            0,
            repeat=2,
            on_duration=240,
            off_duration=240,
            on_power=1.12,
            off_power=0.50,
            label="VO2max",
        )
    ]

    text = intervals_to_intervals_icu_text(intervals)

    assert "2x" not in text
    assert "- 4m 112% VO2max" in text
    assert text.count("112%") == 2
    assert text.count("50% Rest") == 2


def test_converter_rounds_warmup_and_cooldown_ramps_to_steady_steps():
    intervals = [
        ZwoInterval("Warmup", 600, power_low=0.45, power_high=0.75, label="Warmup"),
        ZwoInterval("Cooldown", 300, power_low=0.65, power_high=0.45, label="Cooldown"),
    ]

    text = intervals_to_intervals_icu_text(intervals)

    assert "- 10m 60% Warmup" in text
    assert "- 5m 55% Cooldown" in text


def test_converter_keeps_second_duration_and_empty_label_clean():
    intervals = [ZwoInterval("SteadyState", 45, power=0.82, label="")]

    assert intervals_to_intervals_icu_text(intervals) == "- 45s 82%"


def test_converter_turns_free_ride_into_low_intensity_step():
    intervals = [ZwoInterval("FreeRide", 120, label="Open")]

    assert intervals_to_intervals_icu_text(intervals) == "- 2m 55% Free ride"

