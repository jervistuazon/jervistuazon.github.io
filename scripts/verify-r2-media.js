'use strict';

const { buildPortfolioMediaUrl, listOversizedMediaFiles } = require('./dist-media');
const { expectedDistFiles } = require('./dist-config');

const ROOT_DIR = require('node:path').resolve(__dirname, '..');
const DEFAULT_MEDIA_ORIGIN = 'https://media.jervistuazon.com';
const DEFAULT_CANONICAL_ORIGIN = 'https://www.jervistuazon.com';
const DEFAULT_MAX_WAIT_MS = 10 * 60 * 1000;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_RANGE_END = 31;

function parseOptions(argv = [], environment = process.env) {
    const canonicalOrigin = String(environment.PORTFOLIO_CANONICAL_ORIGIN || DEFAULT_CANONICAL_ORIGIN).trim();
    return {
        ifPages: argv.includes('--if-pages'),
        mediaOrigin: String(environment.PORTFOLIO_MEDIA_ORIGIN || DEFAULT_MEDIA_ORIGIN).trim(),
        canonicalOrigin,
        deploymentOrigins: getDeploymentOrigins({ ...environment, PORTFOLIO_CANONICAL_ORIGIN: canonicalOrigin })
    };
}

function getDeploymentOrigins(environment = process.env) {
    const canonicalOrigin = String(environment.PORTFOLIO_CANONICAL_ORIGIN || DEFAULT_CANONICAL_ORIGIN).trim();
    const origins = [canonicalOrigin];
    const pagesUrl = String(environment.CF_PAGES_URL || '').trim();
    const pagesBranch = String(environment.CF_PAGES_BRANCH || '').trim();
    const isPreviewBranch = Boolean(pagesBranch) && pagesBranch !== 'main';
    if (pagesUrl && isPreviewBranch) {
        let previewOrigin;
        try {
            previewOrigin = new URL(pagesUrl).origin;
        } catch {
            throw new Error(`CF_PAGES_URL is not a valid URL: ${pagesUrl}`);
        }
        if (!origins.includes(previewOrigin)) origins.push(previewOrigin);
    }
    return origins;
}

function shouldRun(options, environment = process.env) {
    return !options.ifPages || environment.CF_PAGES === '1';
}

function getHeader(response, name) {
    if (!response || !response.headers) return '';
    if (typeof response.headers.get === 'function') return response.headers.get(name) || '';
    if (response.headers instanceof Map) {
        const wanted = name.toLowerCase();
        for (const [key, value] of response.headers.entries()) {
            if (String(key).toLowerCase() === wanted) return String(value);
        }
        return '';
    }
    const wanted = name.toLowerCase();
    const entry = Object.entries(response.headers).find(([key]) => key.toLowerCase() === wanted);
    return entry ? String(entry[1]) : '';
}

function normalizeContentType(value) {
    return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function parseContentRange(value) {
    const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/i.exec(String(value || '').trim());
    if (!match) return null;
    return {
        start: Number(match[1]),
        end: Number(match[2]),
        total: Number(match[3])
    };
}

function createRequest(fetchImpl, url, init, timeoutMs, timers = {}) {
    const AbortControllerImpl = timers.AbortController || globalThis.AbortController;
    const setTimer = timers.setTimeout || setTimeout;
    const clearTimer = timers.clearTimeout || clearTimeout;
    const controller = AbortControllerImpl ? new AbortControllerImpl() : null;
    const requestInit = controller ? { ...init, signal: controller.signal } : init;
    let timeoutId = null;

    if (controller && Number.isFinite(timeoutMs) && timeoutMs > 0) {
        timeoutId = setTimer(() => controller.abort(), timeoutMs);
    }

    return Promise.resolve()
        .then(() => fetchImpl(url, requestInit))
        .finally(() => {
            if (timeoutId !== null) clearTimer(timeoutId);
        });
}

function closeResponseBody(response) {
    if (response && response.body && typeof response.body.cancel === 'function') {
        return Promise.resolve(response.body.cancel()).catch(() => {});
    }
    return Promise.resolve();
}

function getMediaUrl(asset, mediaOrigin, urlBuilder = buildPortfolioMediaUrl) {
    return urlBuilder(mediaOrigin, asset.objectKey || asset.relativePath);
}

function validateHeadResponse(response, asset, canonicalOrigin) {
    const expectedType = normalizeContentType(asset.contentType);
    const actualType = normalizeContentType(getHeader(response, 'content-type'));
    const contentLength = Number(getHeader(response, 'content-length'));
    const allowOrigin = getHeader(response, 'access-control-allow-origin');

    if (response.status !== 200 || !response.ok) return `HEAD returned HTTP ${response.status}.`;
    if (contentLength !== Number(asset.bytes)) return `HEAD content-length ${contentLength} != ${asset.bytes}.`;
    if (actualType !== expectedType) return `HEAD content-type ${actualType || '(missing)'} != ${expectedType}.`;
    if (allowOrigin !== canonicalOrigin && allowOrigin !== '*') return `HEAD Access-Control-Allow-Origin ${allowOrigin || '(missing)'} != ${canonicalOrigin} or *.`;
    if (!/\bbytes\b/i.test(getHeader(response, 'accept-ranges'))) return 'HEAD response does not advertise byte ranges.';
    return null;
}

function validateRangeResponse(response, asset, canonicalOrigin, rangeEnd = DEFAULT_RANGE_END) {
    const expectedType = normalizeContentType(asset.contentType);
    const actualType = normalizeContentType(getHeader(response, 'content-type'));
    const allowOrigin = getHeader(response, 'access-control-allow-origin');
    const contentRange = parseContentRange(getHeader(response, 'content-range'));
    const expectedLength = rangeEnd + 1;

    if (response.status !== 206 || !response.ok) return `Range request returned HTTP ${response.status}.`;
    if (!contentRange || contentRange.start !== 0 || contentRange.end !== rangeEnd || contentRange.total !== Number(asset.bytes)) {
        return `Range Content-Range is invalid: ${getHeader(response, 'content-range') || '(missing)'}.`;
    }
    if (Number(getHeader(response, 'content-length')) !== expectedLength) {
        return `Range content-length ${getHeader(response, 'content-length') || '(missing)'} != ${expectedLength}.`;
    }
    if (actualType !== expectedType) return `Range content-type ${actualType || '(missing)'} != ${expectedType}.`;
    if (allowOrigin !== canonicalOrigin && allowOrigin !== '*') return `Range Access-Control-Allow-Origin ${allowOrigin || '(missing)'} != ${canonicalOrigin} or *.`;
    return null;
}

async function probeAsset(asset, {
    canonicalOrigin,
    deploymentOrigins = [canonicalOrigin],
    fetchImpl = globalThis.fetch,
    mediaOrigin,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    rangeEnd = DEFAULT_RANGE_END,
    urlBuilder = buildPortfolioMediaUrl,
    timers = {}
} = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('Global fetch is unavailable; cannot verify R2 media.');
    const url = getMediaUrl(asset, mediaOrigin, urlBuilder);
    const origins = [...new Set((deploymentOrigins && deploymentOrigins.length ? deploymentOrigins : [canonicalOrigin]).filter(Boolean))];

    for (const origin of origins) {
        const originHeaders = { Origin: origin };
        try {
            const head = await createRequest(fetchImpl, url, {
                method: 'HEAD',
                headers: originHeaders,
                cache: 'no-store'
            }, requestTimeoutMs, timers);
            const headError = validateHeadResponse(head, asset, origin);
            await closeResponseBody(head);
            if (headError) return { ready: false, url, origin, reason: headError };

            const range = await createRequest(fetchImpl, url, {
                method: 'GET',
                headers: {
                    ...originHeaders,
                    Range: `bytes=0-${rangeEnd}`
                },
                cache: 'no-store'
            }, requestTimeoutMs, timers);
            const rangeError = validateRangeResponse(range, asset, origin, rangeEnd);
            await closeResponseBody(range);
            if (rangeError) return { ready: false, url, origin, reason: rangeError };
        } catch (error) {
            return {
                ready: false,
                url,
                origin,
                reason: error && error.message ? error.message : String(error)
            };
        }
    }

    return { ready: true, url, origins };
}

function defaultSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function formatAsset(asset) {
    return `${asset.objectKey || asset.relativePath} (${asset.bytes} bytes, ${asset.contentType})`;
}

function collectExpectedOversizedMedia({
    rootDir = ROOT_DIR,
    expectedFiles = expectedDistFiles(rootDir),
    listMedia = listOversizedMediaFiles
} = {}) {
    return listMedia(rootDir, expectedFiles);
}

async function waitForMediaReadiness(assets, {
    canonicalOrigin = DEFAULT_CANONICAL_ORIGIN,
    deploymentOrigins = [canonicalOrigin],
    fetchImpl = globalThis.fetch,
    mediaOrigin = DEFAULT_MEDIA_ORIGIN,
    maxAttempts = Infinity,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    now = () => Date.now(),
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    rangeEnd = DEFAULT_RANGE_END,
    sleep = defaultSleep,
    urlBuilder = buildPortfolioMediaUrl,
    timers = {},
    logger = message => console.log(message)
} = {}) {
    const selected = [...assets];
    if (selected.length === 0) return { assets: selected, attempts: 0, results: [] };

    const startedAt = now();
    let attempts = 0;
    let lastResults = [];
    while (attempts < maxAttempts && now() - startedAt <= maxWaitMs) {
        attempts += 1;
        lastResults = await Promise.all(selected.map(asset => probeAsset(asset, {
            canonicalOrigin,
            deploymentOrigins,
            fetchImpl,
            mediaOrigin,
            requestTimeoutMs,
            rangeEnd,
            urlBuilder,
            timers
        })));
        if (lastResults.every(result => result.ready)) {
            return { assets: selected, attempts, results: lastResults };
        }

        const failures = lastResults
            .filter(result => !result.ready)
            .map(result => `${result.url} (${result.origin || canonicalOrigin}): ${result.reason}`)
            .join(' | ');
        logger(`[R2] media readiness attempt ${attempts} pending: ${failures}`);
        if (attempts >= maxAttempts || now() - startedAt >= maxWaitMs) break;
        await sleep(Math.min(DEFAULT_POLL_INTERVAL_MS, Math.max(0, maxWaitMs - (now() - startedAt))));
    }

    const summary = lastResults
        .filter(result => !result.ready)
        .map(result => `${result.url} (${result.origin || canonicalOrigin}): ${result.reason}`)
        .join('\n');
    throw new Error(
        `R2 media is not ready after ${attempts} attempt(s). `
        + 'The trusted "Sync oversized portfolio media to R2" workflow must finish before Pages can deploy. '
        + 'For a preview branch, dispatch that workflow from the branch or publish the media on main first.\n'
        + summary
    );
}

async function verifyMedia({
    argv = [],
    environment = process.env,
    rootDir = ROOT_DIR,
    expectedFiles,
    fetchImpl = globalThis.fetch,
    listMedia = listOversizedMediaFiles,
    expectedFilesProvider = expectedDistFiles,
    logger = message => console.log(message),
    now,
    sleep,
    maxAttempts,
    maxWaitMs,
    requestTimeoutMs,
    rangeEnd,
    timers,
    urlBuilder = buildPortfolioMediaUrl
} = {}) {
    const options = parseOptions(argv, environment);
    if (!shouldRun(options, environment)) {
        logger('[R2] media readiness gate skipped outside Cloudflare Pages.');
        return { skipped: true, assets: [], attempts: 0 };
    }

    const files = expectedFiles || expectedFilesProvider(rootDir);
    const assets = collectExpectedOversizedMedia({ rootDir, expectedFiles: files, listMedia });
    if (assets.length === 0) {
        logger('[R2] no oversized published media requires readiness verification.');
        return { skipped: false, assets, attempts: 0, results: [] };
    }

    logger(`[R2] verifying ${assets.length} oversized published media object(s) before Pages deployment.`);
    assets.forEach(asset => logger(`  - ${formatAsset(asset)}`));
    const result = await waitForMediaReadiness(assets, {
        canonicalOrigin: options.canonicalOrigin,
        deploymentOrigins: options.deploymentOrigins,
        fetchImpl,
        mediaOrigin: options.mediaOrigin,
        maxAttempts,
        maxWaitMs,
        now,
        requestTimeoutMs,
        rangeEnd,
        sleep,
        timers,
        urlBuilder,
        logger
    });
    logger(`[R2] all oversized media is ready after ${result.attempts} attempt(s).`);
    return { skipped: false, ...result };
}

async function main(argv = process.argv.slice(2)) {
    await verifyMedia({ argv });
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[R2] ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_CANONICAL_ORIGIN,
    DEFAULT_MEDIA_ORIGIN,
    DEFAULT_MAX_WAIT_MS,
    DEFAULT_POLL_INTERVAL_MS,
    DEFAULT_RANGE_END,
    DEFAULT_REQUEST_TIMEOUT_MS,
    collectExpectedOversizedMedia,
    createRequest,
    getHeader,
    getDeploymentOrigins,
    getMediaUrl,
    main,
    normalizeContentType,
    parseContentRange,
    parseOptions,
    probeAsset,
    shouldRun,
    validateHeadResponse,
    validateRangeResponse,
    verifyMedia,
    waitForMediaReadiness
};
