'use strict';

const fs = require('fs');
const path = require('path');

const { toPosix, walkFiles } = require('./dist-config');

const PAGE_ASSET_LIMIT_BYTES = 25 * 1024 * 1024;
const VIDEO_EXTENSIONS = new Set(['.avi', '.mkv', '.mov', '.mp4', '.webm']);
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.webmanifest', '.xml']);

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

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error('PORTFOLIO_MEDIA_ORIGIN must be an https origin without credentials, query, or hash.');
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

function isVideoPath(relativePath) {
    return VIDEO_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase());
}

function listOversizedVideoFiles(directory, relativeFiles = null) {
    const candidates = relativeFiles
        ? [...relativeFiles].map(toPosix)
        : walkFiles(directory).map(toPosix);

    return candidates
        .filter(isVideoPath)
        .filter(relativePath => fs.existsSync(path.join(directory, relativePath.replaceAll('/', path.sep))))
        .map(relativePath => ({
            relativePath,
            bytes: fs.statSync(path.join(directory, relativePath.replaceAll('/', path.sep))).size
        }))
        .filter(file => file.bytes > PAGE_ASSET_LIMIT_BYTES)
        .sort((a, b) => b.bytes - a.bytes);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMediaReferenceVariants(relativePath, textFile) {
    const normalizedPath = toPosix(relativePath);
    const variants = new Set([normalizedPath, encodeRelativePath(normalizedPath)]);
    const presentationPrefix = 'presentation/cinematic_web_presentation/';

    if (textFile === 'gallery-data.js') {
        const basename = path.posix.basename(normalizedPath);
        variants.add(basename);
        variants.add(encodeURIComponent(basename));
    }

    if (normalizedPath.startsWith(presentationPrefix) && textFile.startsWith(presentationPrefix)) {
        const localPath = normalizedPath.slice(presentationPrefix.length);
        variants.add(localPath);
        variants.add(encodeRelativePath(localPath));
    }

    return [...variants].sort((a, b) => b.length - a.length);
}

function listTextFiles(directory) {
    return walkFiles(directory)
        .map(toPosix)
        .filter(relativePath => TEXT_EXTENSIONS.has(path.posix.extname(relativePath).toLowerCase()));
}

function replaceMediaReferences(text, relativePath, textFile, mediaUrl) {
    const variants = getMediaReferenceVariants(relativePath, textFile);
    const replacementValues = [];
    let nextText = text;
    let replacements = 0;

    for (const variant of variants) {
        const isGalleryDataBasename = textFile === 'gallery-data.js'
            && variant === path.posix.basename(relativePath);
        const pattern = isGalleryDataBasename
            ? new RegExp(`([\"'])${escapeRegExp(variant)}\\1`, 'g')
            : new RegExp(`${escapeRegExp(variant)}(\\?[^\\s\"'<>)]*)?`, 'g');

        nextText = nextText.replace(pattern, (match, quoteOrSuffix) => {
            const suffix = isGalleryDataBasename ? '' : (quoteOrSuffix || '');
            const token = `__PORTFOLIO_MEDIA_REWRITE_${replacementValues.length}__`;
            replacementValues.push(`${mediaUrl}${suffix}`);
            replacements += 1;
            return isGalleryDataBasename ? `${quoteOrSuffix}${token}${quoteOrSuffix}` : token;
        });
    }

    replacementValues.forEach((replacement, index) => {
        nextText = nextText.replace(`__PORTFOLIO_MEDIA_REWRITE_${index}__`, replacement);
    });

    return { text: nextText, replacements };
}

function countLocalMediaReferences(text, relativePath, textFile) {
    return getMediaReferenceVariants(relativePath, textFile).reduce((count, variant) => {
        const isGalleryDataBasename = textFile === 'gallery-data.js'
            && variant === path.posix.basename(relativePath);
        const pattern = isGalleryDataBasename
            ? new RegExp(`([\"'])${escapeRegExp(variant)}\\1`, 'g')
            : new RegExp(`${escapeRegExp(variant)}(\\?[^\\s\"'<>)]*)?`, 'g');
        return count + [...text.matchAll(pattern)].length;
    }, 0);
}

function externalizeOversizedMedia({ distDir, expectedFiles }) {
    const origin = getPortfolioMediaOrigin();
    if (!origin) return [];

    const oversizedFiles = listOversizedVideoFiles(distDir, expectedFiles);
    const textFiles = listTextFiles(distDir);

    for (const { relativePath, bytes } of oversizedFiles) {
        const mediaUrl = buildPortfolioMediaUrl(origin, relativePath);
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
            throw new Error(`Oversized active video has no rewritable dist reference: ${relativePath}`);
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

    const oversizedFiles = listOversizedVideoFiles(rootDir, expectedFiles);
    const errors = [];
    const textFiles = listTextFiles(distDir);

    for (const { relativePath } of oversizedFiles) {
        const mediaUrl = buildPortfolioMediaUrl(origin, relativePath);
        const distMediaFile = path.join(distDir, relativePath.replaceAll('/', path.sep));
        if (fs.existsSync(distMediaFile)) {
            errors.push(`Externalized oversized video still exists in dist/: ${relativePath}`);
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
            errors.push(`Local oversized video reference remains in dist/: ${relativePath}`);
        }
    }

    return { oversizedFiles, errors };
}

module.exports = {
    PAGE_ASSET_LIMIT_BYTES,
    buildPortfolioMediaUrl,
    countLocalMediaReferences,
    encodeRelativePath,
    externalizeOversizedMedia,
    getMediaReferenceVariants,
    getPortfolioMediaOrigin,
    isVideoPath,
    listOversizedVideoFiles,
    listTextFiles,
    verifyExternalizedMedia
};
