import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

export const EXTENSION = 'EXT_meshopt_compression';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const align = value => Math.ceil(value / 4) * 4;

export function readGlb(bytes) {
    const buffer = Buffer.from(bytes);
    assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
    assert.equal(buffer.readUInt32LE(4), 2);
    assert.equal(buffer.readUInt32LE(8), buffer.length);
    assert.equal(buffer.readUInt32LE(16), 0x4e4f534a);
    const jsonLength = buffer.readUInt32LE(12), binaryHeader = 20 + jsonLength;
    assert.equal(buffer.readUInt32LE(binaryHeader + 4), 0x004e4942);
    return { json: JSON.parse(buffer.toString('utf8', 20, binaryHeader)), binary: buffer.subarray(binaryHeader + 8) };
}

export function writeGlb(json, binary) {
    const text = Buffer.from(JSON.stringify(json));
    const jsonLength = align(text.length), binaryLength = align(binary.length);
    const output = Buffer.alloc(28 + jsonLength + binaryLength);
    output.write('glTF'); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
    output.writeUInt32LE(jsonLength, 12); output.writeUInt32LE(0x4e4f534a, 16);
    output.fill(0x20, 20, 20 + jsonLength); text.copy(output, 20);
    output.writeUInt32LE(binaryLength, 20 + jsonLength); output.writeUInt32LE(0x004e4942, 24 + jsonLength);
    binary.copy(output, 28 + jsonLength);
    return output;
}

export async function packageModel(output, report, directory) {
    const compressed = gzipSync(output, { level: 9 });
    const hash = sha256(compressed), chunkSize = 8 * 1024 * 1024, parts = [];
    await fs.mkdir(directory, { recursive: true });
    for (let offset = 0; offset < compressed.length; offset += chunkSize) {
        const name = `model.${hash.slice(0, 12)}.part-${String(parts.length).padStart(2, '0')}.bin`;
        await fs.writeFile(path.join(directory, name), compressed.subarray(offset, offset + chunkSize));
        parts.push(name);
    }
    const manifest = { bytes: compressed.length, decodedBytes: output.length, compression: 'gzip',
        sha256: hash, parts, verification: report };
    await fs.writeFile(path.join(directory, 'model-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    return manifest;
}

export async function decodeView(model, index) {
    const view = model.json.bufferViews[index], extension = view.extensions?.[EXTENSION];
    if (!extension) return model.binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    await MeshoptDecoder.ready;
    const decoded = new Uint8Array(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(decoded, extension.count, extension.byteStride,
        model.binary.subarray(extension.byteOffset, extension.byteOffset + extension.byteLength), extension.mode, extension.filter);
    return Buffer.from(decoded);
}

export async function verifyModels(originalBytes, optimizedBytes) {
    const original = readGlb(originalBytes), optimized = readGlb(optimizedBytes);
    const structural = model => Object.fromEntries(Object.entries(model.json).filter(([key]) =>
        !['buffers', 'bufferViews', 'extensionsUsed', 'extensionsRequired'].includes(key)));
    assert.deepEqual(structural(optimized), structural(original), 'Scene structure, names, materials and bindings must remain unchanged');
    assert.equal(optimized.json.bufferViews.length, original.json.bufferViews.length);
    const imageViews = new Set(original.json.images.map(image => image.bufferView));
    let geometryViews = 0, images = 0;
    const geometryHash = createHash('sha256'), pixelHash = createHash('sha256');
    for (let index = 0; index < original.json.bufferViews.length; index++) {
        const before = await decodeView(original, index), after = await decodeView(optimized, index);
        if (imageViews.has(index)) {
            const a = await sharp(before).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            const b = await sharp(after).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
            assert.deepEqual(b.info, a.info, `Image dimensions ${index}`);
            assert.ok(a.data.equals(b.data), `Decoded image pixels ${index}`);
            pixelHash.update(a.data); images++;
        } else {
            assert.ok(before.equals(after), `Geometry bytes differ in buffer view ${index}`);
            geometryHash.update(before); geometryViews++;
        }
    }
    return { geometryViews, images, geometrySha256: geometryHash.digest('hex'), pixelSha256: pixelHash.digest('hex'),
        nodes: original.json.nodes.length, meshes: original.json.meshes.length, materials: original.json.materials.length };
}

export async function optimizeModel(originalBytes) {
    await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
    const source = readGlb(originalBytes), json = structuredClone(source.json);
    assert.ok(!json.extensionsUsed?.includes(EXTENSION), 'Use the original model; do not recompress an optimized export');
    assert.equal(json.buffers.length, 1);
    const imageViews = new Map(json.images.map(image => [image.bufferView, image]));
    const stored = [], payloads = new Map(), imageCache = new Map();
    let storedLength = 0, decodedLength = 0, originalImageBytes = 0, storedImageBytes = 0;
    function append(bytes) {
        const key = sha256(bytes);
        if (payloads.has(key)) return payloads.get(key);
        const offset = storedLength;
        stored.push(Buffer.from(bytes), Buffer.alloc(align(bytes.length) - bytes.length));
        storedLength += align(bytes.length); payloads.set(key, offset);
        return offset;
    }
    for (let index = 0; index < json.bufferViews.length; index++) {
        const view = json.bufferViews[index], raw = await decodeView(source, index);
        if (imageViews.has(index)) {
            const image = imageViews.get(index), key = sha256(raw);
            originalImageBytes += raw.length;
            if (!imageCache.has(key)) {
                let bytes = raw;
                if (image.mimeType === 'image/png') {
                    const candidate = await sharp(raw).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
                    if (candidate.length < raw.length) bytes = candidate;
                }
                imageCache.set(key, bytes); storedImageBytes += bytes.length;
            }
            const bytes = imageCache.get(key);
            view.buffer = 0; view.byteOffset = append(bytes); view.byteLength = bytes.length;
        } else {
            const accessors = json.accessors.filter(accessor => accessor.bufferView === index);
            assert.ok(accessors.length, `Unrecognized buffer view ${index}`);
            const indices = view.target === 34963;
            const stride = indices ? ({ 5123: 2, 5125: 4 })[accessors[0].componentType] : view.byteStride;
            assert.ok(stride && raw.length % stride === 0);
            const count = raw.length / stride, mode = indices ? 'INDICES' : 'ATTRIBUTES';
            // v0 is compatible with EXT_meshopt_compression and Three.js r160.
            // No quantization, filtering, vertex reorder or triangle rotation.
            const encoded = MeshoptEncoder.encodeGltfBuffer(raw, count, stride, mode, 0);
            view.buffer = 1; view.byteOffset = decodedLength;
            decodedLength += align(raw.length);
            view.extensions = { ...view.extensions, [EXTENSION]: {
                buffer: 0, byteOffset: append(encoded), byteLength: encoded.length,
                byteStride: stride, count, mode, filter: 'NONE'
            } };
        }
    }
    json.buffers = [{ byteLength: storedLength }, { byteLength: decodedLength, extensions: { [EXTENSION]: { fallback: true } } }];
    json.extensionsUsed = [...new Set([...(json.extensionsUsed || []), EXTENSION])];
    json.extensionsRequired = [...new Set([...(json.extensionsRequired || []), EXTENSION])];
    const output = writeGlb(json, Buffer.concat(stored));
    const verification = await verifyModels(originalBytes, output);
    return { output, report: { originalBytes: originalBytes.length, optimizedBytes: output.length,
        originalSha256: sha256(originalBytes), optimizedSha256: sha256(output),
        originalImageBytes, storedImageBytes, ...verification } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [input, output, directory] = process.argv.slice(2);
    assert.ok(input && output, 'Usage: node scripts/optimize-feasibility-model.mjs original.glb optimized.glb [parts-directory]');
    const result = await optimizeModel(await fs.readFile(input));
    await fs.writeFile(output, result.output);
    await fs.writeFile(output + '.report.json', JSON.stringify(result.report, null, 2) + '\n');
    if (directory) await packageModel(result.output, result.report, directory);
    console.log(JSON.stringify(result.report, null, 2));
}
