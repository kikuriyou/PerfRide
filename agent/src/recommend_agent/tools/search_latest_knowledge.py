"""Tool to search latest training knowledge via Gemini Search Grounding."""

from datetime import UTC

from google import genai
from google.genai import types

from recommend_agent.constants import KNOWLEDGE_DIR, RECOMMEND_MODE

# Allowed search domains
ALLOWED_DOMAINS = [
    "trainingpeaks.com",
    "mywhoosh.com",
    "forum.intervals.icu",
    "fascatcoaching.com",
    "pubmed.ncbi.nlm.nih.gov",
]

# Search limit per recommendation: web_only gets more searches since it's the sole knowledge source
MAX_SEARCHES_PER_RECOMMENDATION = 4 if RECOMMEND_MODE == "web_only" else 2
_search_count = 0


def set_search_limit(mode: str) -> None:
    global MAX_SEARCHES_PER_RECOMMENDATION
    MAX_SEARCHES_PER_RECOMMENDATION = 4 if mode == "web_only" else 2


def search_latest_knowledge(query: str) -> dict:
    """Searches for latest cycling training knowledge using Google Search.

    Use this tool ONLY when:
    - The markdown knowledge files don't contain relevant information
    - You encounter unusual data patterns that need expert interpretation
    - The rider is returning from a long training break
    - The rider has a specialized goal not covered by existing knowledge

    The search is limited to trusted cycling training domains.
    Results are cached for future use. Max 2 searches per recommendation.

    Args:
        query: The search query in English. Be specific about the training topic.

    Returns:
        dict: A dictionary containing 'status' and either 'result' with search
              findings, or 'error_message' on failure.
    """
    global _search_count

    if _search_count >= MAX_SEARCHES_PER_RECOMMENDATION:
        return {
            "status": "error",
            "error_message": (
                f"Search limit reached ({MAX_SEARCHES_PER_RECOMMENDATION} per recommendation). "
                "Please work with the existing knowledge."
            ),
        }

    _search_count += 1

    try:
        client = genai.Client()

        # Use Google Search grounding with domain restrictions
        domain_filter = " OR ".join(f"site:{d}" for d in ALLOWED_DOMAINS)
        grounded_query = f"{query} ({domain_filter})"

        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=grounded_query,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
            ),
        )

        result_text = response.text if response.text else "No results found."

        # Extract grounding sources from response metadata
        sources = _extract_grounding_sources(response)

        # Cache the result in a knowledge file
        _cache_search_result(query, result_text)

        return {
            "status": "success",
            "query": query,
            "result": result_text,
            "sources": sources,
            "searches_remaining": MAX_SEARCHES_PER_RECOMMENDATION - _search_count,
        }

    except Exception as e:
        _search_count -= 1  # Don't count failed searches
        return {
            "status": "error",
            "error_message": f"Search failed: {e}",
        }


def _extract_grounding_sources(response) -> list[dict]:
    """Extract source URLs from Gemini grounding metadata."""
    sources: list[dict] = []
    try:
        candidate = response.candidates[0]
        grounding_metadata = getattr(candidate, "grounding_metadata", None)
        if not grounding_metadata:
            return sources
        grounding_chunks = getattr(grounding_metadata, "grounding_chunks", None)
        if not grounding_chunks:
            return sources
        for chunk in grounding_chunks:
            web = getattr(chunk, "web", None)
            if web:
                sources.append(
                    {
                        "title": getattr(web, "title", None) or getattr(web, "uri", ""),
                        "url": getattr(web, "uri", None),
                    }
                )
    except (AttributeError, IndexError):
        pass
    return sources


def _cache_search_result(query: str, result: str) -> None:
    """Cache search results to a knowledge markdown file for future reuse."""
    cache_file = KNOWLEDGE_DIR / "search_cache.md"

    try:
        existing = cache_file.read_text(encoding="utf-8") if cache_file.exists() else ""
        from datetime import datetime

        timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")
        entry = f"\n\n## {query}\n\n*Searched: {timestamp}*\n\n{result}\n"
        cache_file.write_text(existing + entry, encoding="utf-8")
    except Exception:
        pass  # Non-critical: caching failure shouldn't block the response


def reset_search_count() -> None:
    """Reset the search counter. Called at the start of each recommendation."""
    global _search_count
    _search_count = 0
