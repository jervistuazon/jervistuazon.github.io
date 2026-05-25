---
name: repo-content-update
description: Safely update portfolio content and supporting metadata without changing behavior outside the requested scope.
---

# Repo Content Update

## Use When
- Updating copy, project descriptions, or content structure.
- Refreshing non-runtime documentation and project notes.

## Guardrails
- Only touch requested files.
- Avoid styling/animation logic changes unless requested.
- If task is instruction-file-only, do not modify runtime assets.

## Workflow
1. Identify target files and confirm scope.
2. Apply minimal edits.
3. Re-scan for impacted instruction files (`AGENTS.md`, `SKILL.md`).
4. Summarize changes and confirm no runtime assets were altered.

## Verification
- `git diff --name-only`
- `git status --short`
