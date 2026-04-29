"""PerfRide Training Recommendation Agent - ADK Agent Definition."""

from pathlib import Path

from google.adk.agents import Agent

from recommend_agent.constants import RECOMMEND_MODE, USE_PERSONAL_DATA
from recommend_agent.tools.get_expert_knowledge import get_expert_knowledge
from recommend_agent.tools.get_recent_activities import get_recent_activities
from recommend_agent.tools.search_latest_knowledge import search_latest_knowledge

_PROMPT_DIR = Path(__file__).parent / "prompts"
_SYSTEM_PROMPT = (_PROMPT_DIR / "system_prompt.md").read_text(encoding="utf-8")
_GENERIC_PROMPT = (_PROMPT_DIR / "system_prompt_generic.md").read_text(encoding="utf-8")
_INSIGHT_PROMPT = (_PROMPT_DIR / "insight_prompt.md").read_text(encoding="utf-8")
_WEBHOOK_PROMPT = (_PROMPT_DIR / "webhook_prompt.md").read_text(encoding="utf-8")
_WEEKLY_PROMPT = (_PROMPT_DIR / "weekly_plan_prompt.md").read_text(encoding="utf-8")
_COACH_DAILY_PROMPT = """
# Coach Daily Mode

今日の提案では、まず今週のトレーニングプランを尊重してください。
- `get_training_plan` で training plan を参照する
- ユーザーメッセージに今日の planned session が含まれる場合はそれを最優先の基準にする
- training plan がない場合のみ pending draft の文脈を参考にし、
  それも無ければ通常の suggest と同様に提案する
- この trigger では plan を書き換えず、今日の提案だけを返す

## `based_on` の表記ルール（厳守）
**禁止語**: 「承認済み」「approved」「承認された」「承認」を `based_on` / `summary` /
`why_now` / `detail` のいずれにも書いてはならない。
ユーザーメッセージに `source: approved` 等が含まれていても、それを日本語に訳して
出力に含めてはならない。`source` は内部メタデータであり、文章化の対象ではない。

- training plan を参照した場合は単に「トレーニングプラン（<phase>フェーズ）」と表記する
  (例: "トレーニングプラン（Build 1フェーズ）")
- 末尾は体言止めにせず、必ず「…を踏まえた提案です」で結ぶ
- フル例:
  "トレーニングプラン（Build 1フェーズ）と直近のフィットネス指標（CTL 35, TSB 0）を踏まえた提案です"
"""

# Cache agents by (mode, use_personal_data) to avoid rebuilding per request
_agent_cache: dict[tuple[str, bool, str], Agent] = {}


def _build_tools(mode: str, use_personal_data: bool, trigger: str = "dashboard") -> list:
    tools: list = []

    if use_personal_data:
        tools.append(get_recent_activities)

    if mode == "web_only":
        tools.append(search_latest_knowledge)
    elif mode == "no_grounding":
        pass
    else:
        tools.extend([get_expert_knowledge, search_latest_knowledge])

    if trigger in {"webhook", "coach_daily", "weekly"}:
        from recommend_agent.tools.get_current_fitness import get_current_fitness
        from recommend_agent.tools.get_training_plan import get_training_plan
        from recommend_agent.tools.get_user_profile import get_user_profile

        tools.extend(
            [
                get_current_fitness,
                get_training_plan,
                get_user_profile,
            ]
        )

    if trigger == "webhook":
        from recommend_agent.tools.build_and_register_workout import (
            build_and_register_workout,
        )
        from recommend_agent.tools.explore_outdoor_routes import explore_outdoor_routes
        from recommend_agent.tools.get_weather_forecast import get_weather_forecast
        from recommend_agent.tools.send_notification import send_notification
        from recommend_agent.tools.update_training_plan import update_training_plan

        tools.extend(
            [
                get_weather_forecast,
                explore_outdoor_routes,
                build_and_register_workout,
                update_training_plan,
                send_notification,
            ]
        )

    return tools


def _build_instruction(mode: str, use_personal_data: bool) -> str:
    prompt = _SYSTEM_PROMPT if use_personal_data else _GENERIC_PROMPT

    _old_rules = (
        "3. Call `get_expert_knowledge` to reference "
        "specific workout templates or training science\n"
        "4. Only call `search_latest_knowledge` when "
        "the knowledge files don't cover the situation"
    )

    if mode == "web_only":
        prompt = prompt.replace(
            _old_rules,
            "3. Call `search_latest_knowledge` to retrieve "
            "training knowledge for the recommendation",
        )
        prompt = prompt.replace(
            "12. `get_expert_knowledge` や `search_latest_knowledge` "
            "で取得した情報を使った場合、ツールが返す `sources` を"
            "JSON出力の `references` フィールドに含めること",
            "12. `search_latest_knowledge` で取得した情報を使った場合、"
            "ツールが返す `sources` をJSON出力の `references` フィールドに含めること",
        )
    elif mode == "no_grounding":
        prompt = prompt.replace(
            _old_rules,
            "3. あなたの知識に基づいてトレーニングを推薦すること",
        )
        prompt = prompt.replace(
            "12. `get_expert_knowledge` や `search_latest_knowledge` "
            "で取得した情報を使った場合、ツールが返す `sources` を"
            "JSON出力の `references` フィールドに含めること\n"
            "13. 実際に参照した情報源のみを含め、参照を捏造しないこと\n",
            "",
        )
        prompt = prompt.replace(
            "- `references`: 参照した情報源の配列（省略可）。各要素:\n"
            "  - `title`: ソース名・文献引用（string）\n"
            "  - `url`: URL（string or null）",
            "",
        )
        prompt = prompt.replace(
            ',\n  "references": [\n'
            '    {"title": "Training and Racing with a Power Meter'
            ' - Coggan & Allen", "url": null},\n'
            '    {"title": "TrainerRoad Blog", '
            '"url": "https://www.trainerroad.com/blog"}\n'
            "  ]",
            "",
        )

    return prompt


def build_agent(mode: str, use_personal_data: bool, trigger: str = "dashboard") -> Agent:
    key = (mode, use_personal_data, trigger)
    if key in _agent_cache:
        return _agent_cache[key]

    instruction = _build_instruction(mode, use_personal_data)
    if trigger == "webhook":
        instruction = instruction + "\n\n" + _WEBHOOK_PROMPT
    elif trigger == "weekly":
        instruction = instruction + "\n\n" + _WEEKLY_PROMPT
    elif trigger == "coach_daily":
        instruction = instruction + "\n\n" + _COACH_DAILY_PROMPT

    agent = Agent(
        name="recommend_training_agent",
        model="gemini-3-flash-preview",
        description=(
            "Cycling training recommendation agent that suggests "
            "today's workout based on recent activity data and training goals."
        ),
        instruction=instruction,
        tools=_build_tools(mode, use_personal_data, trigger),
    )
    _agent_cache[key] = agent
    return agent


_insight_agent: Agent | None = None


def build_insight_agent() -> Agent:
    global _insight_agent
    if _insight_agent is not None:
        return _insight_agent

    _insight_agent = Agent(
        name="insight_agent",
        model="gemini-3-flash-preview",
        description="Generates user-facing insight text from detected training signals.",
        instruction=_INSIGHT_PROMPT,
        tools=[],
    )
    return _insight_agent


root_agent = build_agent(RECOMMEND_MODE, USE_PERSONAL_DATA)
