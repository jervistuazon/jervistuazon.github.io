'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const PROJECT_PAGE_CATEGORIES = [
    'Commercial',
    'Hospitality',
    'Institutional',
    'Mix Used Development',
    'Residential',
    'Residential Development'
];

const ROOT_RUNTIME_FILES = [
    '_headers',
    'index.html',
    '404.html',
    'gallery-data.js',
    'script.min.js',
    'styles.min.css',
    'site.webmanifest',
    'sitemap.xml',
    'robots.txt'
];

const INTERACTIVE_PRESENTATION_DIR = 'presentation/interactive_presentation_demo';
const CINEMATIC_PRESENTATION_DIR = 'presentation/cinematic_web_presentation';
const FORESTVILLE_PRESENTATION_DIR = 'presentation/forestville_test';
const HYATT_PRESENTATION_DIR = 'presentation/hyatt_web_presentation';

const RUNTIME_ASSET_EXTENSIONS = new Set([
    '.avif',
    '.gif',
    '.jpeg',
    '.jpg',
    '.json',
    '.mp4',
    '.png',
    '.svg',
    '.ttf',
    '.webm',
    '.webp',
    '.woff',
    '.woff2'
]);

function toPosix(relativePath) {
    return relativePath.split(path.sep).join('/');
}

function decodeUrlPath(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function withoutUrlSuffix(value) {
    return value.split(/[?#]/, 1)[0];
}

function extractReferenceValues(text) {
    const references = [];
    const patterns = [
        /\b(?:src|href|data-src|poster|content)\s*=\s*["']([^"']+)["']/gi,
        /["'](?:src|href|data-src|poster)["']\s*:\s*["']([^"']+)["']/gi,
        /\burl\(\s*["']?([^"')]+)["']?\s*\)/gi,
        /["'`]((?:\.\.\/|\.\/)?(?:assets|presentation|projects)\/[^"'`]+)["'`]/gi
    ];

    for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
            references.push(match[1]);
        }
    }

    return [...new Set(references)];
}

function localAssetReference(value) {
    if (typeof value !== 'string' || !value || value.includes('${')) return null;

    const cleanValue = decodeUrlPath(withoutUrlSuffix(value.trim()));
    if (!cleanValue || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(cleanValue)) return null;

    const normalized = cleanValue.replace(/^\.\//, '');
    if (normalized.startsWith('assets/')) return normalized;
    return null;
}

function loadGalleryData(rootDir) {
    const galleryPath = path.join(rootDir, 'gallery-data.js');
    const source = fs.readFileSync(galleryPath, 'utf8').replace(/^\uFEFF/, '').replace(/window\./g, 'global.');
    const sandbox = { global: {} };
    sandbox.window = sandbox.global;
    vm.runInNewContext(source, sandbox, { filename: galleryPath });

    if (!sandbox.global.galleryData || typeof sandbox.global.galleryData !== 'object') {
        throw new Error('gallery-data.js did not define an object at window.galleryData');
    }

    return sandbox.global.galleryData;
}

function addGalleryAssetReference(set, category, projectName, entry) {
    const filename = entry && typeof entry === 'object' ? entry.src : entry;
    if (typeof filename !== 'string' || !filename) return;

    const decodedFilename = decodeUrlPath(filename);
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(decodedFilename)) return;

    if (decodedFilename.startsWith('assets/')) {
        set.add(decodedFilename);
        return;
    }

    // Presentation objects point outside the root assets tree and are handled
    // by the active-presentation inventory below.
    if (decodedFilename.startsWith('presentation/')) return;

    const relative = projectName
        ? `assets/${category}/${projectName}/${decodedFilename}`
        : `assets/${category}/${decodedFilename}`;
    set.add(toPosix(relative));
}

function collectGalleryAssetReferences(galleryData) {
    const references = new Set();

    for (const [category, categoryData] of Object.entries(galleryData)) {
        if (Array.isArray(categoryData)) {
            categoryData.forEach(entry => addGalleryAssetReference(references, category, null, entry));
            continue;
        }

        if (!categoryData || typeof categoryData !== 'object') continue;
        for (const [projectName, entries] of Object.entries(categoryData)) {
            if (!Array.isArray(entries)) continue;
            entries.forEach(entry => addGalleryAssetReference(references, category, projectName === '_standalone' ? null : projectName, entry));
        }
    }

    return references;
}

function collectRootReferencedAssets(rootDir) {
    const references = new Set();
    const sourceFiles = [
        'index.html',
        '404.html',
        'site.webmanifest',
        'styles.css'
    ];

    for (const relativeFile of sourceFiles) {
        const absoluteFile = path.join(rootDir, relativeFile);
        if (!fs.existsSync(absoluteFile)) continue;
        const source = fs.readFileSync(absoluteFile, 'utf8');
        for (const reference of extractReferenceValues(source)) {
            const asset = localAssetReference(reference);
            if (asset) references.add(asset);
        }
    }

    return references;
}

function walkFiles(directory) {
    const files = [];
    if (!fs.existsSync(directory)) return files;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(absolutePath).map(relative => toPosix(path.join(entry.name, relative))));
        } else if (entry.isFile()) {
            files.push(entry.name);
        }
    }

    return files;
}

function collectRuntimeFiles(directory) {
    return walkFiles(directory).filter(relative => RUNTIME_ASSET_EXTENSIONS.has(path.extname(relative).toLowerCase()));
}

function collectCinematicRuntimeAssets(rootDir) {
    const presentationRoot = path.join(rootDir, CINEMATIC_PRESENTATION_DIR.replaceAll('/', path.sep));
    const references = new Set();
    const sourceFiles = [
        path.join(presentationRoot, 'index.html'),
        path.join(presentationRoot, 'script.js'),
        path.join(presentationRoot, 'styles.css')
    ];

    for (const sourceFile of sourceFiles) {
        if (!fs.existsSync(sourceFile)) continue;
        const source = fs.readFileSync(sourceFile, 'utf8');
        for (const reference of extractReferenceValues(source)) {
            if (typeof reference !== 'string' || reference.includes('${')) continue;
            const decoded = decodeUrlPath(withoutUrlSuffix(reference.trim())).replace(/^\.\//, '');
            if (decoded.startsWith('Assets/') || decoded.startsWith('Video/')) {
                references.add(`${CINEMATIC_PRESENTATION_DIR}/${decoded}`);
            }
        }
    }

    // This video is the gallery card thumbnail/source and is not referenced by
    // the scroll page itself, so it is part of the active runtime inventory too.
    references.add(`${CINEMATIC_PRESENTATION_DIR}/Video/cinematic_web_presentation.mp4`);
    return references;
}

function slugify(text) {
    return text.toLowerCase()
        .replace(/ - F$| -F$/i, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function expectedProjectPageFiles(galleryData) {
    const files = new Set();

    for (const category of PROJECT_PAGE_CATEGORIES) {
        const categoryData = galleryData[category];
        if (!categoryData || typeof categoryData !== 'object' || Array.isArray(categoryData)) continue;

        for (const [projectName, entries] of Object.entries(categoryData)) {
            if (projectName === '_standalone' || !Array.isArray(entries) || entries.length === 0) continue;
            files.add(`projects/${slugify(projectName)}.html`);
        }
    }

    return files;
}

function expectedDistFiles(rootDir, galleryData = loadGalleryData(rootDir)) {
    const expected = new Set(ROOT_RUNTIME_FILES);

    for (const page of expectedProjectPageFiles(galleryData)) expected.add(page);
    for (const asset of collectGalleryAssetReferences(galleryData)) expected.add(asset);
    for (const asset of collectRootReferencedAssets(rootDir)) expected.add(asset);

    expected.add(`${INTERACTIVE_PRESENTATION_DIR}/index.html`);
    const interactiveAssetsDir = path.join(rootDir, INTERACTIVE_PRESENTATION_DIR.replaceAll('/', path.sep), 'assets');
    for (const asset of collectRuntimeFiles(interactiveAssetsDir)) {
        expected.add(`${INTERACTIVE_PRESENTATION_DIR}/assets/${asset}`);
    }

    expected.add(`${CINEMATIC_PRESENTATION_DIR}/index.html`);
    expected.add(`${CINEMATIC_PRESENTATION_DIR}/script.js`);
    expected.add(`${CINEMATIC_PRESENTATION_DIR}/styles.css`);
    for (const asset of collectCinematicRuntimeAssets(rootDir)) expected.add(asset);

    expected.add(`${FORESTVILLE_PRESENTATION_DIR}/index.html`);
    const forestvilleAssetsDir = path.join(rootDir, FORESTVILLE_PRESENTATION_DIR.replaceAll('/', path.sep), 'assets');
    for (const asset of collectRuntimeFiles(forestvilleAssetsDir)) {
        expected.add(`${FORESTVILLE_PRESENTATION_DIR}/assets/${asset}`);
    }

    expected.add(`${HYATT_PRESENTATION_DIR}/index.html`);
    const hyattAssetsDir = path.join(rootDir, HYATT_PRESENTATION_DIR.replaceAll('/', path.sep), 'assets');
    for (const asset of collectRuntimeFiles(hyattAssetsDir)) {
        expected.add(`${HYATT_PRESENTATION_DIR}/assets/${asset}`);
    }

    return expected;
}

module.exports = {
    CINEMATIC_PRESENTATION_DIR,
    FORESTVILLE_PRESENTATION_DIR,
    HYATT_PRESENTATION_DIR,
    INTERACTIVE_PRESENTATION_DIR,
    PROJECT_PAGE_CATEGORIES,
    ROOT_RUNTIME_FILES,
    collectCinematicRuntimeAssets,
    collectGalleryAssetReferences,
    collectRootReferencedAssets,
    collectRuntimeFiles,
    decodeUrlPath,
    expectedDistFiles,
    expectedProjectPageFiles,
    extractReferenceValues,
    loadGalleryData,
    toPosix,
    walkFiles
};
