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
| New or replacement oversized video | Use the two-stage R2 sequence before publishing any reference |
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

Review `git diff` for expected generated pages, versioned URLs, and minified counterparts. Confirm the artifact excludes oversized active videos and references the R2 origin. Serve `dist/` over local HTTP and inspect the changed route in a real browser:

- Layout: relevant desktop/mobile widths, media sizing, metadata, and CTA focus/hover states.
- Gallery: filtering, appended items, staggered loading, scroll bounds, and linked project pages.
- Presentations: direct routes, asset requests, navigation, and affected touch/orientation controls.
- Media: loading, playback, and seeking.

Check console/network errors for the affected flow. Report unavailable browser verification. Add regression tests for meaningful behavioral failures; avoid tests that restate implementation or repeated broad audits after checks pass.

## Oversized video: publish media before references

Apply this sequence to `.mp4`, `.webm`, `.mov`, `.mkv`, and `.avi` above 25 MiB under `assets/` or `presentation/`.

1. Give each new/replacement object a new filename or path. Published R2 objects use immutable caching; replacing the same path can leave stale content.
2. With publication authorized, commit only the video addition first. Bring that media-only change to `main` through a branch/merge, or a direct push only if explicitly requested. Do not add its runtime reference yet.
3. Wait for `Sync oversized portfolio media to R2` in `.github/workflows/sync-r2-media.yml` to succeed for that update.
4. Verify the public URL under `https://media.jervistuazon.com/`, encoding each path segment and preserving slashes. Check the expected video content type and a byte-range request returning `206` with a valid `Content-Range`.
5. Only then add the gallery/presentation reference in a second change, validate it, and publish it.

For an edit-only media task, prepare the media addition and report the pending sequence; do not introduce a reference to an unverified object. If sync or URL verification fails, fix the identified cause within scope or report it; keep the reference unpublished.

The Action uploads changed oversized videos and retains old objects. Normal publishing does not require manual R2 uploads. If GitHub rejects the file size, request a concrete alternative after preparing what is possible; do not introduce Git LFS or expose credentials ad hoc. Use local `media:sync` only when that upload is explicitly requested, following `DEPLOYMENT.md`.

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
