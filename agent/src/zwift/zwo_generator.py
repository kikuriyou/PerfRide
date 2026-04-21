from __future__ import annotations

import hashlib
import xml.etree.ElementTree as ET
from xml.dom import minidom

from zwift.zwo_templates import ZwoInterval


def generate_zwo(
    name: str,
    description: str,
    intervals: list[ZwoInterval],
) -> str:
    root = ET.Element("workout_file")
    ET.SubElement(root, "author").text = "PerfRide"
    ET.SubElement(root, "name").text = name
    ET.SubElement(root, "description").text = description
    ET.SubElement(root, "sportType").text = "bike"

    workout = ET.SubElement(root, "workout")

    for iv in intervals:
        if iv.type == "Warmup":
            el = ET.SubElement(workout, "Warmup")
            el.set("Duration", str(iv.duration_seconds))
            el.set("PowerLow", f"{iv.power_low:.2f}")
            el.set("PowerHigh", f"{iv.power_high:.2f}")
        elif iv.type == "Cooldown":
            el = ET.SubElement(workout, "Cooldown")
            el.set("Duration", str(iv.duration_seconds))
            el.set("PowerLow", f"{iv.power_high:.2f}")
            el.set("PowerHigh", f"{iv.power_low:.2f}")
        elif iv.type == "SteadyState":
            el = ET.SubElement(workout, "SteadyState")
            el.set("Duration", str(iv.duration_seconds))
            el.set("Power", f"{iv.power:.2f}")
        elif iv.type == "IntervalsT":
            el = ET.SubElement(workout, "IntervalsT")
            el.set("Repeat", str(iv.repeat))
            el.set("OnDuration", str(iv.on_duration))
            el.set("OffDuration", str(iv.off_duration))
            el.set("OnPower", f"{iv.on_power:.2f}")
            el.set("OffPower", f"{iv.off_power:.2f}")
        elif iv.type == "FreeRide":
            el = ET.SubElement(workout, "FreeRide")
            el.set("Duration", str(iv.duration_seconds))

    raw = ET.tostring(root, encoding="unicode")
    pretty = minidom.parseString(raw).toprettyxml(indent="    ")
    lines = [line for line in pretty.splitlines() if line.strip()]
    if lines and lines[0].startswith("<?xml"):
        lines = lines[1:]
    return "\n".join(lines) + "\n"


def generate_filename(session_type: str, date_str: str, content: str = "") -> str:
    hash_input = f"{session_type}_{date_str}_{content}"
    suffix = hashlib.md5(hash_input.encode()).hexdigest()[:4]
    return f"PerfRide_{date_str}_{session_type}_{suffix}.zwo"
