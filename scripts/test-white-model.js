'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MAX_BUFFER_BYTES, readGlb, splitGlb } = require('./prepare-white-model');

function fixture(overrides = {}) {
    const document = {
        asset: { version: '2.0' },
        buffers: [{ byteLength: 12 }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: 3 },
            { buffer: 0, byteOffset: 3, byteLength: 4 },
            { buffer: 0, byteOffset: 7, byteLength: 5 }
        ],
        nodes: [{ name: 'Preserved node', translation: [1, 2, 3] }],
        ...overrides
    };
    let json = Buffer.from(JSON.stringify(document));
    json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
    const binary = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const bytes = Buffer.alloc(28 + json.length + binary.length);
    [0x46546c67, 2, bytes.length, json.length, 0x4e4f534a].forEach((v, i) => bytes.writeUInt32LE(v, i * 4));
    json.copy(bytes, 20);
    bytes.writeUInt32LE(binary.length, 20 + json.length);
    bytes.writeUInt32LE(0x004e4942, 24 + json.length);
    binary.copy(bytes, 28 + json.length);
    return bytes;
}

function assertPreserved(source, document, buffers) {
    const { document: original, binary } = readGlb(source);
    assert.equal(document.bufferViews.length, original.bufferViews.length);
    for (const key of Object.keys(original)) {
        if (!['buffers', 'bufferViews'].includes(key)) assert.deepEqual(document[key], original[key], key);
    }
    document.bufferViews.forEach((view, index) => {
        const before = original.bufferViews[index];
        const { buffer: oldBuffer, byteOffset: oldOffset, ...oldMetadata } = before;
        const { buffer, byteOffset, ...metadata } = view;
        assert.deepEqual(metadata, oldMetadata, `view ${index} metadata`);
        assert.equal(byteOffset % 4, 0, `view ${index} alignment`);
        assert.deepEqual(
            buffers[buffer].subarray(byteOffset, byteOffset + view.byteLength),
            binary.subarray(oldOffset || 0, (oldOffset || 0) + before.byteLength),
            `view ${index} bytes`
        );
    });
}

test('split: preserves every byte and scene property across aligned buffers', () => {
    const source = fixture();
    const output = splitGlb(source, 8);
    assert.deepEqual(output.buffers.map(b => b.length), [8, 5]);
    assertPreserved(source, output.document, output.buffers);
    assert.deepEqual(splitGlb(source, 8), output, 'Output is deterministic');
});

test('split: rejects corrupt containers and out-of-bounds views', () => {
    assert.throws(() => splitGlb(fixture().subarray(0, 19)), /Truncated/);
    assert.throws(() => splitGlb(fixture().subarray(0, -1)), /length mismatch/);
    assert.throws(() => splitGlb(fixture({ bufferViews: [{ buffer: 0, byteOffset: 10, byteLength: 4 }] })), /exceeds source/);
});

test('split: rejects unsupported buffers and oversized indivisible views', () => {
    assert.throws(() => splitGlb(fixture({ buffers: [{ uri: 'external.bin', byteLength: 12 }] })), /External/);
    assert.throws(() => splitGlb(fixture(), 4), /output limit/);
    assert.throws(() => splitGlb(fixture(), 0), /Invalid buffer limit/);
    assert.throws(() => splitGlb(fixture({ bufferViews: [{ buffer: 0, byteLength: 4, extensions: { EXT_meshopt_compression: {} } }] })), /Meshopt/);
});

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'presentation/white_model');

test('published model preserves all original view data and scene properties', () => {
    const source = fs.readFileSync(path.join(directory, 'model.glb'));
    const document = JSON.parse(fs.readFileSync(path.join(directory, 'model.gltf'), 'utf8'));
    const buffers = document.buffers.map(buffer => {
        assert.match(buffer.uri, /^model-part-\d+\.bin$/);
        const bytes = fs.readFileSync(path.join(directory, buffer.uri));
        assert.equal(bytes.length, buffer.byteLength);
        assert(bytes.length <= MAX_BUFFER_BYTES);
        return bytes;
    });
    assertPreserved(source, document, buffers);
    assert.deepEqual(splitGlb(source), { document, buffers }, 'Generated assets match original source');
});

test('published glTF passes Khronos validation', async () => {
    const validator = require('gltf-validator');
    const result = await validator.validateString(fs.readFileSync(path.join(directory, 'model.gltf'), 'utf8'), {
        uri: 'model.gltf',
        maxIssues: 30,
        externalResourceFunction: async uri => new Uint8Array(fs.readFileSync(path.join(directory, uri)))
    });
    assert.equal(result.issues.numErrors, 0, JSON.stringify(result.issues));
});

test('runtime inventory includes model buffers and vendor dependencies, not source GLB', () => {
    const { collectGenericPresentationRuntimeFiles, walkFiles } = require('./dist-config');
    const files = new Set(collectGenericPresentationRuntimeFiles(root, 'presentation/white_model'));
    assert(files.has('model.gltf'));
    const model = JSON.parse(fs.readFileSync(path.join(directory, 'model.gltf'), 'utf8'));
    model.buffers.forEach(buffer => assert(files.has(buffer.uri), buffer.uri));
    for (const relative of walkFiles(path.join(directory, 'vendor'))) {
        if (/\.(?:js|css|wasm)$/.test(relative)) assert(files.has(`vendor/${relative}`), relative);
    }
    assert(!files.has('model.glb'));
    const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
    assert(html.includes('const modelData = "./model.gltf";'));
    assert(html.includes('href="/assets/favicon.png"'));
});
