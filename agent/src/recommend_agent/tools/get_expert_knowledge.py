"""Tool to retrieve expert knowledge from local markdown files."""

import re

from recommend_agent.constants import KNOWLEDGE_DIR

# Pre-compiled regex patterns for front matter parsing
_FRONT_MATTER_RE = re.compile(r"\A---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_SOURCE_ENTRY_RE = re.compile(r'-\s*title:\s*"([^"]+)"\s*\n\s*url:\s*("([^"]+)"|null)')

# Available knowledge categories
CATEGORIES = {
    "workout_templates": "Workout structure templates (intervals, Sweet Spot, recovery, etc.)",
    "power_zones": "Coggan power zone definitions and usage",
    "periodization": "Periodization rules, base/build/peak/race phases",
    "fatigue_models": "W'bal, Banister impulse-response model, decay constants",
    "sequencing_examples": "Weekly training schedule examples",
    "dynamic_fitness": "Xert MPA and advanced dynamic fitness models",
}


def _parse_front_matter(raw: str) -> tuple[list[dict], str]:
    """Parse YAML front matter from markdown content.

    Extracts source metadata from ``---`` delimited front matter using regex
    (no pyyaml dependency). Returns (sources_list, body_content).
    """
    match = _FRONT_MATTER_RE.match(raw)
    if not match:
        return [], raw

    front_matter = match.group(1)
    body = raw[match.end() :]

    sources: list[dict] = []
    # Match each source entry: title is required, url is optional
    for m in _SOURCE_ENTRY_RE.finditer(front_matter):
        title = m.group(1)
        url = m.group(3)  # None if "null"
        sources.append({"title": title, "url": url})

    return sources, body


def get_expert_knowledge(category: str, keyword: str | None = None) -> dict:
    """Retrieves expert cycling training knowledge from curated markdown files.

    Use this tool to access training science knowledge including workout templates,
    power zone definitions, periodization rules, fatigue models, and scheduling examples.

    Args:
        category: The knowledge category to retrieve. Available categories:
            - workout_templates: Workout structure templates
            - power_zones: Coggan power zone definitions
            - periodization: Periodization rules and phases
            - fatigue_models: W'bal, Banister model, decay constants
            - sequencing_examples: Weekly schedule examples
            - dynamic_fitness: Xert MPA and advanced models
        keyword: Optional keyword to filter content by section heading (## level).
            If provided, only sections containing the keyword will be returned.

    Returns:
        dict: A dictionary containing 'status' and either 'content' with the
              knowledge text, or 'error_message' on failure.
    """
    if category not in CATEGORIES:
        available = ", ".join(f"'{k}': {v}" for k, v in CATEGORIES.items())
        return {
            "status": "error",
            "error_message": f"Unknown category '{category}'. Available categories: {available}",
        }

    file_path = KNOWLEDGE_DIR / f"{category}.md"

    if not file_path.exists():
        return {
            "status": "error",
            "error_message": (
                f"Knowledge file for '{category}' not found at {file_path}. "
                "Consider using search_latest_knowledge to find this information online."
            ),
        }

    try:
        raw = file_path.read_text(encoding="utf-8")
        sources, content = _parse_front_matter(raw)

        if keyword:
            # Extract sections containing the keyword
            sections = content.split("\n## ")
            matched = [s for s in sections if keyword.lower() in s.lower()]
            if matched:
                content = "\n## ".join(matched)
            else:
                return {
                    "status": "partial",
                    "content": content,
                    "sources": sources,
                    "note": f"No sections matched keyword '{keyword}', returning full content.",
                }

        return {
            "status": "success",
            "category": category,
            "description": CATEGORIES[category],
            "content": content,
            "sources": sources,
        }

    except Exception as e:
        return {
            "status": "error",
            "error_message": f"Failed to read knowledge file: {e}",
        }
