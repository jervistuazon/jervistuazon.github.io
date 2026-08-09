'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { toPosix } = require('./dist-config');
const { listOversizedVideoFiles } = require('./dist-media');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_BUCKET = 'portfolio-media-production';
const DEFAULT_CACHE_CONTROL = 'public, max-age=31536000, immutable';

function parseOptions(argv) {
    return {
        all: argv.includes('--all') || process.env.R2_MEDIA_SYNC_ALL === '1',
        dryRun: argv.includes('--dry-run')
    };
}

function getChangedFiles() {
    const before = process.env.GITHUB_EVENT_BEFORE;
    const after = process.env.GITHUB_SHA || 'HEAD';

    // A missing/zero base is the first push or a manual run. In either case,
    // upload the complete oversized source-media inventory.
    if (!before || /^0+$/.test(before)) return null;

    const result = spawnSync('git', ['diff', '--name-only', '-z', before, after], {
        cwd: ROOT_DIR,
        encoding: 'buffer'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`git diff failed with exit code ${result.status}.`);
    }

    return new Set(result.stdout.toString('utf8').split('\0').filter(Boolean).map(toPosix));
}

function getOversizedVideos() {
    // Sync the complete source-media inventory, not only the files currently
    // referenced by a generated Pages build. This preserves inactive portfolio
    // videos in R2 for future gallery references and migration parity.
    return listOversizedVideoFiles(ROOT_DIR);
}

function runWranglerUpload({ bucket, relativePath, bytes }) {
    const absolutePath = path.join(ROOT_DIR, relativePath.replaceAll('/', path.sep));
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Media file does not exist: ${relativePath}`);
    }

    const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const objectPath = `${bucket}/${relativePath}`;
    const args = [
        '--yes',
        'wrangler@4',
        'r2',
        'object',
        'put',
        objectPath,
        '--file',
        absolutePath,
        '--remote',
        '--content-type',
        'video/mp4',
        '--cache-control',
        process.env.R2_MEDIA_CACHE_CONTROL || DEFAULT_CACHE_CONTROL
    ];

    console.log(`[R2] uploading ${relativePath} (${bytes} bytes)`);
    const result = spawnSync(npxCommand, args, {
        cwd: ROOT_DIR,
        env: process.env,
        stdio: 'inherit'
    });

    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`Wrangler upload failed for ${relativePath} with exit code ${result.status}.`);
    }
}

function main() {
    const options = parseOptions(process.argv.slice(2));
    const bucket = (process.env.R2_MEDIA_BUCKET || DEFAULT_BUCKET).trim();
    const inventory = getOversizedVideos();
    const changedFiles = options.all ? null : getChangedFiles();
    const selected = inventory.filter(file => !changedFiles || changedFiles.has(file.relativePath));

    if (selected.length === 0) {
        console.log('[R2] no oversized source-media changes to upload.');
        return;
    }

    console.log(`[R2] ${options.dryRun ? 'would upload' : 'will upload'} ${selected.length} file(s) to ${bucket}.`);
    selected.forEach(file => console.log(`  - ${file.relativePath} (${file.bytes} bytes)`));

    if (options.dryRun) return;

    if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error('CLOUDFLARE_ACCOUNT_ID is required for R2 media sync.');
    }
    if (!process.env.CLOUDFLARE_API_TOKEN) {
        throw new Error('CLOUDFLARE_API_TOKEN is required for R2 media sync.');
    }

    selected.forEach(file => runWranglerUpload({ bucket, ...file }));
    console.log(`[R2] uploaded ${selected.length} file(s) successfully.`);
}

try {
    main();
} catch (error) {
    console.error(`[R2] ${error.message}`);
    process.exitCode = 1;
}

