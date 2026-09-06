'use strict';

const fs = require('fs');
const path = require('path');

const {
    FORESTVILLE_PRESENTATION_DIR,
    expectedDistFiles,
    loadGalleryData,
    extractReferenceValues,
    toPosix,
    walkFiles
} = require('./dist-config');
const {
    PAGE_ASSET_LIMIT_BYTES,
    getPortfolioMediaOrigin,
    listOversizedVideoFiles,
    verifyExternalizedMedia
} = require('./dist-media');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const errors = [];
const warnings = [];

function reportError(message) {
    errors.push(message);
    console.error(`[ERROR] ${message}`);
}

function reportWarning(message) {
    warnings.push(message);
    console.warn(`[WARN] ${message}`);
}

function distPath(relativePath) {
    return path.join(distDir, relativePath.replaceAll('/', path.sep));
}

function assertDistFile(relativePath) {
    const absolutePath = distPath(relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        reportError(`Missing dist file: ${relativePath}`);
        return false;
    }
    return true;
}

function listDistFiles() {
    return new Set(walkFiles(distDir).map(relative => toPosix(relative)));
}

function stripUrlSuffix(value) {
    return value.split(/[?#]/, 1)[0];
}

function decodeReference(value) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function isExternalOrDynamicReference(value) {
    if (typeof value !== 'string') return true;
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('${')) return true;
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed);
}

function resolveReference(sourceFile, rawReference) {
    if (isExternalOrDynamicReference(rawReference)) return null;

    const decoded = decodeReference(stripUrlSuffix(rawReference.trim())).replaceAll('\\', '/');
    if (!decoded || decoded === '.') return null;
    if (!decoded.includes('/') && !/\.(?:html?|css|js|json|xml|txt|webmanifest|png|jpe?g|webp|gif|svg|mp4|webm|ttf|woff2?)$/i.test(decoded)) {
        return null;
    }

    const sourceDir = path.posix.dirname(sourceFile);
    const candidate = path.posix.normalize(decoded.startsWith('/')
        ? decoded.slice(1)
        : path.posix.join(sourceDir, decoded));

    if (candidate === '..' || candidate.startsWith('../')) {
        reportError(`${sourceFile} references a path outside dist/: ${rawReference}`);
        return null;
    }

    if (candidate.endsWith('/')) return `${candidate}index.html`;
    return candidate;
}

function verifyReferences() {
    const referenceFileExtensions = new Set(['.css', '.html', '.js', '.json', '.txt', '.webmanifest', '.xml']);
    // This exported editor manifest stores candidate paths relative to the
    // presentation root, not browser-relative URLs from its assets/ folder.
    // The presentation index is the authoritative web runtime and is checked
    // normally below; keep the manifest in dist without treating its metadata
    // paths as broken URLs.
    const metadataFiles = new Set([
        `${FORESTVILLE_PRESENTATION_DIR}/assets/project.json`
    ]);
    const actualFiles = listDistFiles();
    const files = [...actualFiles].filter(relative =>
        referenceFileExtensions.has(path.posix.extname(relative).toLowerCase()) && !metadataFiles.has(relative)
    );

    for (const relativeFile of files) {
        const rawSource = fs.readFileSync(distPath(relativeFile), 'utf8');
        // JSDoc examples describe sample assets; they are not runtime requests.
        const source = /\.(?:m?js)$/.test(relativeFile)
            ? rawSource.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
            : rawSource;
        for (const rawReference of extractReferenceValues(source)) {
            const resolved = resolveReference(relativeFile, rawReference);
            if (resolved && !actualFiles.has(resolved)) {
                reportError(`${relativeFile} references missing local asset: ${rawReference} -> ${resolved}`);
            }
        }
    }
}

async function verifyMinifiedOutputs() {
    let Terser;
    let CleanCSS;
    try {
        Terser = require('terser');
        CleanCSS = require('clean-css');
    } catch (error) {
        reportError(`Cannot verify minified outputs because build dependencies are unavailable: ${error.message}`);
        return;
    }

    const sourceJs = fs.readFileSync(path.join(rootDir, 'script.js'), 'utf8');
    const actualJs = fs.readFileSync(path.join(rootDir, 'script.min.js'), 'utf8');
    const minifiedJs = await Terser.minify(sourceJs);
    if (minifiedJs.error) {
        reportError(`Terser could not reproduce script.min.js: ${minifiedJs.error.message}`);
    } else if (minifiedJs.code !== actualJs) {
        reportError('script.min.js is not consistent with script.js; run node build.js.');
    }

    const sourceCss = fs.readFileSync(path.join(rootDir, 'styles.css'), 'utf8');
    const actualCss = fs.readFileSync(path.join(rootDir, 'styles.min.css'), 'utf8');
    const minifiedCss = new CleanCSS({}).minify(sourceCss);
    if (minifiedCss.errors.length > 0) {
        reportError(`CleanCSS could not reproduce styles.min.css: ${minifiedCss.errors.join(', ')}`);
    } else if (minifiedCss.styles !== actualCss) {
        reportError('styles.min.css is not consistent with styles.css; run node build.js.');
    }
}

function verifyManagedCacheVersions() {
    const rootIndex = fs.readFileSync(distPath('index.html'), 'utf8');
    const rootVersions = [...rootIndex.matchAll(/(?:styles\.min\.css|gallery-data\.js|script\.min\.js)\?v=(\d+)/g)].map(match => match[1]);
    if (rootVersions.length !== 3 || new Set(rootVersions).size !== 1) {
        reportError('Root managed CSS/JS/gallery cache-busting versions are missing or inconsistent.');
    }

    const sourceFiles = [
        path.join(rootDir, 'script.js'),
        path.join(rootDir, 'gallery-data.js'),
        path.join(rootDir, 'presentation', 'cinematic_web_presentation', 'index.html')
    ];
    const versions = [];
    for (const sourceFile of sourceFiles) {
        const source = fs.readFileSync(sourceFile, 'utf8');
        versions.push(...[...source.matchAll(/\?v=(\d+)/g)].map(match => match[1]));
    }

    if (!versions.length || new Set(versions).size !== 1) {
        reportError('Source cache-busting versions are missing or inconsistent after build.');
    }
}

function verifyOversizedFiles() {
    const oversized = [];

    for (const relative of listDistFiles()) {
        const bytes = fs.statSync(distPath(relative)).size;
        if (bytes > PAGE_ASSET_LIMIT_BYTES) oversized.push({ relative, bytes });
    }

    oversized.sort((a, b) => b.bytes - a.bytes);
    if (!oversized.length) {
        console.log('[OK] No files exceed the 25 MiB Cloudflare Pages asset limit.');
        return;
    }

    const mediaOrigin = getPortfolioMediaOrigin();
    const message = mediaOrigin
        ? 'must be externalized when PORTFOLIO_MEDIA_ORIGIN is set'
        : 'were preserved for the later R2/media migration phase';
    console.log(`[INFO] ${oversized.length} live asset(s) exceed the 25 MiB Cloudflare Pages limit and ${message}:`);
    for (const { relative, bytes } of oversized) {
        const detail = `${relative} (${(bytes / 1024 / 1024).toFixed(2)} MiB)`;
        if (mediaOrigin) {
            reportError(`${detail} exceeds the Pages limit with PORTFOLIO_MEDIA_ORIGIN set.`);
        } else {
            reportWarning(`${detail} requires the later R2/media migration phase.`);
        }
    }
}

async function main() {
    console.log('==========================================');
    console.log('       DIST PREFLIGHT / VERIFICATION      ');
    console.log('==========================================');

    let expectedBeforeExternalMedia = null;
    let mediaOrigin = null;

    if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
        reportError('dist/ does not exist; run npm run build:dist first.');
    } else {
        mediaOrigin = getPortfolioMediaOrigin();
        let galleryData;
        try {
            galleryData = loadGalleryData(rootDir);
        } catch (error) {
            reportError(`Cannot load gallery data: ${error.message}`);
        }

        if (galleryData) {
            const expected = expectedDistFiles(rootDir, galleryData);
            expectedBeforeExternalMedia = new Set(expected);
            if (mediaOrigin) {
                for (const { relativePath } of listOversizedVideoFiles(rootDir, expected)) {
                    expected.delete(relativePath);
                }
            }
            const actual = listDistFiles();

            for (const required of expected) assertDistFile(required);
            for (const extra of actual) {
                if (!expected.has(extra)) reportError(`Unexpected non-runtime file in dist/: ${extra}`);
            }
            console.log(`[INFO] Expected runtime files: ${expected.size}; actual files: ${actual.size}`);
        }

        for (const required of ['_headers', 'index.html', '404.html', 'gallery-data.js', 'script.min.js', 'styles.min.css', 'site.webmanifest', 'sitemap.xml', 'robots.txt']) {
            assertDistFile(required);
        }

        verifyReferences();
        verifyManagedCacheVersions();
        await verifyMinifiedOutputs();
        if (mediaOrigin && expectedBeforeExternalMedia) {
            const externalMediaResult = verifyExternalizedMedia({
                distDir,
                rootDir,
                expectedFiles: expectedBeforeExternalMedia
            });
            externalMediaResult.errors.forEach(reportError);
        }
        verifyOversizedFiles();
    }

    if (errors.length) {
        console.error(`\n[BLOCKING] ${errors.length} verification error(s) found.`);
        process.exitCode = 1;
    } else {
        console.log('\n[OK] Dist verification passed.');
    }

    if (warnings.length) {
        console.log(`[INFO] ${warnings.length} expected Pages/R2 warning(s) reported; they did not cause verification to fail.`);
    }
}

main().catch(error => {
    console.error(`[ERROR] Dist verification crashed: ${error.stack || error.message}`);
    process.exitCode = 1;
});
