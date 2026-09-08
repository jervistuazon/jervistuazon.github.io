'use strict';

// Repackage the original GLB as standard glTF buffers below Pages' 25 MiB limit.
// No geometry, materials, textures, transforms, or camera data are recomputed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MAX_BUFFER_BYTES = 20 * 1024 * 1024;

function readGlb(bytes) {
    assert(bytes.length >= 20, 'Truncated GLB header');
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'Not a GLB');
    assert.equal(bytes.readUInt32LE(4), 2, 'Only GLB 2 is supported');
    assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB length mismatch');
    let document;
    let binary;
    for (let offset = 12; offset < bytes.length;) {
        assert(offset + 8 <= bytes.length, 'Truncated GLB chunk header');
        const length = bytes.readUInt32LE(offset);
        const type = bytes.readUInt32LE(offset + 4);
        offset += 8;
        assert(length % 4 === 0 && offset + length <= bytes.length, 'Invalid GLB chunk');
        if (type === 0x4e4f534a) {
            assert(!document, 'Duplicate JSON chunk');
            document = JSON.parse(bytes.subarray(offset, offset + length).toString('utf8'));
        } else if (type === 0x004e4942) {
            assert(!binary, 'Duplicate BIN chunk');
            binary = bytes.subarray(offset, offset + length);
        } else {
            throw new Error(`Unsupported GLB chunk: ${type}`);
        }
        offset += length;
    }
    assert(document && binary, 'GLB requires JSON and BIN chunks');
    assert.equal(document.buffers?.length, 1, 'Expected one embedded GLB buffer');
    assert(!document.buffers[0].uri, 'External GLB buffers are not supported');
    assert(document.buffers[0].byteLength <= binary.length, 'Truncated GLB buffer');
    return { document, binary };
}

function splitGlb(bytes, maxBufferBytes = MAX_BUFFER_BYTES) {
    assert(Number.isSafeInteger(maxBufferBytes) && maxBufferBytes >= 4, 'Invalid buffer limit');
    const { document: original, binary } = readGlb(bytes);
    const document = structuredClone(original);
    const buffers = [];
    let parts = [];
    let length = 0;
    for (const view of document.bufferViews || []) {
        assert.equal(view.buffer, 0, 'Unexpected buffer reference');
        assert(!view.extensions?.EXT_meshopt_compression, 'Meshopt buffers require separate repacking');
        const start = view.byteOffset ?? 0;
        assert(Number.isSafeInteger(start) && start >= 0, 'Invalid buffer view offset');
        assert(Number.isSafeInteger(view.byteLength) && view.byteLength > 0, 'Invalid buffer view length');
        assert(start + view.byteLength <= original.buffers[0].byteLength, 'Buffer view exceeds source buffer');
        assert(view.byteLength <= maxBufferBytes, 'A buffer view exceeds the output limit');
        let padding = (4 - length % 4) % 4;
        if (length + padding + view.byteLength > maxBufferBytes) {
            buffers.push(Buffer.concat(parts, length));
            parts = [];
            length = 0;
            padding = 0;
        }
        if (padding) parts.push(Buffer.alloc(padding));
        length += padding;
        view.buffer = buffers.length;
        view.byteOffset = length;
        parts.push(binary.subarray(start, start + view.byteLength));
        length += view.byteLength;
    }
    assert(length > 0, 'No buffer views to publish');
    buffers.push(Buffer.concat(parts, length));
    document.buffers = buffers.map((buffer, index) => ({
        ...original.buffers[0],
        byteLength: buffer.length,
        uri: `model-part-${String(index + 1).padStart(2, '0')}.bin`
    }));
    return { document, buffers };
}

function prepareWhiteModel(rootDir = path.resolve(__dirname, '..')) {
    const directory = path.join(rootDir, 'presentation/white_model');
    const { document, buffers } = splitGlb(fs.readFileSync(path.join(directory, 'model.glb')));
    const json = JSON.stringify(document);
    assert(Buffer.byteLength(json) < 25 * 1024 * 1024, 'glTF JSON exceeds Pages limit');
    const indexPath = path.join(directory, 'index.html');
    let html = fs.readFileSync(indexPath, 'utf8');
    assert(html.includes('model.glb') || html.includes('model.gltf'), 'Model URL not found in viewer');
    html = html.replaceAll('model.glb', 'model.gltf');
    if (!/rel=["']icon["']/.test(html)) {
        html = html.replace('</title>', '</title>\n    <link rel="icon" type="image/png" href="/assets/favicon.png">');
    }
    buffers.forEach((buffer, index) => fs.writeFileSync(path.join(directory, document.buffers[index].uri), buffer));
    fs.writeFileSync(path.join(directory, 'model.gltf'), json + '\n');
    fs.writeFileSync(indexPath, html);
    console.log(`Prepared model.gltf and ${buffers.length} lossless buffers: ${buffers.map(b => b.length).join(', ')} bytes`);
}

module.exports = { MAX_BUFFER_BYTES, readGlb, splitGlb, prepareWhiteModel };
if (require.main === module) prepareWhiteModel();
