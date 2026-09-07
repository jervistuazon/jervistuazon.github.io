'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { applySiteFeasibilityTheme, injectTheme } = require('./apply-site-feasibility-theme');

const href = './ui-theme.css?v=123456abcdef';
const html = '<!doctype html><html><head><style>.panel{color:green}</style>\n</head><body><main class="atlas">Atlas</main><script>window.original = true;</script></body></html>';

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-theme-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const dir = path.join(root, 'presentation', 'site_feasibility');
    fs.mkdirSync(path.join(dir, 'development'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'ui-theme.css'), ':root { color-scheme: dark; }');
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    fs.writeFileSync(path.join(dir, 'development/index.html'), html);
    return { root, dir };
}

test('loads the theme after export styles without changing body/scripts', () => {
    const output = injectTheme(html, href);
    assert.ok(output.indexOf('id="atlas-ui-theme"') > output.indexOf('</style>'));
    assert.ok(output.indexOf('id="atlas-ui-theme"') < output.indexOf('</head>'));
    assert.equal(output.slice(output.indexOf('<body>')), html.slice(html.indexOf('<body>')));
    assert.ok(output.includes('<meta name="theme-color" content="#0e1115">'));
});

test('repeated builds are byte-for-byte idempotent', () => {
    const once = injectTheme(html, href);
    assert.equal(injectTheme(once, href), once);
});

test('updates the cache key instead of accumulating stylesheets', () => {
    const output = injectTheme(injectTheme(html, href), './ui-theme.css?v=abcdef123456');
    assert.equal((output.match(/id="atlas-ui-theme"/g) || []).length, 1);
    assert.ok(output.includes('v=abcdef123456'));
    assert.ok(!output.includes('v=123456abcdef'));
});

test('preserves uppercase closing tags and accepts compact HTML', () => {
    const input = '<HEAD><style></style></HEAD><BODY></BODY>';
    assert.ok(injectTheme(input, href).endsWith('</HEAD><BODY></BODY>'));
});

test('refuses missing heads, malformed markers and unsafe URLs', () => {
    assert.throws(() => injectTheme('<body>Missing head</body>', href), /missing/);
    for (const marker of [
        '<!-- SITE_FEASIBILITY_THEME_START -->',
        '<!-- SITE_FEASIBILITY_THEME_END -->',
        '<!-- SITE_FEASIBILITY_THEME_END --><!-- SITE_FEASIBILITY_THEME_START -->',
        '<!-- SITE_FEASIBILITY_THEME_START --><!-- SITE_FEASIBILITY_THEME_END --><!-- SITE_FEASIBILITY_THEME_START --><!-- SITE_FEASIBILITY_THEME_END -->',
    ]) assert.throws(() => injectTheme(html.replace('</head>', marker + '</head>'), href), /theme block/);
    assert.throws(() => injectTheme(html, 'https://example.com/theme.css'), /relative/);
});

test('installs correct relative URLs into atlas and development exports', t => {
    const { root, dir } = fixture(t);
    assert.equal(applySiteFeasibilityTheme(root).length, 2);
    const atlas = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const viewer = fs.readFileSync(path.join(dir, 'development/index.html'), 'utf8');
    const version = atlas.match(/ui-theme\.css\?v=([a-f0-9]{12})/)[1];
    assert.ok(atlas.includes(`href="./ui-theme.css?v=${version}"`));
    assert.ok(viewer.includes(`href="../ui-theme.css?v=${version}"`));
    assert.deepEqual(applySiteFeasibilityTheme(root), []);
});

test('CSS edits change the content-based cache key', t => {
    const { root, dir } = fixture(t);
    applySiteFeasibilityTheme(root);
    const before = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    fs.appendFileSync(path.join(dir, 'ui-theme.css'), '\nbody { color: white; }');
    assert.equal(applySiteFeasibilityTheme(root).length, 2);
    assert.notEqual(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), before);
});

test('validates both exports before changing either file', t => {
    const { root, dir } = fixture(t);
    fs.writeFileSync(path.join(dir, 'development/index.html'), '<body>Broken export</body>');
    assert.throws(() => applySiteFeasibilityTheme(root), /missing/);
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), html);
});

test('missing or empty stylesheet fails without touching the exports', t => {
    const { root, dir } = fixture(t);
    fs.writeFileSync(path.join(dir, 'ui-theme.css'), '');
    assert.throws(() => applySiteFeasibilityTheme(root), /empty/);
    fs.unlinkSync(path.join(dir, 'ui-theme.css'));
    assert.throws(() => applySiteFeasibilityTheme(root), /ENOENT/);
    assert.equal(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), html);
});

test('subset build fixtures without this presentation remain supported', t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-no-theme-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    assert.deepEqual(applySiteFeasibilityTheme(root), []);
});
