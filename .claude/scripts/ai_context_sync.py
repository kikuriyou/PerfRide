#!/usr/bin/env python3
"""Shared AI context sync helpers for generated entry files."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import difflib
import re
from typing import Any

MANUAL_BEGIN = "<!-- BEGIN MANUAL -->"
MANUAL_END = "<!-- END MANUAL -->"


class RegistryError(ValueError):
    """Raised when the AI context registry is invalid."""


@dataclass(frozen=True)
class SourceSpec:
    """A canonical source file used to generate entrypoints."""

    key: str
    path: str
    description: str


@dataclass(frozen=True)
class OutputSpec:
    """A generated output file definition."""

    key: str
    path: str
    kind: str
    title: str
    body: str
    references: tuple[str, ...]
    inline_references: bool = False


@dataclass(frozen=True)
class Registry:
    """Loaded registry and derived metadata."""

    root: Path
    summary_rules: dict[str, str]
    sources: dict[str, SourceSpec]
    outputs: dict[str, OutputSpec]

    @property
    def write_command(self) -> str:
        """Return the configured regeneration command."""
        return self.summary_rules.get(
            "write_command",
            "uv run --no-project python3 .claude/scripts/sync_ai_context.py --write",
        )

    @property
    def check_command(self) -> str:
        """Return the configured drift-check command."""
        return self.summary_rules.get(
            "check_command",
            "uv run --no-project python3 .claude/scripts/sync_ai_context.py --check",
        )


def load_registry(project_root: Path) -> Registry:
    """Load the AI context registry from the repository."""
    registry_path = project_root / ".claude" / "context" / "registry.yml"
    data = parse_simple_yaml(registry_path.read_text(encoding="utf-8"))

    sources_raw = expect_mapping(data.get("sources"), "sources")
    outputs_raw = expect_mapping(data.get("outputs"), "outputs")
    summary_rules_raw = data.get("summary_rules", {})
    if not isinstance(summary_rules_raw, dict):
        raise RegistryError("summary_rules must be a mapping")

    sources: dict[str, SourceSpec] = {}
    for key, raw in sources_raw.items():
        item = expect_mapping(raw, f"sources.{key}")
        path = expect_string(item, "path", f"sources.{key}")
        description = expect_string(item, "description", f"sources.{key}")
        ensure_relative_path(path, f"sources.{key}.path")
        sources[key] = SourceSpec(key=key, path=path, description=description)

    outputs: dict[str, OutputSpec] = {}
    for key, raw in outputs_raw.items():
        item = expect_mapping(raw, f"outputs.{key}")
        path = expect_string(item, "path", f"outputs.{key}")
        kind = expect_string(item, "kind", f"outputs.{key}")
        title = expect_string(item, "title", f"outputs.{key}")
        body = expect_string(item, "body", f"outputs.{key}")
        references = expect_string_list(item.get("references", []), f"outputs.{key}.references")
        inline_refs = item.get("inline_references", False)
        if not isinstance(inline_refs, bool):
            raise RegistryError(f"outputs.{key}.inline_references must be a boolean")
        ensure_relative_path(path, f"outputs.{key}.path")
        outputs[key] = OutputSpec(
            key=key,
            path=path,
            kind=kind,
            title=title,
            body=body,
            references=tuple(references),
            inline_references=inline_refs,
        )

    validate_registry(project_root, sources, outputs)
    summary_rules = {str(key): str(value) for key, value in summary_rules_raw.items()}
    return Registry(
        root=project_root,
        summary_rules=summary_rules,
        sources=sources,
        outputs=outputs,
    )


def parse_simple_yaml(text: str) -> dict[str, Any]:
    """Parse a small YAML subset used by the registry file."""
    lines = []
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        indent = len(raw_line) - len(raw_line.lstrip(" "))
        lines.append((indent, stripped))

    root: dict[str, Any] = {}
    stack: list[tuple[int, Any]] = [(-1, root)]
    index = 0
    while index < len(lines):
        indent, content = lines[index]
        while indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]

        if content.startswith("- "):
            if not isinstance(parent, list):
                raise RegistryError(f"List item without list parent: {content}")
            parent.append(parse_scalar(content[2:].strip()))
            index += 1
            continue

        key, separator, raw_value = content.partition(":")
        if not separator:
            raise RegistryError(f"Invalid line: {content}")
        key = key.strip()
        raw_value = raw_value.strip()
        if raw_value:
            if not isinstance(parent, dict):
                raise RegistryError(f"Mapping entry without mapping parent: {content}")
            parent[key] = parse_scalar(raw_value)
            index += 1
            continue

        next_item = lines[index + 1] if index + 1 < len(lines) else None
        child: Any = {}
        if next_item and next_item[0] > indent and next_item[1].startswith("- "):
            child = []
        if not isinstance(parent, dict):
            raise RegistryError(f"Nested mapping without mapping parent: {content}")
        parent[key] = child
        stack.append((indent, child))
        index += 1

    return root


def parse_scalar(value: str) -> Any:
    """Parse a scalar value from the constrained YAML subset."""
    if not value:
        return ""
    if value[0] == value[-1] and value[0] in {"'", '"'}:
        return value[1:-1]
    lowered = value.lower()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    return value


def expect_mapping(value: Any, label: str) -> dict[str, Any]:
    """Validate that a value is a mapping."""
    if not isinstance(value, dict):
        raise RegistryError(f"{label} must be a mapping")
    return value


def expect_string(mapping: dict[str, Any], key: str, label: str) -> str:
    """Validate that a mapping key contains a string value."""
    value = mapping.get(key)
    if not isinstance(value, str) or not value:
        raise RegistryError(f"{label}.{key} must be a non-empty string")
    return value


def expect_string_list(value: Any, label: str) -> list[str]:
    """Validate a list of strings."""
    if not isinstance(value, list):
        raise RegistryError(f"{label} must be a list")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item:
            raise RegistryError(f"{label} must only contain non-empty strings")
        result.append(item)
    return result


def ensure_relative_path(path: str, label: str) -> None:
    """Reject absolute paths in registry entries."""
    if Path(path).is_absolute():
        raise RegistryError(f"{label} must be relative: {path}")


def validate_registry(
    project_root: Path,
    sources: dict[str, SourceSpec],
    outputs: dict[str, OutputSpec],
) -> None:
    """Validate registry cross-references and on-disk source files."""
    for source in sources.values():
        if not (project_root / source.path).exists():
            raise RegistryError(f"Missing source file: {source.path}")

    for output in outputs.values():
        if output.body not in sources:
            raise RegistryError(f"{output.key} body source is unknown: {output.body}")
        for ref in output.references:
            if ref not in sources:
                raise RegistryError(f"{output.key} reference source is unknown: {ref}")


def render_output(output: OutputSpec, registry: Registry) -> str:
    """Render one generated file."""
    if output.kind == "claude_entry":
        return render_claude_entry(output, registry)
    if output.kind == "codex_agents":
        return render_codex_agents(output, registry)
    raise RegistryError(f"Unknown output kind: {output.kind}")


def render_claude_entry(output: OutputSpec, registry: Registry) -> str:
    """Render the generated CLAUDE.md entry file."""
    body = read_source_body(registry, output.body)
    references = render_reference_list(output, registry, include_at_prefix=True)
    lines = [
        f"# {output.title}",
        "",
        f"> This file is generated by `{registry.write_command}`.",
        "> Edit `.claude/context/*.md`, `.claude/rules/*.md`, or `.claude/docs/DESIGN.md` instead.",
        "",
        body,
        "",
        "## Shared Context Sources",
        "",
        *references,
        "",
        "## Sync",
        "",
        f"- Regenerate: `{registry.write_command}`",
        f"- Verify drift: `{registry.check_command}`",
    ]
    return "\n".join(lines).rstrip() + "\n"


def render_codex_agents(output: OutputSpec, registry: Registry) -> str:
    """Render the generated Codex AGENTS contract."""
    body = read_source_body(registry, output.body)

    if output.inline_references:
        inlined = render_inline_references(output, registry)
        lines = [
            f"# {output.title}",
            "",
            f"> This file is generated by `{registry.write_command}`.",
            "> Edit `.claude/context/*.md`, `.claude/rules/*.md`, or `.claude/docs/DESIGN.md` instead.",
            "",
            "Codex treats `.claude/` as the shared source of truth for repository context.",
            "",
            body,
            "",
            "---",
            "",
            *inlined,
            "## Sync",
            "",
            f"- Regenerate: `{registry.write_command}`",
            f"- Verify drift: `{registry.check_command}`",
        ]
    else:
        references = render_reference_list(output, registry, include_at_prefix=False)
        lines = [
            f"# {output.title}",
            "",
            f"> This file is generated by `{registry.write_command}`.",
            "> Edit `.claude/context/*.md`, `.claude/rules/*.md`, or `.claude/docs/DESIGN.md` instead.",
            "",
            "Codex treats `.claude/` as the shared source of truth for repository context.",
            "",
            body,
            "",
            "## Shared Context References",
            "",
            *references,
            "",
            "## Sync",
            "",
            f"- Regenerate: `{registry.write_command}`",
            f"- Verify drift: `{registry.check_command}`",
        ]
    return "\n".join(lines).rstrip() + "\n"


def downshift_headings(text: str, levels: int = 1) -> str:
    """Increase markdown heading depth by the given number of levels."""
    prefix = "#" * levels
    return re.sub(r"^(#{1,6})", lambda m: prefix + m.group(1), text, flags=re.MULTILINE)


def render_inline_references(output: OutputSpec, registry: Registry) -> list[str]:
    """Read each referenced source and return its content with downshifted headings."""
    lines: list[str] = []
    for key in output.references:
        source = registry.sources[key]
        content = (registry.root / source.path).read_text(encoding="utf-8").strip()
        lines.append(downshift_headings(content))
        lines.append("")
    return lines


def render_reference_list(
    output: OutputSpec,
    registry: Registry,
    *,
    include_at_prefix: bool,
) -> list[str]:
    """Render source references for an output file."""
    lines: list[str] = []
    for key in output.references:
        source = registry.sources[key]
        path = f"@{source.path}" if include_at_prefix else source.path
        lines.append(f"- `{path}` — {source.description}")
    return lines


def read_source_body(registry: Registry, source_key: str) -> str:
    """Read and normalize a source markdown file."""
    path = registry.root / registry.sources[source_key].path
    return path.read_text(encoding="utf-8").strip()


def compose_output_file(output: OutputSpec, generated_body: str, manual_text: str) -> str:
    """Compose the full output file including generated and manual blocks."""
    generated_begin = f"<!-- BEGIN GENERATED:{output.key} -->"
    generated_end = f"<!-- END GENERATED:{output.key} -->"
    manual_body = manual_text.strip("\n")
    manual_lines = [MANUAL_BEGIN]
    if manual_body:
        manual_lines.extend(["", manual_body])
    manual_lines.extend(["", MANUAL_END])
    parts = [
        generated_begin,
        generated_body.rstrip(),
        generated_end,
        "",
        "\n".join(manual_lines).rstrip(),
        "",
    ]
    return "\n".join(parts)


def extract_manual_text(existing_text: str) -> str:
    """Extract the editable manual block content from an existing file."""
    pattern = re.compile(
        rf"{re.escape(MANUAL_BEGIN)}\n?(.*)\n?{re.escape(MANUAL_END)}",
        re.DOTALL,
    )
    match = pattern.search(existing_text)
    if not match:
        return ""
    return match.group(1).strip("\n")


def render_expected_output(
    registry: Registry,
    output: OutputSpec,
    existing_text: str | None = None,
) -> str:
    """Render an output while preserving any manual block content."""
    manual_text = extract_manual_text(existing_text or "")
    generated_body = render_output(output, registry)
    return compose_output_file(output, generated_body, manual_text)


def diff_output(actual: str, expected: str, path: str) -> str:
    """Return a unified diff for an out-of-sync generated file."""
    diff = difflib.unified_diff(
        actual.splitlines(),
        expected.splitlines(),
        fromfile=f"{path} (actual)",
        tofile=f"{path} (expected)",
        lineterm="",
    )
    return "\n".join(diff)


def classify_path(registry: Registry, relative_path: str) -> tuple[list[str], list[str]]:
    """Return matching source ids and output ids for a repo-relative path."""
    normalized = relative_path.strip().lstrip("./")
    source_hits = [
        key for key, spec in registry.sources.items()
        if spec.path == normalized
    ]
    output_hits = [
        key for key, spec in registry.outputs.items()
        if spec.path == normalized
    ]
    return source_hits, output_hits


def impacted_outputs_for_source(registry: Registry, source_key: str) -> list[OutputSpec]:
    """Find outputs that depend on a given source id."""
    impacted: list[OutputSpec] = []
    for output in registry.outputs.values():
        if output.body == source_key or source_key in output.references:
            impacted.append(output)
    return impacted
