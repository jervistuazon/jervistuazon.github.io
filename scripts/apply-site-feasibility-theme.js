'use strict';

// Like the Forestville patch in build.js, this keeps a maintained enhancement
// separate from imported, generated HTML. Never rewrite a compiled JS/CSS bundle.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const START = '<!-- SITE_FEASIBILITY_THEME_START -->';
const END = '<!-- SITE_FEASIBILITY_THEME_END -->';
const BLOCK = /\n?<!-- SITE_FEASIBILITY_THEME_START -->[\s\S]*?<!-- SITE_FEASIBILITY_THEME_END -->\n?/g;

function injectTheme(html, href) {
    if (typeof html !== 'string' || !/<\/head\s*>/i.test(html)) {
        throw new Error('Site feasibility export is missing </head>; cannot install theme safely.');
    }
    if (!/^\.\.?\/ui-theme\.css\?v=[a-f0-9]{12}$/.test(href)) {
        throw new Error('Theme URL must be a relative, content-versioned ui-theme.css URL.');
    }
    const starts = html.split(START).length - 1;
    const ends = html.split(END).length - 1;
    if (starts !== ends || starts > 1 || (starts && html.indexOf(END) < html.indexOf(START))) {
        throw new Error('Site feasibility export has an incomplete or duplicated theme block.');
    }
    const clean = html.replace(BLOCK, '');
    const block = `\n${START}\n<link id="atlas-ui-theme" rel="stylesheet" href="${href}">\n<meta name="theme-color" content="#0e1115">\n${END}\n`;
    return clean.replace(/<\/head\s*>/i, closingTag => block + closingTag);
}

function applySiteFeasibilityTheme(repoRoot = path.resolve(__dirname, '..')) {
    const directory = path.join(repoRoot, 'presentation', 'site_feasibility');
    // Some build-contract tests intentionally use a subset of the presentations.
    if (!fs.existsSync(directory)) return [];
    const cssPath = path.join(directory, 'ui-theme.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    if (!css.trim()) throw new Error('Site feasibility ui-theme.css is empty.');
    const version = createHash('sha256').update(css).digest('hex').slice(0, 12);
    const exports = [
        ['index.html', `./ui-theme.css?v=${version}`],
        ['development/index.html', `../ui-theme.css?v=${version}`],
    ];
    // Validate both exports before writing either, so a malformed re-export
    // cannot leave a half-themed presentation behind.
    const changes = exports.map(([relative, href]) => {
        const filename = path.join(directory, relative);
        const before = fs.readFileSync(filename, 'utf8');
        return { filename, before, after: injectTheme(before, href) };
    });
    for (const { filename, before, after } of changes) {
        if (before !== after) fs.writeFileSync(filename, after);
    }
    return changes.filter(change => change.before !== change.after).map(change => change.filename);
}

if (require.main === module) {
    const changed = applySiteFeasibilityTheme();
    console.log(`[OK] Site feasibility graphite theme: ${changed.length} export(s) updated.`);
}

module.exports = { applySiteFeasibilityTheme, injectTheme };
