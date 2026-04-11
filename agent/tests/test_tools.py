"""Tests for agent tools."""

from recommend_agent.agent import _build_tools, build_agent
from recommend_agent.tools.get_expert_knowledge import (
    CATEGORIES,
    _parse_front_matter,
    get_expert_knowledge,
)
from recommend_agent.tools.get_recent_activities import get_recent_activities
from recommend_agent.tools.search_latest_knowledge import (
    search_latest_knowledge,
    set_search_limit,
)


class TestParseFrontMatter:
    """Tests for _parse_front_matter helper."""

    def test_with_front_matter(self):
        """Should extract sources and strip front matter from body."""
        raw = (
            '---\nsources:\n  - title: "Source A"\n'
            '    url: "https://example.com"\n  - title: "Source B"\n'
            "    url: null\n---\n\n# Content here\n"
        )
        sources, body = _parse_front_matter(raw)
        assert len(sources) == 2
        assert sources[0] == {"title": "Source A", "url": "https://example.com"}
        assert sources[1] == {"title": "Source B", "url": None}
        assert body.strip().startswith("# Content here")
        assert "---" not in body

    def test_without_front_matter(self):
        """Should return empty sources and full content when no front matter."""
        raw = "# Just markdown\n\nSome content."
        sources, body = _parse_front_matter(raw)
        assert sources == []
        assert body == raw


class TestGetExpertKnowledge:
    """Tests for get_expert_knowledge tool."""

    def test_valid_category(self):
        """Should return content with sources for valid category."""
        result = get_expert_knowledge("workout_templates")
        assert result["status"] == "success"
        assert "Active Recovery" in result["content"]
        assert result["category"] == "workout_templates"
        assert "sources" in result
        assert isinstance(result["sources"], list)
        assert len(result["sources"]) > 0

    def test_invalid_category(self):
        """Should return error for unknown category."""
        result = get_expert_knowledge("nonexistent_category")
        assert result["status"] == "error"
        assert "Unknown category" in result["error_message"]

    def test_keyword_filtering(self):
        """Should filter content by keyword."""
        result = get_expert_knowledge("workout_templates", keyword="VO2max")
        assert result["status"] == "success"
        assert "VO2max" in result["content"]

    def test_keyword_no_match_returns_full(self):
        """Should return full content with note when keyword doesn't match."""
        result = get_expert_knowledge("workout_templates", keyword="zzznonexistent")
        assert result["status"] == "partial"
        assert "content" in result
        assert "note" in result

    def test_all_categories_readable(self):
        """All defined categories should have readable files with sources."""
        for cat in CATEGORIES:
            result = get_expert_knowledge(cat)
            assert result["status"] == "success", f"Category '{cat}' failed: {result}"
            assert len(result["content"]) > 0, f"Category '{cat}' is empty"
            assert isinstance(result["sources"], list), f"Category '{cat}' missing sources"

    def test_content_excludes_front_matter(self):
        """Content should not contain YAML front matter delimiters."""
        for cat in CATEGORIES:
            result = get_expert_knowledge(cat)
            assert not result["content"].startswith("---"), (
                f"Category '{cat}' content starts with front matter"
            )


class TestBuildTools:
    """Tests for _build_tools tool selection based on mode and use_personal_data."""

    def test_personal_hybrid_includes_all_tools(self):
        tools = _build_tools("hybrid", use_personal_data=True)
        assert get_recent_activities in tools
        assert get_expert_knowledge in tools
        assert search_latest_knowledge in tools

    def test_no_personal_hybrid_excludes_activities(self):
        tools = _build_tools("hybrid", use_personal_data=False)
        assert get_recent_activities not in tools
        assert get_expert_knowledge in tools
        assert search_latest_knowledge in tools

    def test_no_personal_no_grounding_empty(self):
        tools = _build_tools("no_grounding", use_personal_data=False)
        assert tools == []

    def test_personal_no_grounding_activities_only(self):
        tools = _build_tools("no_grounding", use_personal_data=True)
        assert tools == [get_recent_activities]

    def test_no_personal_web_only(self):
        tools = _build_tools("web_only", use_personal_data=False)
        assert get_recent_activities not in tools
        assert search_latest_knowledge in tools
        assert len(tools) == 1


class TestBuildAgent:
    """Tests for build_agent caching behavior."""

    def test_same_args_return_cached(self):
        a1 = build_agent("hybrid", True)
        a2 = build_agent("hybrid", True)
        assert a1 is a2

    def test_different_args_return_different(self):
        a1 = build_agent("hybrid", True)
        a2 = build_agent("no_grounding", True)
        assert a1 is not a2

    def test_different_personal_data_return_different(self):
        a1 = build_agent("hybrid", True)
        a2 = build_agent("hybrid", False)
        assert a1 is not a2


class TestSetSearchLimit:
    """Tests for set_search_limit."""

    def test_web_only_sets_4(self):
        import recommend_agent.tools.search_latest_knowledge as mod

        set_search_limit("web_only")
        assert mod.MAX_SEARCHES_PER_RECOMMENDATION == 4

    def test_hybrid_sets_2(self):
        import recommend_agent.tools.search_latest_knowledge as mod

        set_search_limit("hybrid")
        assert mod.MAX_SEARCHES_PER_RECOMMENDATION == 2

    def test_no_grounding_sets_2(self):
        import recommend_agent.tools.search_latest_knowledge as mod

        set_search_limit("no_grounding")
        assert mod.MAX_SEARCHES_PER_RECOMMENDATION == 2
