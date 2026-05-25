# Repository Agent Guide

## Scope
This file applies to the entire repository unless a deeper `AGENTS.md` overrides it.

## Safety Rule
- Non-feature maintenance tasks that add or update only `AGENTS.md` and `SKILL.md` files must not change runtime portfolio behavior.
- Do not modify HTML/CSS/JS/video assets for instruction-only tasks unless explicitly requested.

## Repo Conventions
- Prefer small, isolated commits.
- Keep task-focused documentation updates in place; avoid broad rewrites.
- Use relative file paths when referencing files in notes.

## Validation
For instruction-file-only changes, run at least:
- `git status --short`
- `rg --files -g 'AGENTS.md' -g 'SKILL.md'`

## Skill Layout Recommendation
- Place reusable skills under `skills/<skill-name>/SKILL.md`.
- Keep each skill narrowly scoped with:
  - frontmatter (`name`, `description`),
  - when-to-use guidance,
  - step-by-step workflow,
  - verification checklist,
  - known pitfalls.
