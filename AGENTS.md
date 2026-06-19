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
- The repository includes a build script (`node build.js`, which also runs automatically as part of `deploy.bat`) to automate cache-busting and asset minification.
- When making any changes to stylesheets (`styles.css`), scripts (`script.js`), gallery data (`gallery-data.js`), or assets inside `presentation/`, you **MUST** run `node build.js` before committing.
- `build.js` automatically:
  - Updates the version suffix (`?v=timestamp`) on references inside `index.html` (CSS, JS, and gallery-data.js).
  - Updates version suffixes for `interactive_presentation_demo` and `cinematic_web_presentation` links inside `gallery-data.js` and `script.js`.
  - Updates version suffixes inside `presentation/cinematic_web_presentation/index.html` (for `styles.css`, `script.js`, and `.mp4` video files).
  - Minifies `script.js` -> `script.min.js` and `styles.css` -> `styles.min.css`.
- After making cache-busting changes, always run `git diff` to verify the modified files reflect the new versioned URLs, and test the production paths locally to ensure the updated files load correctly.

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
