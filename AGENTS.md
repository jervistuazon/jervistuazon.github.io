# Repository Agent Guide

## Scope and working approach

This guide applies throughout the repository. Read any deeper `AGENTS.md` or `AGENTS.override.md` governing the target files. Explicit user instructions take precedence over repository and skill guidance, subject to system/developer instructions and tool permissions.

- Carry requested work through implementation and relevant verification. Resolve routine choices from repository evidence; ask only when missing information materially affects the outcome or authorization.
- Reuse authorization already given. Local editing does not itself authorize a push, merge, or deployment. Prepare a reviewable change before requesting missing publication authority.
- Preserve unrelated edits and untracked files. Do not reset, stash, clean, or stage user work to simplify the task.
- Keep changes focused. Instruction-only work must not modify runtime assets or run generators.
- Follow the session's delegation policy. Small edits do not require subagents; when delegation is authorized, assign independent tasks with distinct file ownership and integrate their results.
- Report outcomes, relevant checks, and limitations concisely. If a skill blocks progress, link its exact file, quote the blocking instruction, and explain its applicability.

## Project map

This is a static portfolio with animated galleries and standalone presentations, using HTML, CSS, JavaScript, and Node build tools.

| Area | Maintained source / responsibility |
| --- | --- |
| Homepage | `index.html`, `styles.css`, `script.js` |
| Gallery content | `gallery-data.js`; preserve custom item fields |
| Project pages | `generate-project-pages.js` generates `projects/`, `sitemap.xml`, and `robots.txt` |
| Presentations | `presentation/<name>/index.html` and supported runtime assets |
| Production artifact | `scripts/build-dist.js`, `scripts/dist-config.js`, `scripts/dist-media.js`, `scripts/verify-dist.js` |
| Publishing | GitHub to Cloudflare Pages; oversized videos to R2; configuration in `DEPLOYMENT.md` |

## Workflow routing

Read [the portfolio update skill](skills/update-portfolio/SKILL.md) completely before editing, validating, publishing, or rolling back the portfolio. It owns the operational workflow, including documentation-only validation. Read `DEPLOYMENT.md` for runtime/build work and publishing details.

Load additional skills only when relevant:

- [Content updates](skills/repo-content-update/SKILL.md): copy, project metadata, and documentation.
- [Performance audit](skills/performance-audit/SKILL.md): load time, media cost, or animation jank investigations.
- [Accessibility audit](skills/accessibility-audit/SKILL.md): semantic, keyboard, contrast, or motion reviews.

Keep repository skills under `skills/<name>/SKILL.md`, reachable through these links. Use scoped frontmatter descriptions and relative links in repository documents. Keep deployment procedures in the update skill instead of duplicating them across skills.

## Runtime invariants

### Gallery and interaction

- Preserve the cinematic, minimalist editorial layout unless a redesign is requested: one column on mobile; desktop featured items span two columns.
- Desktop featured media uses aspect ratio `2.0` and `max-height: 60vh` so the card and metadata fit in the viewport.
- Keep category, title, location, and date on one metadata row with bullet separators (`•`).
- Keep `.card-cta` inside `.card-media-wrapper` as an absolute overlay revealed on hover or active focus; maintain keyboard access and visible focus.
- Append subsequent gallery items without a full reload. Preserve the `index * 35ms` stagger through `requestAnimationFrame`; call `lenis.resize()` after changing gallery height when the Lenis instance exists.
- Edit `gallery-data.js` manually. Avoid `update_gallery.ps1`: its directory scan can erase custom `href`, `label`, and `featured` properties.

### Build and asset synchronization

- Edit source files, then regenerate checked-in minified counterparts in the same change. Do not maintain `script.min.js` or `styles.min.css` independently.
- Changes to `styles.css`, `script.js`, `gallery-data.js`, or files under `presentation/` require `build.js` before commit. `npm.cmd run check:update` invokes it through the production build and satisfies this requirement; a duplicate standalone run is unnecessary.
- Gallery changes or new projects require `generate-project-pages.js`, also included in the production build.
- Standalone `node build.js` defaults to a timestamp. The production build supplies a content-derived `BUILD_VERSION`. Review generated URLs and minified files, then test changed paths from the built site.
- Optimize new raster images through `optimize_images.bat` / `convert_to_webp.js`. Inspect conversion scope and resulting references so unrelated assets and custom gallery fields survive.
- Treat `dist/` as disposable output. Do not hand-edit or manually upload it.

### Presentation publishing contract

- An immediate child of `presentation/` with a regular `index.html` is discovered automatically. Add `.no-publish` inside a draft folder to exclude it.
- Generic presentations ship supported root runtime files and supported files under `assets/`. Authoring/tool subdirectories are excluded; consult `scripts/dist-config.js` for exact extensions and special presentation handling.
- `project.manifest.json` is excluded unless a shipped runtime file references it.
- `presentation/Interactive Web Presentation/` and `presentation/animated_webpage/` remain excluded legacy authoring copies.
- A published route does not create a homepage card; edit `gallery-data.js` when gallery visibility is requested.

## Publication boundaries

An update to `main` automatically deploys through Cloudflare Pages. Never run legacy `deploy.bat`. New oversized video references must wait for a separate media-only update to reach `main`, the R2 sync Action to succeed, and the public media URL to pass verification. Follow the update skill for sequencing, production checks, and rollback.

## Verification scope

- Instruction-only edits: run `git status --short`, `rg --files -g 'AGENTS.md' -g 'SKILL.md'`, and `git diff --check`; review changed instructions and local links. Do not run the portfolio build merely to validate Markdown.
- Runtime/build edits: run `npm.cmd run check:update` and browser checks relevant to the changed route or interaction, as specified in the skill.
- Use meaningful tests for changed behavior. After required checks pass, expand testing only for a new failure, change, or unresolved concern. Report unavailable checks accurately.

## Instruction maintenance references

Reviewed against official documentation on 2026-09-07:

- [GPT-6 Astra prompting guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra): autonomy, instruction clarity, communication, delegation, and proportional verification.
- [AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md): repository and nested instructions.
- [Skill authoring guidance](https://learn.chatgpt.com/docs/build-skills): scoped descriptions and progressive loading.

These references inform agent instructions; they do not change this static site's runtime or select the session model.
