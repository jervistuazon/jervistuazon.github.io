---
name: update-portfolio
description: Safely edit, validate, preview, publish, and roll back the jervistuazon.com portfolio through GitHub, Cloudflare Pages, and R2. Use for portfolio content, gallery, styling, JavaScript, project-page, presentation, image, video, deployment, production verification, or rollback tasks in this repository.
---

# Update Portfolio

Use GitHub as the source of truth. Cloudflare Pages deploys `main`; R2 serves oversized videos through `media.jervistuazon.com`. Never publish `dist/` manually and never run legacy `deploy.bat`.

## 1. Establish the update type

- **Normal update:** HTML, CSS, JavaScript, gallery data, project content, images, or videos at or below 25 MiB.
- **Oversized-media update:** Any `.mp4`, `.webm`, `.mov`, `.mkv`, or `.avi` above 25 MiB under `assets/` or `presentation/`.
- **Publish request:** The user explicitly asks to push, deploy, publish, merge, or make the update live.
- **Edit-only request:** Make and validate local changes, but do not push or merge without publication authority.

Read `AGENTS.md` and `DEPLOYMENT.md` before editing. Preserve unrelated working-tree changes.

## 2. Prepare safely

1. Run `git status --short --branch`.
2. On a clean `main`, run `git pull --ff-only origin main`.
3. If the tree is dirty, inspect the changes and do not pull across uncommitted user work.
4. Run `npm.cmd ci` on Windows (`npm ci` elsewhere) when dependencies are missing or `package-lock.json` changed.
5. Create a `codex/` branch for an agent-authored update unless the user explicitly requests a direct `main` push.

## 3. Make the update

- Follow all design, gallery, cache-busting, and source/minified sync rules in `AGENTS.md`.
- Edit `gallery-data.js` manually; never use `update_gallery.ps1` without verifying that custom fields survive.
- Optimize new raster images with the repository image workflow.
- Do not hand-edit `dist/`; it is disposable build output.
- Do not edit Cloudflare DNS, Pages environment variables, R2 CORS, or GitHub Actions secrets for a routine content update.

## 4. Handle oversized video safely

For a new or replacement video above 25 MiB:

1. Use a new filename/path. Do not overwrite a published immutable-cached object in place.
2. Commit and push only the video addition to `main` as the first change. Do not reference it yet.
3. Wait for `Sync oversized portfolio media to R2` to succeed.
4. Verify the encoded public URL under `https://media.jervistuazon.com/` returns the expected video content type and a `206` response for a byte-range request.
5. Only then add or update the gallery/presentation reference in a second change.

The R2 workflow uploads changed oversized source videos and never deletes old objects. Do not manually upload during normal publishing. If GitHub rejects the file size, stop and request an approved alternative; do not introduce Git LFS or expose R2 credentials ad hoc.

## 5. Build and validate

Run the production-equivalent validation from the repository root:

```powershell
npm.cmd run check:update
```

On non-Windows systems, use `npm run check:update`. This helper supplies the production R2 origin to the build and runs both `build:cloudflare` and `test:cloudflare`.

Then:

1. Run `git diff --check` and review `git diff`.
2. Confirm expected generated pages, cache-busted references, minified counterparts, and `dist/` verification output.
3. Test the changed interaction or route locally in a real browser when behavior changed.
4. Confirm no oversized active video remains inside `dist/` and references use the R2 origin.

## 6. Publish and verify

When publication is authorized:

1. Stage only task-related files; do not use blanket staging when unrelated changes exist.
2. Commit intentionally and push the branch.
3. Verify the Cloudflare Preview deployment before merging when the change affects behavior or layout.
4. Merge or push to `main` only after checks pass. A `main` update triggers Cloudflare Pages automatically.
5. Wait for the production deployment to succeed; do not assume a successful Git push means a successful deployment.
6. Check `https://www.jervistuazon.com` for the changed route, mobile/desktop behavior, console errors, and media playback.
7. For media, confirm seeking/range playback through `https://media.jervistuazon.com`.

## 7. Roll back

- Revert the offending Git commit and publish the revert through the same validation path.
- For a media issue, restore the previous gallery/presentation reference; old R2 objects are intentionally retained.
- Do not disable Pages, delete an R2 bucket/object, or change nameservers as a routine rollback.

## Completion report

Report the branch/commit, tests run, Preview and Production deployment results, live URLs checked, R2 sync result when applicable, and rollback posture. Never claim zero regressions without evidence from the relevant checks.
