# Cloudflare Pages and R2 deployment

GitHub is the source of truth. Cloudflare Pages builds and deploys the portfolio automatically from GitHub; R2 serves production videos that exceed the Pages asset-size limit.

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
5. Rewrite active videos larger than 25 MiB to the configured R2 origin and omit them from `dist/`.
6. Verify the finished deployment artifact.

The build uses a content-derived cache version, so unchanged sources produce the same `dist/` output. Do not edit or publish `dist/` manually.

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

## Oversized-video publishing

`.github/workflows/sync-r2-media.yml` runs on pushes to `main` that change videos under `assets/` or `presentation/`. It uploads changed source videos above 25 MiB to the `portfolio-media-production` R2 bucket and never deletes old objects.

For a new or replacement oversized video:

1. Give it a new filename/path; do not overwrite an immutable-cached published object in place.
2. Push the video file by itself without adding a gallery or presentation reference.
3. Wait for the GitHub Action named `Sync oversized portfolio media to R2` to pass.
4. Verify the encoded `https://media.jervistuazon.com/...` URL, including a byte-range request.
5. Add the gallery/presentation reference, run the build/tests, and publish the second change.

For an explicit local sync, configure the same R2 environment variables and use `npm run media:sync`. Use `npm run media:sync:dry` to list oversized source media without uploading. Local upload requires the AWS CLI. Never expose R2 credentials in code, logs, commits, or documentation.

The GitHub Actions workflow uses these repository secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

Routine content updates must not modify these secrets, Cloudflare DNS, Pages environment variables, or R2 CORS.

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
