# Cloudflare Pages build

The Git-integrated Pages project uses this exact build configuration:

```text
Root directory: repository root
Build command: npm ci && npm run build:cloudflare
Output directory: dist
Framework preset: none
Node version: 22.16.0
```

The committed `.node-version` file pins Node.js `22.16.0`. If the dashboard environment requires an explicit variable, set `NODE_VERSION=22.16.0` in both Preview and Production.

The build regenerates the SEO project pages and `sitemap.xml`/`robots.txt`, runs the existing cache-busting/minification build, recreates `dist/` from scratch, copies only the active runtime site and presentation files, adds the production `_headers` file, and runs the dist preflight. `npm run build:dist` and `npm run verify:dist` can be run separately when needed.

The build uses a content-derived cache-busting version, so repeated clean builds produce the same `dist/` contents until a runtime input changes. Running `node build.js` directly keeps the existing timestamp-based version behavior.

## Temporary large-media handling

Cloudflare Pages cannot accept a single asset larger than 25 MiB. The normal/default build leaves the source media inventory intact and reports oversized active videos as warnings. For Pages Preview and Production builds, set:

```text
PORTFOLIO_MEDIA_ORIGIN=https://www.jervistuazon.com
```

When that variable is set, the build rewrites only the active oversized video references inside `dist/` to encoded absolute URLs on that origin and omits those oversized files from `dist/`. Checked-in source URLs are not rewritten. The small mobile scrub video remains in Pages.

This origin is temporary because `media.jervistuazon.com` is not yet live. Once the R2 custom domain is onboarded, change the same Preview and Production variable in one step to:

```text
PORTFOLIO_MEDIA_ORIGIN=https://media.jervistuazon.com
```

Do not add a `_redirects` file unless a concrete route requires one. Do not add aggressive cache overrides for the unhashed HTML/CSS/JS; Pages supplies its normal asset caching behavior. The committed `_headers` file contains only baseline security headers.

Git integration settings for this staging project are: production branch `main`, automatic preview deployments enabled for non-production branches and pull requests, and no custom domain attached during staging. This phase does not merge the branch, change DNS, disable GitHub Pages, publish R2, or attach `jervistuazon.com`.
