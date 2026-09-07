# Site feasibility UI theme

This directory is a standalone static export. The graphite theme changes its presentation UI only; it does not change the portfolio homepage, another presentation, map data, calculations, JavaScript, model geometry, materials, or the development viewer.

## Theme entry

`_next/static/css/index.IyWDyIsE.css` is the stylesheet already referenced by the HTML and generated client. It now imports, in order:

1. `index.IyWDyIsE.base.css`: the original export, preserved byte-for-byte (Git blob `d456371c88b08b37db2c8ddd5c15d197ec3233b2`). It stays in the same directory so relative asset URLs retain their meaning.
2. `../../../site-theme.css`: the maintained, readable UI overrides.

Keep both imports at the start of the entry file. Do not wrap the base export in a CSS layer: that changes cascade precedence. Keeping the existing entry avoids hand-editing generated hydration data or JavaScript chunks. All import targets are within this presentation's published runtime paths.

Edit `site-theme.css` for subsequent palette, typography and control refinements. The existing bundled Geist and Geist Mono font variables are reused; no external font service or new package is required. Major panels use 4px corners, controls 2–3px, and full-height drawers square corners. Functional circles such as map pins and loading indicators retain their geometry. Map imagery and the embedded viewer are not recolored or filtered.

The overrides are screen-only. The original print stylesheet remains responsible for the white study brief. Motion enhancements are conditional on no reduced-motion preference, and selected states include borders/underlines alongside color.

## Re-exporting

A fresh export may replace the hashed CSS filename and original classes. Reapply the theme after that export's application CSS, verify selectors against the new markup, and run the repository's normal checks. Do not blindly overwrite the preserved base file with the import entry itself.

## Verification

For this change, CSS parsing and text contrast checks passed. Chromium checks on an offline representative UI fixture passed at 1440x900, 390x844, 320x568 and 844x390 for theme application, selected tabs, focus outlines, drawer width, viewport overflow and print fallback. The tested normal-text palette combinations exceed 4.5:1 contrast. These fixture checks are not a substitute for the full exported application.

Before merging, run `npm run check:update` from the repository root, inspect the generated diff, and serve `dist/` to check this route. Verify Development / Urban context / Masterplan navigation, layer switches, placement controls, study notes, scenario sliders, keyboard navigation, mobile scrolling, and print preview. The full portfolio build, network-backed maps and live WebGL model have not been verified in the connector-only editing environment.

Follow the repository publication workflow in `../../skills/update-portfolio/SKILL.md`; changing `main` deploys production. To remove this theme, restore the preserved base bytes to the original entry path and remove the added theme/base/documentation files.
