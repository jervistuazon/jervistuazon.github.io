'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    FORESTVILLE_PRESENTATION_DIR,
    collectGenericPresentationRuntimeFiles,
    collectRuntimeFiles,
    discoverPresentationDirs,
    expectedDistFiles,
    loadGalleryData
} = require('./dist-config');
const {
    buildPortfolioMediaUrl,
    externalizeOversizedMedia,
    getPortfolioMediaOrigin,
    verifyExternalizedMedia
} = require('./dist-media');

const origin = 'https://www.jervistuazon.com';
const rootDir = path.resolve(__dirname, '..');
const oversizedFiles = [
    'assets/Interactive Presentation/Apartment Demo.mp4',
    'presentation/cinematic_web_presentation/Video/Sequence Demo.mp4',
    'presentation/new_web_presentation/assets/Sequence Demo.mp4'
];

function createSparseVideo(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from('MP4'));
    fs.truncateSync(filePath, 26 * 1024 * 1024);
}

function assertForestvillePresentationInventory() {
    const presentationRoot = path.join(rootDir, FORESTVILLE_PRESENTATION_DIR.replaceAll('/', path.sep));
    const sourceIndex = path.join(presentationRoot, 'index.html');
    const sourceAssets = path.join(presentationRoot, 'assets');
    assert.ok(fs.existsSync(sourceIndex), 'Forestville source index.html is missing.');

    const runtimeAssets = collectRuntimeFiles(sourceAssets);
    assert.ok(runtimeAssets.length > 0, 'Forestville runtime asset inventory is empty.');
    const runtimeExtensions = new Set(runtimeAssets.map(relative => path.extname(relative).toLowerCase()));
    for (const extension of ['.jpg', '.json', '.ttf']) {
        assert.ok(runtimeExtensions.has(extension), `Forestville runtime inventory is missing ${extension} assets.`);
    }

    const expected = expectedDistFiles(rootDir, loadGalleryData(rootDir));
    const indexRelative = `${FORESTVILLE_PRESENTATION_DIR}/index.html`;
    assert.ok(expected.has(indexRelative), `Expected dist inventory is missing ${indexRelative}.`);

    for (const asset of runtimeAssets) {
        const relative = `${FORESTVILLE_PRESENTATION_DIR}/assets/${asset}`;
        assert.ok(expected.has(relative), `Expected dist inventory is missing ${relative}.`);
    }

    console.log(`[OK] Forestville presentation inventory regression checks passed (${runtimeAssets.length} runtime assets).`);
}

function assertPresentationDiscovery() {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-presentation-discovery-'));
    try {
        const presentationRoot = path.join(fixtureRoot, 'presentation');
        const publishable = path.join(presentationRoot, 'new_presentation');
        fs.mkdirSync(path.join(publishable, 'assets'), { recursive: true });
        fs.writeFileSync(path.join(publishable, 'index.html'), '<script src="app.js"></script>');
        fs.writeFileSync(path.join(publishable, 'app.js'), 'console.log("runtime");');
        fs.writeFileSync(path.join(publishable, 'assets', 'image.webp'), 'image');
        fs.writeFileSync(path.join(publishable, 'project.manifest.json'), '{}');
        fs.mkdirSync(path.join(publishable, 'Tools'), { recursive: true });
        fs.writeFileSync(path.join(publishable, 'Tools', 'editor.html'), 'authoring tool');

        const duplicate = path.join(presentationRoot, 'Interactive Web Presentation');
        fs.mkdirSync(duplicate, { recursive: true });
        fs.writeFileSync(path.join(duplicate, 'index.html'), 'duplicate');

        const draft = path.join(presentationRoot, 'draft_presentation');
        fs.mkdirSync(draft, { recursive: true });
        fs.writeFileSync(path.join(draft, 'index.html'), 'draft');
        fs.writeFileSync(path.join(draft, '.no-publish'), '');

        const incomplete = path.join(presentationRoot, 'missing_index');
        fs.mkdirSync(incomplete, { recursive: true });
        fs.writeFileSync(path.join(incomplete, 'app.js'), 'console.log("not publishable");');

        assert.deepStrictEqual(discoverPresentationDirs(fixtureRoot), ['presentation/new_presentation']);
        assert.deepStrictEqual(
            collectGenericPresentationRuntimeFiles(fixtureRoot, 'presentation/new_presentation'),
            ['app.js', 'assets/image.webp', 'index.html']
        );
        assert.throws(
            () => collectGenericPresentationRuntimeFiles(fixtureRoot, 'presentation/new_presentation/nested'),
            /immediate child/
        );

        fs.writeFileSync(path.join(publishable, 'app.js'), 'fetch("./project.manifest.json");');
        assert.deepStrictEqual(
            collectGenericPresentationRuntimeFiles(fixtureRoot, 'presentation/new_presentation'),
            ['app.js', 'assets/image.webp', 'index.html', 'project.manifest.json']
        );
    } finally {
        fs.rmSync(fixtureRoot, { recursive: true, force: true });
    }

    console.log('[OK] Automatic presentation discovery regression checks passed.');
}

function assertHyattPresentationInventory() {
    const hyattPresentationDir = 'presentation/hyatt_web_presentation';
    const presentationRoot = path.join(rootDir, hyattPresentationDir.replaceAll('/', path.sep));
    const sourceIndex = path.join(presentationRoot, 'index.html');
    const sourceAssets = path.join(presentationRoot, 'assets');
    assert.ok(fs.existsSync(sourceIndex), 'Hyatt source index.html is missing.');

    const runtimeAssets = collectRuntimeFiles(sourceAssets);
    assert.ok(runtimeAssets.length > 0, 'Hyatt runtime asset inventory is empty.');
    const runtimeExtensions = new Set(runtimeAssets.map(relative => path.extname(relative).toLowerCase()));
    for (const extension of ['.jpg', '.mp4', '.png', '.webp']) {
        assert.ok(runtimeExtensions.has(extension), `Hyatt runtime inventory is missing ${extension} assets.`);
    }

    const expected = expectedDistFiles(rootDir, loadGalleryData(rootDir));
    assert.ok(discoverPresentationDirs(rootDir).includes(hyattPresentationDir), 'Hyatt presentation was not auto-discovered.');
    const indexRelative = `${hyattPresentationDir}/index.html`;
    assert.ok(expected.has(indexRelative), `Expected dist inventory is missing ${indexRelative}.`);

    for (const asset of runtimeAssets) {
        const relative = `${hyattPresentationDir}/assets/${asset}`;
        assert.ok(expected.has(relative), `Expected dist inventory is missing ${relative}.`);
    }
    assert.ok(!expected.has(`${hyattPresentationDir}/project.manifest.json`), 'Authoring-only Hyatt manifest must not be published.');

    console.log(`[OK] Hyatt presentation inventory regression checks passed (${runtimeAssets.length} runtime assets).`);
}

const previousOrigin = process.env.PORTFOLIO_MEDIA_ORIGIN;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-pages-media-'));
const distDir = path.join(temporaryRoot, 'dist');

try {
    assertPresentationDiscovery();
    assertForestvillePresentationInventory();
    assertHyattPresentationInventory();

    process.env.PORTFOLIO_MEDIA_ORIGIN = origin;
    assert.strictEqual(getPortfolioMediaOrigin(), origin);
    assert.strictEqual(
        buildPortfolioMediaUrl(origin, oversizedFiles[0]),
        'https://www.jervistuazon.com/assets/Interactive%20Presentation/Apartment%20Demo.mp4'
    );

    for (const relativePath of oversizedFiles) {
        createSparseVideo(path.join(temporaryRoot, relativePath));
        createSparseVideo(path.join(distDir, relativePath));
    }

    fs.mkdirSync(path.join(distDir, 'presentation/cinematic_web_presentation'), { recursive: true });
    fs.writeFileSync(
        path.join(distDir, 'gallery-data.js'),
        'const galleryData = ["Apartment Demo.mp4"];\n'
    );
    fs.writeFileSync(
        path.join(distDir, 'presentation/cinematic_web_presentation/index.html'),
        '<source data-src="Video/Sequence%20Demo.mp4?v=123" type="video/mp4">\n'
    );
    fs.writeFileSync(
        path.join(distDir, 'presentation/new_web_presentation/index.html'),
        '<source src="assets/Sequence%20Demo.mp4?v=456" type="video/mp4">\n'
    );

    const expectedFiles = new Set(oversizedFiles);
    const externalized = externalizeOversizedMedia({ distDir, expectedFiles });
    assert.deepStrictEqual(externalized.map(file => file.relativePath), oversizedFiles);

    assert.ok(!fs.existsSync(path.join(distDir, oversizedFiles[0])));
    assert.ok(!fs.existsSync(path.join(distDir, oversizedFiles[1])));
    assert.ok(!fs.existsSync(path.join(distDir, oversizedFiles[2])));
    assert.match(
        fs.readFileSync(path.join(distDir, 'gallery-data.js'), 'utf8'),
        /https:\/\/www\.jervistuazon\.com\/assets\/Interactive%20Presentation\/Apartment%20Demo\.mp4/
    );
    assert.match(
        fs.readFileSync(path.join(distDir, 'presentation/cinematic_web_presentation/index.html'), 'utf8'),
        /https:\/\/www\.jervistuazon\.com\/presentation\/cinematic_web_presentation\/Video\/Sequence%20Demo\.mp4\?v=123/
    );
    assert.match(
        fs.readFileSync(path.join(distDir, 'presentation/new_web_presentation/index.html'), 'utf8'),
        /https:\/\/www\.jervistuazon\.com\/presentation\/new_web_presentation\/assets\/Sequence%20Demo\.mp4\?v=456/
    );

    const verification = verifyExternalizedMedia({
        distDir,
        rootDir: temporaryRoot,
        expectedFiles
    });
    assert.deepStrictEqual(verification.errors, []);
    console.log('[OK] Cloudflare external-media rewrite regression checks passed.');
} finally {
    if (previousOrigin === undefined) {
        delete process.env.PORTFOLIO_MEDIA_ORIGIN;
    } else {
        process.env.PORTFOLIO_MEDIA_ORIGIN = previousOrigin;
    }
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
