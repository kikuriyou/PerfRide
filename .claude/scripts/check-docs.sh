#!/bin/sh
#
# check-docs.sh -- Validate documentation integrity.
# Exits 0 if all checks pass, 1 if any file is missing.
#

errors=0

error() {
  printf "ERROR: %s\n" "$1" >&2
  errors=$((errors + 1))
}

# ── 1. Required top-level files ──────────────────────────────────────

for f in docs/index.md ARCHITECTURE.md CLAUDE.md; do
  if [ ! -f "$f" ]; then
    error "Required file missing: $f"
  fi
done

# ── 2. Relative markdown links in docs/index.md ─────────────────────

if [ -f docs/index.md ]; then
  # Extract relative links: [text](relative/path.md)
  # Use grep -o to find all link targets, not just the last per line
  # Skip absolute URLs (http://, https://) and anchors (#)
  links=$(grep -o '\]([^)]*)' docs/index.md \
    | sed 's/\](//; s/)$//' \
    | grep -v '^https\{0,1\}://' \
    | grep -v '^#' \
    || true)

  for link in $links; do
    # Strip any anchor fragment
    target=$(printf '%s' "$link" | sed 's/#.*//')
    [ -z "$target" ] && continue

    # Resolve relative to docs/
    resolved="docs/$target"

    # Handle ../ prefix (one level up from docs/)
    case "$target" in
      ../*)
        resolved=$(printf '%s' "$target" | sed 's|^\.\./||')
        ;;
    esac

    if [ ! -f "$resolved" ] && [ ! -d "$resolved" ]; then
      error "docs/index.md links to '$link' but '$resolved' does not exist"
    fi
  done
fi

# ── 3. @ references in CLAUDE.md ────────────────────────────────────

if [ -f CLAUDE.md ]; then
  # Extract @-prefixed references (e.g. @README.md, @.claude/rules/)
  # Use grep -o to find all occurrences, not just the last per line
  refs=$(grep -o '@[A-Za-z0-9._][A-Za-z0-9._/\-]*' CLAUDE.md \
    | sed 's/^@//' \
    || true)

  for ref in $refs; do
    if [ ! -f "$ref" ] && [ ! -d "$ref" ]; then
      error "CLAUDE.md references '@$ref' but '$ref' does not exist"
    fi
  done
fi

# ── 4. Image references in README.md ────────────────────────────────

if [ -f README.md ]; then
  # Extract image paths: ![alt](path)
  # Use grep -o to find all image references per line
  images=$(grep -o '!\[[^]]*\]([^)]*)' README.md \
    | sed 's/!\[[^]]*\](//; s/)$//' \
    | grep -v '^https\{0,1\}://' \
    || true)

  for img in $images; do
    if [ ! -f "$img" ]; then
      error "README.md references image '$img' but it does not exist"
    fi
  done
fi

# ── 5. web/src/ path references in documentation ──────────────────────────

for md_file in README.md ARCHITECTURE.md $(find docs/ -name '*.md' 2>/dev/null); do
  [ -f "$md_file" ] || continue
  refs=$(grep -oE 'web/src/[A-Za-z0-9_./-]+\.(ts|tsx|js|jsx|py|css)' "$md_file" \
    | sort -u || true)
  for ref in $refs; do
    if [ ! -f "$ref" ]; then
      error "$md_file references '$ref' but file does not exist"
    fi
  done
done

# ── 6. Source dependency staleness check (warning only) ───────────────

if [ -f docs/.doc-deps.yml ] && command -v git >/dev/null 2>&1; then
  # Get files changed vs base branch (works in CI and locally)
  base_branch="${GITHUB_BASE_REF:-main}"
  changed_files=$(git diff --name-only "$base_branch"...HEAD 2>/dev/null || true)

  if [ -n "$changed_files" ]; then
    # Parse YAML (simple line-based, no external deps)
    current_doc=""
    while IFS= read -r line; do
      case "$line" in
        \#*|"") continue ;;
        *:)
          current_doc=$(echo "$line" | sed 's/:$//')
          ;;
        *"- "*)
          dep=$(echo "$line" | sed 's/.*- //')
          # Check if any changed file matches this dependency (prefix match for dirs)
          for cf in $changed_files; do
            case "$cf" in
              "$dep"|"$dep"/*)
                # Source changed — check if doc also changed
                if ! echo "$changed_files" | grep -q "^${current_doc}$"; then
                  printf "WARNING: %s may need updating (%s changed)\n" "$current_doc" "$cf" >&2
                fi
                ;;
            esac
          done
          ;;
      esac
    done < docs/.doc-deps.yml
  fi
fi

# ── 7. Generated AI context drift check ───────────────────────────────

if [ -f .claude/scripts/sync_ai_context.py ]; then
  if ! uv run --no-project python3 .claude/scripts/sync_ai_context.py --check >/dev/null; then
    error "Generated AI context files are out of sync (run: uv run --no-project python3 .claude/scripts/sync_ai_context.py --write)"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────

if [ "$errors" -gt 0 ]; then
  printf "\nDoc check failed: %d error(s) found.\n" "$errors" >&2
  exit 1
fi

printf "Doc check passed: all references valid.\n"
exit 0
