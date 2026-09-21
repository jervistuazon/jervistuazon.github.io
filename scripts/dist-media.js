'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const {
    RUNTIME_ASSET_EXTENSIONS,
    collectGenericPresentationRuntimeFiles,
    discoverPresentationDirs,
    expectedDistFiles,
    loadGalleryData,
    toPosix,
    walkFiles
} = require('./dist-config');

const PAGE_ASSET_LIMIT_BYTES = 25 * 1024 * 1024;
const VIDEO_EXTENSIONS = new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm']);
// Only files that the production artifact knows how to ship are eligible for
// R2. Inactive authoring documents and archives never enter this inventory.
const EXTERNALIZABLE_EXTENSIONS = new Set([
    ...RUNTIME_ASSET_EXTENSIONS,
    ...VIDEO_EXTENSIONS
]);
const TEXT_EXTENSIONS = new Set([
    '.cjs',
    '.css',
    '.gltf',
    '.html',
    '.js',
    '.json',
    '.mjs',
    '.rsc',
    '.svg',
    '.txt',
    '.webmanifest',
    '.xml'
]);
const EXCLUDED_SOURCE_DIRECTORY_NAMES = new Set([
    '.agent',
    '.agents',
    '.codex',
    '.git',
    'draft',
    'drafts',
    'dist',
    'node_modules'
]);
const MEDIA_CONTENT_TYPES = Object.freeze({
    '.aac': 'audio/aac',
    '.avif': 'image/avif',
    '.avi': 'video/x-msvideo',
    '.bin': 'application/octet-stream',
    '.bmp': 'image/bmp',
    '.csv': 'text/csv; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.draco': 'application/octet-stream',
    '.exr': 'image/x-exr',
    '.flac': 'audio/flac',
    '.gif': 'image/gif',
    '.gltf': 'model/gltf+json',
    '.glb': 'model/gltf-binary',
    '.hdr': 'image/vnd.radiance',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ktx2': 'image/ktx2',
    '.m4a': 'audio/mp4',
    '.mjs': 'text/javascript; charset=utf-8',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.ogg': 'audio/ogg',
    '.otf': 'font/otf',
    '.pdf': 'application/pdf',
    '.ply': 'application/octet-stream',
    '.png': 'image/png',
    '.rsc': 'text/plain; charset=utf-8',
    '.splat': 'application/octet-stream',
    '.svg': 'image/svg+xml',
    '.tif': 'image/tiff',
    '.tiff': 'image/tiff',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
    '.wav': 'audio/wav',
    '.wasm': 'application/wasm',
    '.webm': 'video/webm',
    '.webmanifest': 'application/manifest+json',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8',
    '.zip': 'application/zip'
});

function getPortfolioMediaOrigin(environment = process.env) {
    const rawValue = typeof environment.PORTFOLIO_MEDIA_ORIGIN === 'string'
        ? environment.PORTFOLIO_MEDIA_ORIGIN.trim()
        : '';

    if (!rawValue) return null;

    let parsed;
    try {
        parsed = new URL(rawValue);
    } catch {
        throw new Error('PORTFOLIO_MEDIA_ORIGIN must be a valid absolute URL.');
    }

    if (parsed.protocol !== 'https:'
        || parsed.username
        || parsed.password
        || parsed.pathname !== '/'
        || parsed.search
        || parsed.hash) {
        throw new Error('PORTFOLIO_MEDIA_ORIGIN must be an https origin without credentials, path, query, or hash.');
    }

    return parsed.origin;
}

function encodeRelativePath(relativePath) {
    return toPosix(relativePath)
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/');
}

function buildPortfolioMediaUrl(origin, relativePath) {
    return `${origin}/${encodeRelativePath(relativePath)}`;
}

function getMediaContentType(relativePath) {
    return MEDIA_CONTENT_TYPES[path.posix.extname(toPosix(relativePath)).toLowerCase()]
        || 'application/octet-stream';
}

function isVideoPath(relativePath) {
    return VIDEO_EXTENSIONS.has(path.posix.extname(toPosix(relativePath)).toLowerCase());
}

function isExternalizableMediaPath(relativePath) {
    return EXTERNALIZABLE_EXTENSIONS.has(path.posix.extname(toPosix(relativePath)).toLowerCase());
}

function walkSourceFiles(directory) {
    const files = [];
    if (!fs.existsSync(directory)) return files;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory() && EXCLUDED_SOURCE_DIRECTORY_NAMES.has(entry.name.toLowerCase())) continue;
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkSourceFiles(absolutePath).map(relative => toPosix(path.join(entry.name, relative))));
        } else if (entry.isFile()) {
            files.push(entry.name);
        }
    }

    return files;
}

function listSourceMediaFiles(directory) {
    const candidates = new Set();
    const galleryPath = path.join(directory, 'gallery-data.js');

    // The normal repository inventory is the same expected runtime set used
    // by dist/. This prevents R2 from receiving arbitrary source documents,
    // editor exports, or tool folders.
    if (fs.existsSync(galleryPath)) {
        const expected = expectedDistFiles(directory, loadGalleryData(directory));
        for (const relativePath of expected) {
            const normalized = toPosix(relativePath);
            if (normalized.startsWith('assets/') || normalized.startsWith('presentation/')) {
                candidates.add(normalized);
            }
        }
    } else {
        // Small fixtures used by focused tests may not include gallery data.
        // They still get the same publishable-presentation filtering.
        for (const presentationDir of discoverPresentationDirs(directory)) {
            for (const relativePath of collectGenericPresentationRuntimeFiles(directory, presentationDir)) {
                candidates.add(toPosix(path.posix.join(presentationDir, relativePath)));
            }
        }
    }

    // Preserve the established video inventory under assets, including
    // inactive gallery videos that may be referenced by a later update.
    const assetsRoot = path.join(directory, 'assets');
    for (const relativePath of walkSourceFiles(assetsRoot)) {
        const normalized = toPosix(path.posix.join('assets', relativePath));
        if (isVideoPath(normalized)) candidates.add(normalized);
    }

    return [...candidates];
}

function assertGltfDependenciesAreEmbedded(relativePath, absolutePath) {
    if (path.posix.extname(relativePath).toLowerCase() !== '.gltf') return;

    let document;
    try {
        document = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    } catch (error) {
        throw new Error(`Cannot inspect oversized glTF dependencies for ${relativePath}: ${error.message}`);
    }

    const localReferences = [
        ...(Array.isArray(document.buffers) ? document.buffers : []),
        ...(Array.isArray(document.images) ? document.images : [])
    ]
        .map(entry => entry && typeof entry.uri === 'string' ? entry.uri : '')
        .filter(uri => uri && !/^data:/i.test(uri) && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(uri));

    if (localReferences.length) {
        throw new Error(`Cannot externalize oversized glTF ${relativePath}: it references local buffer/image resources (${localReferences.join(', ')}). Embed those resources or publish the dependency set together.`);
    }
}

function buildMediaObjectKey(relativePath, absolutePath) {
    const normalized = toPosix(relativePath);
    if (isVideoPath(normalized)) return normalized;

    assertGltfDependenciesAreEmbedded(normalized, absolutePath);
    const extension = path.posix.extname(normalized);
    const basename = path.posix.basename(normalized, extension);
    const directory = path.posix.dirname(normalized);
    const digest = crypto.createHash('sha256')
        .update(fs.readFileSync(absolutePath))
        .digest('hex')
        .slice(0, 16);
    const filename = `${basename}.${digest}${extension}`;
    return directory === '.' ? filename : `${directory}/${filename}`;
}

function listOversizedMediaFiles(directory, relativeFiles = null) {
    const candidates = relativeFiles
        ? [...relativeFiles].map(toPosix)
        : listSourceMediaFiles(directory);

    return candidates
        .filter(isExternalizableMediaPath)
        .filter(relativePath => fs.existsSync(path.join(directory, relativePath.replaceAll('/', path.sep))))
        .map(relativePath => {
            const absolutePath = path.join(directory, relativePath.replaceAll('/', path.sep));
            return {
                relativePath,
                absolutePath,
                bytes: fs.statSync(absolutePath).size
            };
        })
        .filter(file => file.bytes > PAGE_ASSET_LIMIT_BYTES)
        .map(file => ({
            relativePath: file.relativePath,
            bytes: file.bytes,
            contentType: getMediaContentType(file.relativePath),
            objectKey: buildMediaObjectKey(file.relativePath, file.absolutePath)
        }))
        .sort((a, b) => b.bytes - a.bytes || a.relativePath.localeCompare(b.relativePath));
}

function listOversizedVideoFiles(directory, relativeFiles = null) {
    return listOversizedMediaFiles(directory, relativeFiles).filter(file => isVideoPath(file.relativePath));
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function addReferenceVariant(variants, value) {
    if (!value || value === '.') return;
    const normalized = toPosix(value);
    variants.add(normalized);
    variants.add(encodeRelativePath(normalized));
}

function getMediaReferenceVariants(relativePath, textFile) {
    const normalizedPath = toPosix(relativePath);
    const normalizedTextFile = toPosix(textFile);
    const variants = new Set();
    const sourceDir = path.posix.dirname(normalizedTextFile);
    const relativePathFromText = path.posix.relative(sourceDir, normalizedPath);

    addReferenceVariant(variants, relativePathFromText);
    if (!relativePathFromText.startsWith('../')) addReferenceVariant(variants, `./${relativePathFromText}`);
    addReferenceVariant(variants, normalizedPath);
    addReferenceVariant(variants, `/${normalizedPath}`);

    if (normalizedTextFile === 'gallery-data.js') {
        const basename = path.posix.basename(normalizedPath);
        addReferenceVariant(variants, basename);
    }

    return [...variants].sort((a, b) => b.length - a.length);
}

function createMediaReferencePattern(variant, textFile) {
    const suffixPattern = "[?#][^\\s\\\"'`<>)]*";
    const isGalleryDataBasename = textFile === 'gallery-data.js'
        && !variant.includes('/')
        && variant === path.posix.basename(variant);

    if (isGalleryDataBasename) {
        return {
            gallery: true,
            pattern: new RegExp(`([\"'])${escapeRegExp(variant)}(${suffixPattern})?\\1`, 'g')
        };
    }

    return {
        gallery: false,
        // A short relative variant must not match the tail of ./asset,
        // ../asset, or an already external URL.
        pattern: new RegExp(`(?<![A-Za-z0-9_./-])${escapeRegExp(variant)}(${suffixPattern})?(?![A-Za-z0-9_./-])`, 'g')
    };
}

function isExternalUrlContext(text, offset) {
    const prefix = text.slice(Math.max(0, offset - 2048), offset);
    return /(?:https?:|\/\/)[^\s\"'`<>]*$/i.test(prefix);
}

function replaceMediaReferences(text, relativePath, textFile, mediaUrl) {
    const variants = getMediaReferenceVariants(relativePath, textFile);
    const replacementValues = [];
    let nextText = text;
    let replacements = 0;

    for (const variant of variants) {
        const { gallery, pattern } = createMediaReferencePattern(variant, textFile);
        nextText = nextText.replace(pattern, (...args) => {
            const match = args[0];
            const offset = args[args.length - 2];
            if (isExternalUrlContext(nextText, offset)) return match;
            const firstCapture = args[1];
            const secondCapture = args[2];
            const quote = gallery ? firstCapture : null;
            const suffix = gallery ? (secondCapture || '') : (firstCapture || '');
            const token = `__PORTFOLIO_MEDIA_REWRITE_${replacementValues.length}__`;
            replacementValues.push(`${mediaUrl}${suffix}`);
            replacements += 1;
            return gallery ? `${quote}${token}${quote}` : token;
        });
    }

    replacementValues.forEach((replacement, index) => {
        nextText = nextText.replace(`__PORTFOLIO_MEDIA_REWRITE_${index}__`, replacement);
    });

    return { text: nextText, replacements };
}

function countLocalMediaReferences(text, relativePath, textFile) {
    return getMediaReferenceVariants(relativePath, textFile).reduce((count, variant) => {
        const { pattern } = createMediaReferencePattern(variant, textFile);
        return count + [...text.matchAll(pattern)]
            .filter(match => !isExternalUrlContext(text, match.index))
            .length;
    }, 0);
}

function listTextFiles(directory) {
    return walkFiles(directory)
        .map(toPosix)
        .filter(relativePath => TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()));
}

function externalizeOversizedMedia({ distDir, expectedFiles }) {
    const origin = getPortfolioMediaOrigin();
    if (!origin) return [];

    const oversizedFiles = listOversizedMediaFiles(distDir, expectedFiles);
    const textFiles = listTextFiles(distDir);

    for (const { relativePath, objectKey, bytes } of oversizedFiles) {
        const mediaUrl = buildPortfolioMediaUrl(origin, objectKey);
        let replacements = 0;

        for (const textFile of textFiles) {
            const absoluteTextFile = path.join(distDir, textFile.replaceAll('/', path.sep));
            const original = fs.readFileSync(absoluteTextFile, 'utf8');
            const result = replaceMediaReferences(original, relativePath, textFile, mediaUrl);
            if (result.replacements > 0) {
                fs.writeFileSync(absoluteTextFile, result.text);
                replacements += result.replacements;
            }
        }

        if (replacements === 0) {
            throw new Error(`Oversized active runtime asset has no rewritable dist reference: ${relativePath}`);
        }

        const absoluteMediaFile = path.resolve(distDir, relativePath.replaceAll('/', path.sep));
        const resolvedDist = path.resolve(distDir);
        if (absoluteMediaFile === resolvedDist || !absoluteMediaFile.startsWith(`${resolvedDist}${path.sep}`)) {
            throw new Error(`Refusing to remove media outside dist/: ${absoluteMediaFile}`);
        }

        fs.rmSync(absoluteMediaFile, { force: true });
        console.log(`[MEDIA] ${relativePath} (${(bytes / 1024 / 1024).toFixed(2)} MiB) -> ${mediaUrl} (${replacements} reference(s))`);
    }

    return oversizedFiles;
}

function verifyExternalizedMedia({ distDir, rootDir, expectedFiles }) {
    const origin = getPortfolioMediaOrigin();
    if (!origin) return { oversizedFiles: [], errors: [] };

    const oversizedFiles = listOversizedMediaFiles(rootDir, expectedFiles);
    const errors = [];
    const textFiles = listTextFiles(distDir);

    for (const { relativePath, objectKey } of oversizedFiles) {
        const mediaUrl = buildPortfolioMediaUrl(origin, objectKey);
        const distMediaFile = path.join(distDir, relativePath.replaceAll('/', path.sep));
        if (fs.existsSync(distMediaFile)) {
            errors.push(`Externalized oversized runtime asset still exists in dist/: ${relativePath}`);
        }

        let absoluteUrlReferences = 0;
        let localReferences = 0;
        for (const textFile of textFiles) {
            const source = fs.readFileSync(path.join(distDir, textFile.replaceAll('/', path.sep)), 'utf8');
            absoluteUrlReferences += source.split(mediaUrl).length - 1;
            localReferences += countLocalMediaReferences(source.split(mediaUrl).join(''), relativePath, textFile);
        }

        if (absoluteUrlReferences === 0) {
            errors.push(`No absolute media-origin reference found in dist/: ${relativePath}`);
        }
        if (localReferences > 0) {
            errors.push(`Local oversized runtime asset reference remains in dist/: ${relativePath}`);
        }
    }

    return { oversizedFiles, errors };
}

module.exports = {
    EXTERNALIZABLE_EXTENSIONS,
    MEDIA_CONTENT_TYPES,
    PAGE_ASSET_LIMIT_BYTES,
    buildPortfolioMediaUrl,
    countLocalMediaReferences,
    encodeRelativePath,
    externalizeOversizedMedia,
    getMediaContentType,
    getMediaReferenceVariants,
    getPortfolioMediaOrigin,
    isExternalizableMediaPath,
    isVideoPath,
    listOversizedMediaFiles,
    listOversizedVideoFiles,
    listTextFiles,
    replaceMediaReferences,
    verifyExternalizedMedia
};
