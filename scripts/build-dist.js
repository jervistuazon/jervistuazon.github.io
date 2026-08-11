'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
    CINEMATIC_PRESENTATION_DIR,
    FORESTVILLE_PRESENTATION_DIR,
    INTERACTIVE_PRESENTATION_DIR,
    expectedDistFiles,
    loadGalleryData,
    toPosix
} = require('./dist-config');
const { externalizeOversizedMedia } = require('./dist-media');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

function sourcePath(relativePath) {
    return path.join(rootDir, relativePath.replaceAll('/', path.sep));
}

function requireFile(relativePath) {
    const absolutePath = sourcePath(relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        throw new Error(`Missing required input: ${relativePath}`);
    }
    return absolutePath;
}

function runNodeScript(relativePath, env = {}) {
    console.log(`[BUILD] node ${relativePath}`);
    execFileSync(process.execPath, [relativePath], {
        cwd: rootDir,
        env: { ...process.env, ...env },
        stdio: 'inherit'
    });
}

function deterministicCacheVersion() {
    const inputs = [
        'index.html',
        'styles.css',
        'script.js',
        'gallery-data.js',
        `${CINEMATIC_PRESENTATION_DIR}/index.html`,
        `${CINEMATIC_PRESENTATION_DIR}/styles.css`,
        `${CINEMATIC_PRESENTATION_DIR}/script.js`
    ];
    const hash = crypto.createHash('sha256');

    for (const relativePath of inputs) {
        const absolutePath = requireFile(relativePath);
        const normalized = fs.readFileSync(absolutePath, 'utf8').replace(/\?v=\d+/g, '?v=BUILD_VERSION');
        hash.update(relativePath);
        hash.update('\0');
        hash.update(normalized);
        hash.update('\0');
    }

    const value = BigInt(`0x${hash.digest('hex').slice(0, 12)}`) % 9000000000000n;
    return (1000000000000n + value).toString();
}

function removeAndCreateDist() {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedDist = path.resolve(distDir);
    if (resolvedDist === resolvedRoot || path.dirname(resolvedDist) !== resolvedRoot || path.basename(resolvedDist) !== 'dist') {
        throw new Error(`Refusing to recreate an unsafe output path: ${resolvedDist}`);
    }

    fs.rmSync(resolvedDist, { recursive: true, force: true });
    fs.mkdirSync(resolvedDist, { recursive: true });
}

function copyRelative(relativePath) {
    const normalized = toPosix(relativePath);
    const input = requireFile(normalized);
    const output = path.join(distDir, normalized.replaceAll('/', path.sep));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.copyFileSync(input, output);
}

function main() {
    console.log('==========================================');
    console.log('       CLEAN DIST BUILD                   ');
    console.log('==========================================');

    [
        '_headers',
        'index.html',
        '404.html',
        'gallery-data.js',
        'script.js',
        'styles.css',
        'build.js',
        'generate-project-pages.js',
        'assets',
        INTERACTIVE_PRESENTATION_DIR,
        CINEMATIC_PRESENTATION_DIR,
        FORESTVILLE_PRESENTATION_DIR
    ].forEach(relativePath => {
        const absolutePath = sourcePath(relativePath);
        if (!fs.existsSync(absolutePath)) throw new Error(`Missing required input: ${relativePath}`);
    });

    // SEO generation must see the current gallery data before cache busting and
    // minification. It also regenerates sitemap.xml and robots.txt.
    runNodeScript('generate-project-pages.js');

    const cacheVersion = deterministicCacheVersion();
    console.log(`[BUILD] deterministic cache version: ${cacheVersion}`);
    runNodeScript('build.js', { BUILD_VERSION: cacheVersion });

    const galleryData = loadGalleryData(rootDir);
    const expected = expectedDistFiles(rootDir, galleryData);

    removeAndCreateDist();
    for (const relativePath of [...expected].sort()) copyRelative(relativePath);

    const externalizedMedia = externalizeOversizedMedia({
        distDir,
        expectedFiles: expected
    });

    console.log(`[OK] Created fresh dist/ with ${expected.size - externalizedMedia.length} runtime files.`);
    console.log('[OK] Authoring files, duplicate presentations, local tools, and repository metadata were not copied.');
}

try {
    main();
} catch (error) {
    console.error(`[ERROR] Clean dist build failed: ${error.message}`);
    process.exitCode = 1;
}
