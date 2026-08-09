'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    buildPortfolioMediaUrl,
    externalizeOversizedMedia,
    getPortfolioMediaOrigin,
    verifyExternalizedMedia
} = require('./dist-media');

const origin = 'https://www.jervistuazon.com';
const oversizedFiles = [
    'assets/Interactive Presentation/Apartment Demo.mp4',
    'presentation/cinematic_web_presentation/Video/Sequence Demo.mp4'
];

function createSparseVideo(filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.from('MP4'));
    fs.truncateSync(filePath, 26 * 1024 * 1024);
}

const previousOrigin = process.env.PORTFOLIO_MEDIA_ORIGIN;
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-pages-media-'));
const distDir = path.join(temporaryRoot, 'dist');

try {
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

    const expectedFiles = new Set(oversizedFiles);
    const externalized = externalizeOversizedMedia({ distDir, expectedFiles });
    assert.deepStrictEqual(externalized.map(file => file.relativePath), oversizedFiles);

    assert.ok(!fs.existsSync(path.join(distDir, oversizedFiles[0])));
    assert.ok(!fs.existsSync(path.join(distDir, oversizedFiles[1])));
    assert.match(
        fs.readFileSync(path.join(distDir, 'gallery-data.js'), 'utf8'),
        /https:\/\/www\.jervistuazon\.com\/assets\/Interactive%20Presentation\/Apartment%20Demo\.mp4/
    );
    assert.match(
        fs.readFileSync(path.join(distDir, 'presentation/cinematic_web_presentation/index.html'), 'utf8'),
        /https:\/\/www\.jervistuazon\.com\/presentation\/cinematic_web_presentation\/Video\/Sequence%20Demo\.mp4\?v=123/
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
