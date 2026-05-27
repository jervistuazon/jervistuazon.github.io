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

## Source/Build File Sync
- When updating a source asset that has a checked-in minified counterpart (for example `styles.css` ↔ `styles.min.css` or `script.js` ↔ `script.min.js`), update the corresponding minified file in the same change whenever needed.
- Before finishing, verify source and minified versions are consistent for the edited behavior so production does not serve stale styling or logic.

## Cache Busting
- When replacing public-facing content while preserving an existing URL, update any relevant cache-busting version query strings or no-cache metadata so returning visitors see the latest content.
- For portfolio gallery links that reuse an existing presentation path, bump the gallery data href version and any related script/data references that control that link.
- After cache-busting changes, verify the rendered link points to the new versioned URL and the reused public path loads the updated content.

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
