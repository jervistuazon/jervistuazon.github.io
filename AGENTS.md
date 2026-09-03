# Repository Agent Guide

## Scope
This file applies to the entire repository unless a deeper `AGENTS.md` overrides it.

## Mandatory Portfolio Update Workflow
- For any task that edits, validates, publishes, or rolls back the portfolio, read `skills/update-portfolio/SKILL.md` completely before taking action.
- Treat `skills/update-portfolio/SKILL.md` as the source of truth for Cloudflare Pages publishing, R2 video synchronization, production verification, and rollback.
- Do not run `deploy.bat`; it is the legacy GitHub Pages publisher and is not the production Cloudflare workflow.
- A push or merge to `main` automatically deploys the site through Cloudflare Pages. Do not upload `dist/` manually.
- Oversized videos are synchronized to R2 by `.github/workflows/sync-r2-media.yml`. Never add a new oversized-video reference until its media-only push has completed successfully and the R2 URL has been verified.

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
- The repository includes a build script (`node build.js`, which also runs automatically through `npm run build:cloudflare`) to automate cache-busting and asset minification.
- When making any changes to stylesheets (`styles.css`), scripts (`script.js`), gallery data (`gallery-data.js`), or assets inside `presentation/`, you **MUST** run `node build.js` before committing.
- `build.js` automatically:
  - Updates the version suffix (`?v=timestamp`) on references inside `index.html` (CSS, JS, and gallery-data.js).
  - Updates version suffixes for `interactive_presentation_demo` and `cinematic_web_presentation` links inside `gallery-data.js` and `script.js`.
  - Updates version suffixes inside `presentation/cinematic_web_presentation/index.html` (for `styles.css`, `script.js`, and `.mp4` video files).
  - Minifies `script.js` -> `script.min.js` and `styles.css` -> `styles.min.css`.
- After making cache-busting changes, always run `git diff` to verify the modified files reflect the new versioned URLs, and test the production paths locally to ensure the updated files load correctly.

## Automatic Presentation Publishing
- A new immediate child folder under `presentation/` is published automatically when it contains a regular `index.html` file.
- The generic runtime contract includes supported files at the presentation root plus supported assets under an `assets/` directory. Authoring/tool subdirectories are not copied.
- `project.manifest.json` is excluded unless a shipped runtime file explicitly references it.
- Add a `.no-publish` marker inside a presentation folder to keep a draft out of `dist/`.
- `presentation/Interactive Web Presentation/` and `presentation/animated_webpage/` remain excluded legacy authoring copies.
- Adding a presentation route does not create a homepage card. Update `gallery-data.js` separately when gallery visibility is required.

## Gallery & Layout Design Standards
- **Cinematic & Minimalist Aesthetic**: Maintain the editorial layout. The gallery is structured with a single-column layout on mobile, while on desktop featured items (`data-featured="true"`) occupy 2 columns (`grid-column: span 2`).
- **Viewport Constraints**: Featured images must have an aspect ratio of `2.0` on desktop and a `max-height: 60vh` limit so that the image, label, and metadata fit completely in a single viewport page without scrolling (configured in [styles.css](file:///d:/Github%20Repo/jervistuazon.github.io/styles.css)).
- **One-Row Metadata**: Project metadata (category, title, location, date) should be aligned on a single row below the image card, separated by a bullet character `•` (e.g. `.item-info > *:not(:last-child)::after { content: "•"; ... }`).
- **Interactive CTAs**: Interactive action text (e.g. "Explore Project", "Explore Presentation") must be styled as a `.card-cta` absolutely positioned overlay inside `.card-media-wrapper`. They should only become visible upon hover (desktop) or active focus (mobile).

## Smooth Staggered Loading & Scroll Integration
- **Dynamic Loading**: Subsequent projects should load dynamically without full page reloads, using JavaScript to append new items to the gallery grid (managed in [script.js](file:///d:/Github%20Repo/jervistuazon.github.io/script.js) via `filterGallery`).
- **Staggered Animation**: Newly added gallery items must fade in with a staggered transition delay (`index * 35ms`) using `requestAnimationFrame` for a smooth transition.
- **Scroll Syncing**: Always invoke `lenis.resize()` after dynamically loading gallery items so that the Lenis smooth scroll instance recalculates the container's height and bounds.

## Asset Optimization & Gallery Data Cautions
- **Image Conversion (WebP)**: All new image assets must be optimized for performance. Run [optimize_images.bat](file:///d:/Github%20Repo/jervistuazon.github.io/optimize_images.bat) (which runs [convert_to_webp.js](file:///d:/Github%20Repo/jervistuazon.github.io/convert_to_webp.js) using Sharp) to automatically convert PNG/JPG/JPEG files inside `assets/` and update references in source files.
- **Gallery Data Warning**: Avoid running the automated script [update_gallery.ps1](file:///d:/Github%20Repo/jervistuazon.github.io/update_gallery.ps1) to update [gallery-data.js](file:///d:/Github%20Repo/jervistuazon.github.io/gallery-data.js) as it is a directory scanner that does not support complex configurations and will erase custom properties (such as custom `href`, `label`, or `featured` objects used for interactive presentations and videos). Always edit [gallery-data.js](file:///d:/Github%20Repo/jervistuazon.github.io/gallery-data.js) manually or verify custom fields are preserved.
- **SEO Landing Pages**: After making updates to [gallery-data.js](file:///d:/Github%20Repo/jervistuazon.github.io/gallery-data.js) or adding new projects, run `node generate-project-pages.js` (which is also automated by `npm run build:cloudflare`) to generate/update the static landing pages under `projects/`.

## Validation
For instruction-file-only changes, run at least:
- `git status --short` (if git is available in the environment)
- `rg --files -g 'AGENTS.md' -g 'SKILL.md'` (or equivalent powershell commands if rg is unavailable)

## Skill Layout Recommendation
- Place reusable skills under `skills/<skill-name>/SKILL.md`.
- Keep each skill narrowly scoped with:
  - frontmatter (`name`, `description`),
  - when-to-use guidance,
  - step-by-step workflow,
  - verification checklist,
  - known pitfalls.
