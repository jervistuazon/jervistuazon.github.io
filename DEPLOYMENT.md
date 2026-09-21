# Cloudflare Pages and R2 deployment

GitHub is the source of truth. Cloudflare Pages builds and deploys the portfolio automatically from GitHub; R2 serves published media, including 3D models, that exceed the Pages asset-size limit.

## Live configuration

```text
Production branch: main
Build command: npm ci && npm run build:cloudflare
Output directory: dist
Framework preset: none
Node version: 22.16.0
PORTFOLIO_MEDIA_ORIGIN: https://media.jervistuazon.com
Canonical site: https://www.jervistuazon.com
Apex redirect: https://jervistuazon.com -> canonical www host
R2 media domain: https://media.jervistuazon.com
```

Preview deployments are enabled for non-production branches and pull requests. The committed `.node-version` pins the Cloudflare and local Node version.

## Build behavior

`npm run build:cloudflare` performs the full production build:

1. Regenerate project landing pages, `sitemap.xml`, and `robots.txt`.
2. Run cache busting and CSS/JavaScript minification.
3. Recreate `dist/` from scratch.
4. Copy only production runtime files.
5. Rewrite supported runtime media larger than 25 MiB to the configured R2 origin and omit it from `dist/`.
6. Verify the finished deployment artifact.
7. On Cloudflare Pages, wait for the expected R2 objects to be publicly readable before allowing deployment. Local builds skip this network gate; use `npm run media:verify` to run it explicitly.

The build uses a content-derived cache version, so unchanged sources produce the same `dist/` output. Do not edit or publish `dist/` manually.

## Adding a web presentation

For a standard exported presentation, add a new immediate child folder such as `presentation/client_web_presentation/` containing:

- `index.html`
- optional root runtime files such as CSS or JavaScript
- optional runtime media and data under `assets/`
- bundled `vendor/` libraries and decoders referenced by shipped runtime files

The Cloudflare build discovers and publishes the folder automatically. Use a `.no-publish` file inside a draft folder to exclude it. Authoring subdirectories and an unreferenced `project.manifest.json` are not shipped. Add or edit `gallery-data.js` only when the presentation should also appear as a portfolio gallery card.

`presentation/site_feasibility/` has a scoped runtime exception: its `_next/` framework assets, `development/` viewer (including the split `.bin` model), and root `.rsc` payload are published. Its `.vite/` build metadata is excluded. Preserve folder-relative asset URLs when replacing this export and run `npm run check:update` before pushing.

## Routine portfolio update

Before editing a clean `main` checkout:

```powershell
git pull --ff-only origin main
npm.cmd ci
```

After editing, run the production-equivalent build and regression test with one command:

```powershell
npm.cmd run check:update
```

The helper sets `PORTFOLIO_MEDIA_ORIGIN=https://media.jervistuazon.com` only for its child build/test processes.

Review `git diff`, commit only the intended files, and push a branch for Preview/PR validation. Merging to `main` triggers the production Pages deployment automatically. Use a direct `main` push only when explicitly requested.

Do not run `deploy.bat`; it is the legacy GitHub Pages publisher.

## Automatic oversized-media publishing

The build and R2 uploader share a media inventory. Supported runtime assets above **25 MiB** (including GLB models, binary buffers, textures, and videos) are served from R2 instead of copied into the Pages upload. Draft presentations marked `.no-publish`, authoring files, build output, and dependencies are excluded. Existing video URLs remain compatible.

New nonvideo objects use a content hash in their filename. Replacing `model.glb` therefore produces a new R2 URL automatically, without stale immutable-cache responses. Keep using ordinary local asset references in source HTML/JavaScript; the build generates the production URLs. Models with external relative dependencies need those dependencies to remain resolvable; use a self-contained GLB when possible.

`.github/workflows/sync-r2-media.yml` runs on relevant pushes to `main`, including changes to the upload/build automation. It reconciles oversized assets with the `portfolio-media-production` bucket, uploads missing objects with the correct content type, and retains old objects. Reconciliation also backfills an existing file missed by an older workflow, such as Orchard's model.

The existing Pages build command now runs a public-media readiness gate. It checks object availability, size, content type, browser access, and range support and waits a bounded time for the concurrent R2 Action. If media is missing or unusable, the build fails instead of publishing broken references. No R2 credentials are needed in Pages: they remain in the existing GitHub Action.

For normal publishing, validate with `npm run check:update` and publish through the authorized branch/merge workflow. Media and references can be included together; separate media-only and reference commits are no longer required. GitHub's own file-size restrictions still apply: this automation solves the Pages 25 MiB asset limit and does not bypass GitHub's limits.

A preview that introduces new large media requires that media to be uploaded first. With publication authority, dispatch the R2 sync workflow for that trusted branch, verify the URLs, then retry its preview build. Do not run privileged upload jobs for untrusted pull requests. Production uploads remain automatic on `main`. A preview also needs its origin allowed by the existing R2 CORS policy; the preview gate checks that origin and reports a missing permission rather than publishing a broken viewer. Production checks the canonical site origin.

Useful commands:

- `npm run media:sync:dry`: inspect the upload inventory and object keys without uploading.
- `npm run media:sync`: explicitly upload/reconcile using local AWS CLI and the R2 environment variables.
- `npm run media:verify`: verify public R2 availability without credentials (set `PORTFOLIO_MEDIA_ORIGIN=https://media.jervistuazon.com`).

The GitHub Actions workflow uses these existing repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Never expose credentials in code, logs, commits, or documentation. Routine publishing does not require changes to these secrets, DNS, Pages environment variables, or R2 CORS.

## Production verification

After a successful `main` deployment, verify:

- The changed route on `https://www.jervistuazon.com`.
- Desktop and mobile behavior.
- Browser console and network errors.
- Gallery filtering and generated project pages when applicable.
- Presentation behavior when applicable.
- Video playback and seeking through `https://media.jervistuazon.com` when applicable.
- Apex redirects preserve paths and query strings.

Do not assume a successful Git push means the Cloudflare build or live deployment succeeded.

## Rollback

Revert the offending Git commit and publish the revert through the same validation path. For a media problem, restore the previous gallery/presentation reference; old R2 objects are intentionally retained.

Do not change nameservers, disable Cloudflare Pages, or delete R2 objects as a routine rollback. GitHub Pages and the original R2 bucket remain temporary migration rollback protection until the monitoring and retirement phase is complete.
