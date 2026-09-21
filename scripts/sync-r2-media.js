'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { toPosix } = require('./dist-config');
const {
    getMediaContentType,
    listOversizedMediaFiles
} = require('./dist-media');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_BUCKET = 'portfolio-media-production';
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const RECONCILE_TRIGGER_FILES = new Set([
    '.github/workflows/sync-r2-media.yml',
    'scripts/dist-config.js',
    'scripts/dist-media.js',
    'scripts/sync-r2-media.js'
]);

function parseOptions(argv = [], environment = process.env) {
    return {
        all: argv.includes('--all') || environment.R2_MEDIA_SYNC_ALL === '1',
        dryRun: argv.includes('--dry-run')
    };
}

function commandRunner(command, args, options) {
    return spawnSync(command, args, options);
}

function getChangedFiles({
    environment = process.env,
    rootDir = ROOT_DIR,
    runner = commandRunner
} = {}) {
    const before = environment.GITHUB_EVENT_BEFORE;
    const after = environment.GITHUB_SHA || 'HEAD';

    // A missing/zero base is the first push or a manual dispatch. Reconcile
    // the complete inventory in both cases so missed objects are backfilled.
    if (!before || /^0+$/.test(before)) return null;

    const result = runner('git', ['diff', '--name-only', '-z', before, after], {
        cwd: rootDir,
        encoding: 'buffer',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`git diff failed with exit code ${result.status}.`);
    }

    return new Set(result.stdout.toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map(toPosix));
}

function shouldReconcileAll(changedFiles, environment = process.env) {
    if (environment.GITHUB_EVENT_NAME === 'workflow_dispatch') return true;
    if (!changedFiles) return true;
    return [...changedFiles].some(file => RECONCILE_TRIGGER_FILES.has(toPosix(file)));
}

function getObjectKey(file) {
    // The shared inventory supplies hashed immutable keys for non-video media.
    // Keep the relative path fallback for old callers and existing video keys.
    return file.objectKey || file.relativePath;
}

function getAbsoluteMediaPath(rootDir, relativePath) {
    const resolvedRoot = path.resolve(rootDir);
    const resolvedFile = path.resolve(rootDir, relativePath.replaceAll('/', path.sep));
    if (resolvedFile === resolvedRoot || !resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
        throw new Error(`Refusing to access media outside the repository: ${relativePath}`);
    }
    return resolvedFile;
}

function getEndpoint(accountId) {
    return `https://${accountId}.r2.cloudflarestorage.com`;
}

function requireCredentials(environment = process.env) {
    const required = [
        'CLOUDFLARE_ACCOUNT_ID',
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY'
    ];
    const missing = required.filter(name => !String(environment[name] || '').trim());
    if (missing.length) {
        throw new Error(`Missing required R2 credential environment variable(s): ${missing.join(', ')}.`);
    }
}

function getAwsCommand() {
    return process.platform === 'win32' ? 'aws.exe' : 'aws';
}

function getAwsEnvironment(environment) {
    return {
        ...environment,
        AWS_EC2_METADATA_DISABLED: 'true'
    };
}

function runAws(commandArgs, {
    rootDir = ROOT_DIR,
    environment = process.env,
    runner = commandRunner
} = {}) {
    const result = runner(getAwsCommand(), commandArgs, {
        cwd: rootDir,
        env: getAwsEnvironment(environment),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });

    if (result.error) throw result.error;
    return result;
}

function isMissingObjectResult(result) {
    if (!result || result.status === 0) return false;
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    return /(?:notfound|nosuchkey|not exist|status code:\s*404|\b404\b)/i.test(output);
}

function parseHeadObject(result, objectKey) {
    if (result.status === 0) {
        try {
            return JSON.parse(result.stdout || '{}');
        } catch {
            throw new Error(`R2 head-object returned invalid JSON for ${objectKey}.`);
        }
    }

    if (isMissingObjectResult(result)) return null;
    throw new Error(`R2 head-object failed for ${objectKey} with exit code ${result.status}.`);
}

function headObject({
    accountId,
    bucket,
    objectKey,
    rootDir = ROOT_DIR,
    environment = process.env,
    runner = commandRunner
}) {
    const result = runAws([
        's3api',
        'head-object',
        '--bucket',
        bucket,
        '--key',
        objectKey,
        '--endpoint-url',
        getEndpoint(accountId),
        '--region',
        'auto',
        '--no-cli-pager',
        '--output',
        'json'
    ], { rootDir, environment, runner });

    return parseHeadObject(result, objectKey);
}

function hashFile(filePath) {
    return new Promise((resolve, reject) => {
        const sha256 = crypto.createHash('sha256');
        const md5 = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);

        stream.on('data', chunk => {
            sha256.update(chunk);
            md5.update(chunk);
        });
        stream.on('error', reject);
        stream.on('end', () => resolve({
            sha256: sha256.digest('hex'),
            md5: md5.digest('hex')
        }));
    });
}

function normalizeContentType(value) {
    return String(value || '').split(';', 1)[0].trim().toLowerCase();
}

function getMetadataValue(metadata, names) {
    if (!metadata || typeof metadata !== 'object') return '';
    for (const name of names) {
        const value = metadata[name] ?? metadata[name.toLowerCase()] ?? metadata[name.toUpperCase()];
        if (value) return String(value).trim().toLowerCase();
    }
    return '';
}

function getObjectKeyHash(objectKey) {
    const match = /\.([0-9a-f]{16})\.[^./]+$/i.exec(toPosix(objectKey));
    return match ? match[1].toLowerCase() : '';
}

function compareExistingObject(file, objectKey, head, digests) {
    const expectedType = normalizeContentType(file.contentType || getMediaContentType(file.relativePath));
    const actualType = normalizeContentType(head.ContentType);
    if (Number(head.ContentLength) !== Number(file.bytes)) {
        return { matches: false, reason: `size ${head.ContentLength} != ${file.bytes}` };
    }
    if (actualType !== expectedType) {
        return { matches: false, reason: `content type ${head.ContentType || '(missing)'} != ${file.contentType}` };
    }

    const metadataHash = getMetadataValue(head.Metadata, ['sha256', 'content-sha256']);
    if (metadataHash && metadataHash !== digests.sha256.toLowerCase()) {
        return { matches: false, reason: 'sha256 metadata does not match the local file' };
    }

    const keyHash = getObjectKeyHash(objectKey);
    if (keyHash && !digests.sha256.toLowerCase().startsWith(keyHash)) {
        return { matches: false, reason: 'immutable object-key hash does not match the local file' };
    }

    const etag = String(head.ETag || '').replace(/^"|"$/g, '').toLowerCase();
    if (!metadataHash && !keyHash && /^[0-9a-f]{32}$/.test(etag) && etag !== digests.md5.toLowerCase()) {
        return { matches: false, reason: 'ETag does not match the local file' };
    }

    if (!metadataHash && !keyHash && !/^[0-9a-f]{32}$/.test(etag)) {
        return { matches: false, reason: 'existing object has no verifiable immutable content hash' };
    }

    return { matches: true, reason: 'size, content type, and immutable content identity match' };
}

function buildUploadArgs({ bucket, objectKey, absolutePath, contentType, cacheControl, sha256, accountId }) {
    return [
        's3',
        'cp',
        absolutePath,
        `s3://${bucket}/${objectKey}`,
        '--endpoint-url',
        getEndpoint(accountId),
        '--region',
        'auto',
        '--content-type',
        contentType,
        '--cache-control',
        cacheControl,
        '--metadata',
        `sha256=${sha256}`,
        '--only-show-errors',
        '--no-progress'
    ];
}

function uploadObject({
    accountId,
    bucket,
    cacheControl,
    file,
    objectKey,
    digests,
    rootDir = ROOT_DIR,
    environment = process.env,
    runner = commandRunner
}) {
    const absolutePath = getAbsoluteMediaPath(rootDir, file.relativePath);
    if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
        throw new Error(`Media file does not exist: ${file.relativePath}`);
    }

    const result = runAws(buildUploadArgs({
        accountId,
        bucket,
        objectKey,
        absolutePath,
        contentType: file.contentType || getMediaContentType(file.relativePath),
        cacheControl,
        sha256: digests.sha256
    }), { rootDir, environment, runner });

    if (result.status !== 0) {
        throw new Error(`AWS S3 multipart upload failed for ${objectKey} with exit code ${result.status}.`);
    }
}

function formatBytes(bytes) {
    return `${(Number(bytes) / 1024 / 1024).toFixed(2)} MiB`;
}

function logPlan(selected, { bucket, dryRun }, logger) {
    logger(`[R2] ${dryRun ? 'would reconcile' : 'reconciling'} ${selected.length} oversized published asset(s) to ${bucket}.`);
    selected.forEach(file => logger(`  - ${file.relativePath} -> ${getObjectKey(file)} (${formatBytes(file.bytes)}, ${file.contentType || getMediaContentType(file.relativePath)})`));
}

async function syncMedia({
    argv = [],
    environment = process.env,
    rootDir = ROOT_DIR,
    logger = message => console.log(message),
    inventory = null,
    changedFiles = undefined,
    listMedia = listOversizedMediaFiles,
    runner = commandRunner,
    gitRunner = commandRunner,
    hash = hashFile
} = {}) {
    const options = parseOptions(argv, environment);
    const bucket = String(environment.R2_MEDIA_BUCKET || DEFAULT_BUCKET).trim();
    const allChangedFiles = options.all
        ? null
        : changedFiles === undefined
            ? getChangedFiles({ environment, rootDir, runner: gitRunner })
            : changedFiles;
    const reconcileAll = options.all || shouldReconcileAll(allChangedFiles, environment);
    // Always let the shared inventory enforce the published runtime boundary.
    // Filtering raw changed paths first could accidentally include authoring
    // files that happen to be oversized.
    const sourceInventory = inventory || listMedia(rootDir, null);
    const selected = reconcileAll
        ? sourceInventory
        : sourceInventory.filter(file => allChangedFiles && allChangedFiles.has(toPosix(file.relativePath)));

    if (selected.length === 0) {
        logger('[R2] no oversized published media requires reconciliation.');
        return { selected, uploaded: [], skipped: [] };
    }

    logPlan(selected, { bucket, dryRun: options.dryRun }, logger);
    if (options.dryRun) return { selected, uploaded: [], skipped: selected };

    requireCredentials(environment);
    const accountId = String(environment.CLOUDFLARE_ACCOUNT_ID).trim();
    const cacheControl = String(environment.R2_MEDIA_CACHE_CONTROL || DEFAULT_CACHE_CONTROL).trim();
    const uploaded = [];
    const skipped = [];

    for (const file of selected) {
        const objectKey = getObjectKey(file);
        const head = headObject({ accountId, bucket, objectKey, rootDir, environment, runner });
        const absolutePath = getAbsoluteMediaPath(rootDir, file.relativePath);
        const digests = await hash(absolutePath);

        if (head) {
            const comparison = compareExistingObject(file, objectKey, head, digests);
            if (!comparison.matches) {
                throw new Error(`Refusing to overwrite immutable R2 object ${objectKey}: ${comparison.reason}.`);
            }
            logger(`[R2] skipped existing ${objectKey} (${comparison.reason}).`);
            skipped.push({ ...file, objectKey });
            continue;
        }

        uploadObject({ accountId, bucket, cacheControl, file, objectKey, digests, rootDir, environment, runner });
        logger(`[R2] uploaded ${objectKey} (${formatBytes(file.bytes)}, ${file.contentType || getMediaContentType(file.relativePath)}).`);
        uploaded.push({ ...file, objectKey });
    }

    logger(`[R2] reconciliation complete: ${uploaded.length} uploaded, ${skipped.length} already present.`);
    return { selected, uploaded, skipped };
}

async function main(argv = process.argv.slice(2)) {
    await syncMedia({ argv });
}

if (require.main === module) {
    main().catch(error => {
        console.error(`[R2] ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    DEFAULT_BUCKET,
    DEFAULT_CACHE_CONTROL,
    RECONCILE_TRIGGER_FILES,
    buildUploadArgs,
    compareExistingObject,
    getAbsoluteMediaPath,
    getAwsCommand,
    getChangedFiles,
    getEndpoint,
    getObjectKey,
    getObjectKeyHash,
    hashFile,
    headObject,
    isMissingObjectResult,
    main,
    parseHeadObject,
    parseOptions,
    requireCredentials,
    shouldReconcileAll,
    syncMedia,
    uploadObject
};
