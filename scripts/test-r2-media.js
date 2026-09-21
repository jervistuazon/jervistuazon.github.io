'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const sync = require('./sync-r2-media');
const verify = require('./verify-r2-media');

const SHA256 = '0123456789abcdef'.repeat(4);
const MD5 = 'abcdef0123456789'.repeat(2);

function response(status, headers = {}) {
    return {
        status,
        ok: status >= 200 && status < 300,
        headers: new Map(Object.entries(headers)),
        body: { cancel: async () => {} }
    };
}

function makeFixture(t) {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-r2-media-'));
    t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
    const relativePath = 'presentation/demo/model.glb';
    const absolutePath = path.join(rootDir, relativePath.replaceAll('/', path.sep));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, 'fixture-glb');
    return { rootDir, relativePath, absolutePath };
}

function makeAsset(fixture, overrides = {}) {
    return {
        relativePath: fixture.relativePath,
        objectKey: 'presentation/demo/model.0123456789abcdef.glb',
        bytes: 11,
        contentType: 'model/gltf-binary',
        ...overrides
    };
}

function credentials() {
    return {
        CLOUDFLARE_ACCOUNT_ID: 'account-test',
        AWS_ACCESS_KEY_ID: 'access-test',
        AWS_SECRET_ACCESS_KEY: 'secret-test',
        R2_MEDIA_BUCKET: 'portfolio-media-test'
    };
}

function awsRunner({ head = null, uploadStatus = 0, calls = [] } = {}) {
    return (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === 's3api' && args[1] === 'head-object') {
            if (head) return { status: 0, stdout: JSON.stringify(head), stderr: '' };
            return { status: 1, stdout: '', stderr: 'An error occurred (404) when calling the HeadObject operation: Not Found' };
        }
        if (args[0] === 's3' && args[1] === 'cp') {
            return { status: uploadStatus, stdout: '', stderr: '' };
        }
        throw new Error(`Unexpected AWS command in test: ${args.join(' ')}`);
    };
}

test('dry-run prints the immutable object plan without credentials or AWS calls', async t => {
    const fixture = makeFixture(t);
    const asset = makeAsset(fixture);
    const logs = [];
    let calls = 0;

    const result = await sync.syncMedia({
        argv: ['--dry-run'],
        environment: {},
        rootDir: fixture.rootDir,
        inventory: [asset],
        changedFiles: null,
        logger: message => logs.push(message),
        runner: () => {
            calls += 1;
            throw new Error('AWS must not run during dry-run');
        }
    });

    assert.equal(result.selected.length, 1);
    assert.equal(calls, 0);
    assert.match(logs.join('\n'), /model\.0123456789abcdef\.glb/);
    assert.match(logs.join('\n'), /model\/gltf-binary/);
});

test('missing object uploads with correct MIME, immutable metadata, and AWS s3 multipart path', async t => {
    const fixture = makeFixture(t);
    const asset = makeAsset(fixture);
    const calls = [];
    const result = await sync.syncMedia({
        environment: credentials(),
        rootDir: fixture.rootDir,
        inventory: [asset],
        changedFiles: null,
        hash: async () => ({ sha256: SHA256, md5: MD5 }),
        runner: awsRunner({ calls }),
        logger: () => {}
    });

    assert.equal(result.uploaded.length, 1);
    assert.equal(result.skipped.length, 0);
    assert.equal(calls.length, 2);
    const upload = calls[1].args;
    assert.deepEqual(upload.slice(0, 2), ['s3', 'cp']);
    assert.ok(upload.includes('--content-type'));
    assert.equal(upload[upload.indexOf('--content-type') + 1], 'model/gltf-binary');
    assert.equal(upload[upload.indexOf('--metadata') + 1], `sha256=${SHA256}`);
    assert.equal(upload[3], 's3://portfolio-media-test/presentation/demo/model.0123456789abcdef.glb');
});

test('matching immutable object is skipped without overwriting it', async t => {
    const fixture = makeFixture(t);
    const asset = makeAsset(fixture);
    const calls = [];
    const result = await sync.syncMedia({
        environment: credentials(),
        rootDir: fixture.rootDir,
        inventory: [asset],
        changedFiles: null,
        hash: async () => ({ sha256: SHA256, md5: MD5 }),
        runner: awsRunner({
            calls,
            head: {
                ContentLength: asset.bytes,
                ContentType: asset.contentType,
                Metadata: { sha256: SHA256 },
                ETag: '"not-used-for-sha256-metadata"'
            }
        }),
        logger: () => {}
    });

    assert.equal(result.uploaded.length, 0);
    assert.equal(result.skipped.length, 1);
    assert.equal(calls.length, 1);
});

test('mismatched immutable object fails closed instead of overwriting', async t => {
    const fixture = makeFixture(t);
    const asset = makeAsset(fixture);
    const calls = [];

    await assert.rejects(
        sync.syncMedia({
            environment: credentials(),
            rootDir: fixture.rootDir,
            inventory: [asset],
            changedFiles: null,
            hash: async () => ({ sha256: SHA256, md5: MD5 }),
            runner: awsRunner({
                calls,
                head: {
                    ContentLength: asset.bytes,
                    ContentType: 'application/octet-stream',
                    Metadata: { sha256: SHA256 }
                }
            }),
            logger: () => {}
        }),
        /Refusing to overwrite immutable R2 object/,
    );

    assert.equal(calls.length, 1);
});

test('credentials are validated before any remote head or upload call', async t => {
    const fixture = makeFixture(t);
    let calls = 0;

    await assert.rejects(
        sync.syncMedia({
            environment: {},
            rootDir: fixture.rootDir,
            inventory: [makeAsset(fixture)],
            changedFiles: null,
            runner: () => {
                calls += 1;
                throw new Error('remote call should not happen');
            },
            logger: () => {}
        }),
        /Missing required R2 credential environment variable\(s\)/,
    );
    assert.equal(calls, 0);
});

test('workflow and inventory implementation changes force a complete reconciliation', async () => {
    const calls = [];
    const asset = { relativePath: 'presentation/demo/model.glb', bytes: 30, contentType: 'model/gltf-binary', objectKey: 'presentation/demo/model.0123456789abcdef.glb' };
    const changedFiles = new Set(['scripts/dist-media.js']);
    const logs = [];

    await sync.syncMedia({
        argv: ['--dry-run'],
        environment: {},
        rootDir: process.cwd(),
        changedFiles,
        listMedia: (_rootDir, relativeFiles) => {
            calls.push(relativeFiles);
            return [asset];
        },
        logger: message => logs.push(message)
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0], null);
    assert.match(logs[0], /would reconcile 1/);
});

test('--all reconciles without consulting an unavailable Git history base', async () => {
    let gitCalls = 0;
    let inventoryCalls = 0;
    const asset = {
        relativePath: 'presentation/demo/model.glb',
        bytes: 30,
        contentType: 'model/gltf-binary',
        objectKey: 'presentation/demo/model.0123456789abcdef.glb'
    };

    const result = await sync.syncMedia({
        argv: ['--all', '--dry-run'],
        environment: { GITHUB_EVENT_BEFORE: 'invalid-before', GITHUB_SHA: 'invalid-after' },
        changedFiles: undefined,
        listMedia: (_rootDir, relativeFiles) => {
            inventoryCalls += 1;
            assert.equal(relativeFiles, null);
            return [asset];
        },
        gitRunner: () => {
            gitCalls += 1;
            throw new Error('git history should not be consulted for --all');
        },
        logger: () => {}
    });

    assert.equal(result.selected.length, 1);
    assert.equal(gitCalls, 0);
    assert.equal(inventoryCalls, 1);
});

test('R2 readiness gate validates HEAD, CORS, MIME, and a 32-byte range', async () => {
    const asset = {
        relativePath: 'presentation/demo/model.glb',
        objectKey: 'presentation/demo/model.0123456789abcdef.glb',
        bytes: 58,
        contentType: 'model/gltf-binary'
    };
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        if (init.method === 'HEAD') {
            return response(200, {
                'content-length': '58',
                'content-type': 'model/gltf-binary',
                'accept-ranges': 'bytes',
                'access-control-allow-origin': 'https://www.jervistuazon.com'
            });
        }
        return response(206, {
            'content-length': '32',
            'content-type': 'model/gltf-binary',
            'content-range': 'bytes 0-31/58',
            'access-control-allow-origin': 'https://www.jervistuazon.com'
        });
    };

    const result = await verify.waitForMediaReadiness([asset], {
        fetchImpl,
        mediaOrigin: 'https://media.example.test',
        canonicalOrigin: 'https://www.jervistuazon.com',
        maxAttempts: 1,
        maxWaitMs: 100,
        now: () => 0,
        sleep: async () => {},
        urlBuilder: (origin, key) => `${origin}/${key}`
    });

    assert.equal(result.attempts, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.headers.Origin, 'https://www.jervistuazon.com');
    assert.equal(calls[1].init.headers.Range, 'bytes=0-31');
});

test('R2 readiness gate retries a missing object and then succeeds', async () => {
    const asset = {
        relativePath: 'presentation/demo/model.glb',
        objectKey: 'presentation/demo/model.0123456789abcdef.glb',
        bytes: 58,
        contentType: 'model/gltf-binary'
    };
    let headCalls = 0;
    const fetchImpl = async (_url, init) => {
        if (init.method === 'HEAD' && headCalls++ === 0) return response(404, {});
        if (init.method === 'HEAD') {
            return response(200, {
                'content-length': '58',
                'content-type': 'model/gltf-binary',
                'accept-ranges': 'bytes',
                'access-control-allow-origin': 'https://www.jervistuazon.com'
            });
        }
        return response(206, {
            'content-length': '32',
            'content-type': 'model/gltf-binary',
            'content-range': 'bytes 0-31/58',
            'access-control-allow-origin': 'https://www.jervistuazon.com'
        });
    };

    const result = await verify.waitForMediaReadiness([asset], {
        fetchImpl,
        mediaOrigin: 'https://media.example.test',
        canonicalOrigin: 'https://www.jervistuazon.com',
        maxAttempts: 2,
        maxWaitMs: 100,
        now: () => 0,
        sleep: async () => {},
        urlBuilder: (origin, key) => `${origin}/${key}`
    });

    assert.equal(result.attempts, 2);
});

test('R2 readiness gate fails with dispatch guidance when upload never appears', async () => {
    const asset = {
        relativePath: 'presentation/demo/model.glb',
        objectKey: 'presentation/demo/model.0123456789abcdef.glb',
        bytes: 58,
        contentType: 'model/gltf-binary'
    };

    await assert.rejects(
        verify.waitForMediaReadiness([asset], {
            fetchImpl: async () => response(404, {}),
            mediaOrigin: 'https://media.example.test',
            canonicalOrigin: 'https://www.jervistuazon.com',
            maxAttempts: 1,
            maxWaitMs: 100,
            now: () => 0,
            sleep: async () => {},
            urlBuilder: (origin, key) => `${origin}/${key}`
        }),
        /dispatch that workflow from the branch or publish the media on main first/,
    );
});

test('if-pages gate skips locally unless Cloudflare Pages sets CF_PAGES=1', async () => {
    let fetched = false;
    const result = await verify.verifyMedia({
        argv: ['--if-pages'],
        environment: {},
        fetchImpl: async () => {
            fetched = true;
            throw new Error('fetch should not run');
        },
        expectedFilesProvider: () => {
            throw new Error('inventory should not be collected');
        },
        logger: () => {}
    });

    assert.equal(result.skipped, true);
    assert.equal(fetched, false);
});

test('credentialless wildcard CORS is accepted for HEAD and byte-range responses', () => {
    const asset = {
        bytes: 58,
        contentType: 'model/gltf-binary'
    };
    const headError = verify.validateHeadResponse(response(200, {
        'content-length': '58',
        'content-type': 'model/gltf-binary',
        'accept-ranges': 'bytes',
        'access-control-allow-origin': '*'
    }), asset, 'https://www.jervistuazon.com');
    const rangeError = verify.validateRangeResponse(response(206, {
        'content-length': '32',
        'content-type': 'model/gltf-binary',
        'content-range': 'bytes 0-31/58',
        'access-control-allow-origin': '*'
    }), asset, 'https://www.jervistuazon.com');

    assert.equal(headError, null);
    assert.equal(rangeError, null);
});

test('Pages preview origin is included in the CORS readiness checks', async () => {
    const asset = {
        relativePath: 'presentation/demo/model.glb',
        objectKey: 'presentation/demo/model.0123456789abcdef.glb',
        bytes: 58,
        contentType: 'model/gltf-binary'
    };
    const seenOrigins = [];
    const fetchImpl = async (_url, init) => {
        seenOrigins.push(init.headers.Origin);
        if (init.method === 'HEAD') {
            return response(200, {
                'content-length': '58',
                'content-type': 'model/gltf-binary',
                'accept-ranges': 'bytes',
                'access-control-allow-origin': '*'
            });
        }
        return response(206, {
            'content-length': '32',
            'content-type': 'model/gltf-binary',
            'content-range': 'bytes 0-31/58',
            'access-control-allow-origin': '*'
        });
    };

    const result = await verify.verifyMedia({
        argv: ['--if-pages'],
        environment: {
            CF_PAGES: '1',
            CF_PAGES_BRANCH: 'preview',
            CF_PAGES_URL: 'https://preview.example.pages.dev/presentation/demo/',
            PORTFOLIO_CANONICAL_ORIGIN: 'https://www.jervistuazon.com'
        },
        expectedFiles: new Set(),
        listMedia: () => [asset],
        fetchImpl,
        maxAttempts: 1,
        maxWaitMs: 100,
        now: () => 0,
        sleep: async () => {},
        logger: () => {},
        urlBuilder: (origin, key) => `${origin}/${key}`
    });

    assert.equal(result.attempts, 1);
    assert.deepEqual([...new Set(seenOrigins)], [
        'https://www.jervistuazon.com',
        'https://preview.example.pages.dev'
    ]);
});

test('production Pages URL does not add the deployment hostname to CORS checks', () => {
    assert.deepEqual(
        verify.getDeploymentOrigins({
            CF_PAGES_BRANCH: 'main',
            CF_PAGES_URL: 'https://production.example.pages.dev',
            PORTFOLIO_CANONICAL_ORIGIN: 'https://www.jervistuazon.com'
        }),
        ['https://www.jervistuazon.com']
    );
});
