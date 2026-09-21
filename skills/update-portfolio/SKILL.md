---
name: update-portfolio
description: Edit, validate, publish, or roll back this repository's portfolio and presentations using its Cloudflare Pages and R2 workflow. Includes a documentation-only path; not a general Cloudflare administration skill.
---

# Update Portfolio

## Choose the applicable path

Read the root `AGENTS.md` and instructions governing the target files. Commands and code paths below are relative to the repository root; Markdown links resolve from this skill.

| Request | Work to perform |
| --- | --- |
| Instruction/documentation only | Edit requested documents and use documentation checks; skip dependency installation, generators, and deployment unless requested |
| Portfolio content, styling, interaction, presentation, or build change | Read [DEPLOYMENT.md](../../DEPLOYMENT.md), make the change, run production-equivalent checks, and inspect affected browser behavior |
| Publish, push, merge, deploy, or make live | Complete relevant local checks, then use existing publication authority and verify deployment |
| New or replacement oversized runtime media | Use the automatic R2 sync and Pages readiness gate; prepare new preview media before preview validation |
| Rollback | Restore intended prior behavior through a Git revert and normal publication checks |

An edit request authorizes local work and necessary validation. It does not automatically authorize remote publication. Honor publication authority already given; do not ask again. If authority is missing for a required remote action, finish independent preparation before asking. An edit-only task is complete with verified local changes.

## Prepare the workspace

1. Run `git status --short --branch` and inspect changes relevant to the task. Preserve unrelated edits and untracked files.
2. For runtime work on a clean `main`, run `git pull --ff-only origin main`. Do not pull across uncommitted work. Read-only reviews and instruction-only edits do not require a pull.
3. Use an existing task branch/worktree when appropriate. Otherwise prefer a `codex/` branch for implementation; direct `main` publication requires an explicit request. Documentation edits do not require branch creation just to proceed.
4. For runtime builds, use the Node version in `.node-version`. Run `npm.cmd ci` on Windows (`npm ci` elsewhere) if dependencies are missing or the lockfile changed.

If a tool or permission is unavailable, complete unaffected work and report the specific blocked step. A local access problem does not establish that production deployment failed.

## Make the change

- Follow the gallery, media optimization, presentation discovery, and source/minified rules in `AGENTS.md`.
- Change maintained sources. Preserve custom gallery fields and generate landing pages through the build rather than editing generated pages alone.
- Keep runtime changes within scope. For instruction-only tasks, modify only instruction files and leave HTML, CSS, JavaScript, media, and generated output untouched.
- Inspect build side effects before staging: `build.js` also updates cinematic URLs and injects the Forestville mobile landscape patch. Preserve overlapping user work and isolate task-owned changes.
- Do not hand-edit `dist/`, run legacy `deploy.bat`, or substitute a manual artifact upload for the GitHub deployment workflow.
- Routine content updates do not include changing DNS, Pages environment variables, R2 CORS, or GitHub Actions secrets.

## Validate according to the change

### Documentation and instruction files only

Run from the repository root:

```powershell
git status --short
rg --files -g 'AGENTS.md' -g 'SKILL.md'
git diff --check
git diff -- AGENTS.md skills/
```

Adjust diff paths to the documents edited. Verify local links, skill frontmatter names/descriptions, and workflow accuracy against checked-in scripts. Compare final and initial status to distinguish your changes from user work. Do not run a site build for this path: it rewrites source/generated files.

### Runtime, content, assets, or build logic

Run:

```powershell
npm.cmd run check:update
git diff --check
```

Use `npm` instead of `npm.cmd` outside Windows. `check:update` sets the production R2 origin for child processes and runs `build:cloudflare` plus `test:cloudflare`. This includes SEO generation, `build.js` cache busting/minification, clean artifact assembly, the Forestville dist fix, and artifact verification. Do not repeat generators separately after a successful full check without a reason.

Review `git diff` for expected generated pages, versioned URLs, and minified counterparts. Confirm the artifact excludes oversized active media and references the R2 origin. Serve `dist/` over local HTTP and inspect the changed route in a real browser:

- Layout: relevant desktop/mobile widths, media sizing, metadata, and CTA focus/hover states.
- Gallery: filtering, appended items, staggered loading, scroll bounds, and linked project pages.
- Presentations: direct routes, asset requests, navigation, and affected touch/orientation controls.
- Media: loading, playback, and seeking.

Check console/network errors for the affected flow. Report unavailable browser verification. Add regression tests for meaningful behavioral failures; avoid tests that restate implementation or repeated broad audits after checks pass.

## Oversized runtime media: automatic sync and readiness

Supported published runtime media above 25 MiB is externalized during the build. This includes 3D models and binary assets as well as videos. The uploader uses the shared inventory, correct content types, and immutable content-hashed keys for nonvideo files; existing video URLs remain compatible. Continue to give replacement videos a new path because their existing keys use immutable caching.

1. Keep local paths in presentation/gallery source. Run `npm.cmd run media:sync:dry` to inspect which files and keys will upload, and `npm.cmd run check:update` for local validation.
2. With existing publication authority, use the normal branch/merge workflow. A relevant push to `main` triggers the R2 reconciliation Action automatically, including when the upload scripts change. Media and references may be in the same update.
3. The Pages build waits for its expected R2 objects to pass public URL checks before deploying. If the Action or readiness gate fails, diagnose and fix the cause; do not bypass the gate or claim a successful deployment.
4. New large media on a preview branch needs an authorized dispatch of the R2 sync workflow for that trusted branch before preview verification. Do not expose secrets to untrusted pull requests. Verify the resulting public media URL and then retry the preview if it failed while media was absent. Preview origins must also be permitted by R2 CORS; do not bypass a preview readiness failure or change bucket policy without the required authority.
5. Verify the live route and model loading or video playback/seeking after the corresponding deployment succeeds.

For an edit-only task, finish the code and local checks and report pending publication. Local network-free checks do not prove that R2 contains the objects. Use `media:verify` with the production media origin for credential-free live checks. Use local `media:sync` only when that upload is explicitly requested, following [DEPLOYMENT.md](../../DEPLOYMENT.md).

The automation does not bypass GitHub's own file-size limits. If GitHub rejects a source file, prepare a concrete alternative within scope; do not introduce Git LFS or expose credentials ad hoc. The Action retains old objects for rollback. Do not modify DNS, secrets, or R2 CORS for routine publishing.

## Publish and verify

When publication is authorized:

1. Review the exact diff and stage task-related files only. Prefer small, isolated commits.
2. Commit and push the task branch. For behavior/layout changes, verify its Cloudflare Preview before merging. Use direct `main` only when explicitly requested.
3. Merge or push the validated change to `main`; Cloudflare Pages deploys automatically. Do not manually upload `dist/`.
4. Wait for production deployment corresponding to the published commit. A successful Git push is not deployment evidence.
5. Check the changed route on `https://www.jervistuazon.com`, relevant desktop/mobile behavior, and console/network errors. Check gallery/project pages, presentation controls, or media playback/seeking when affected. Verify apex path/query redirects when routing changed.

If checks or deployment fail, diagnose the actual failure and continue with an in-scope correction. Do not repeatedly push unchanged commits or mutate infrastructure to bypass a failure. Report unresolved blockers with the last verified state.

## Roll back

Revert the offending commit while preserving unrelated work, validate the resulting site, and publish using the same authority and workflow. Restore previous media references when appropriate; retained R2 objects support this. Do not force-reset shared history, disable Pages, delete R2 objects, or change nameservers for a routine rollback.

## Completion

State what changed and which checks passed or could not run. Include branch/commit and Preview, Production, or R2 results only when those steps occurred. For publication, identify the verified live route and unresolved issues. Local validation does not prove live deployment success.

Instruction design follows the [official GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra) and [skill authoring guidance](https://learn.chatgpt.com/docs/build-skills), reviewed 2026-09-07. The checked-in scripts and `DEPLOYMENT.md` supply project mechanics.
