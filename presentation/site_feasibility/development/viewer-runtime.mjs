// Small, independently testable helpers for the exported development viewer.
export async function decodeModelDownload(bytes, manifest, Stream = globalThis.DecompressionStream) {
    if (manifest.compression !== 'gzip') return bytes.buffer;
    let decoded;
    if (Stream) {
        const stream = new Blob([bytes]).stream().pipeThrough(new Stream('gzip'));
        decoded = await new Response(stream).arrayBuffer();
    } else {
        // Older browsers can still open the model without native gzip streams.
        const { gunzipSync } = await import('./vendor/fflate.module.js');
        decoded = gunzipSync(bytes).buffer;
    }
    if (decoded.byteLength !== manifest.decodedBytes) throw new Error('The decoded model is incomplete. Please retry.');
    return decoded;
}

export async function loadSplitModel({ fetcher = fetch, onProgress = () => {}, timeoutMs = 120000 } = {}) {
    const controller = new AbortController();
    async function request(path, consume) {
        const timeout = setTimeout(() => controller.abort(new Error('Model download timed out. Please retry.')), timeoutMs);
        try {
            const response = await fetcher(path, { signal: controller.signal });
            if (!response.ok) throw new Error(`Model download failed (${response.status}): ${path}`);
            return await consume(response);
        } finally {
            clearTimeout(timeout);
        }
    }
    try {
        const manifest = await request('./model-manifest.json?v=20260908c', response => response.json());
        if (!Number.isSafeInteger(manifest.bytes) || manifest.bytes <= 0 || !Array.isArray(manifest.parts) ||
            !manifest.parts.length || new Set(manifest.parts).size !== manifest.parts.length ||
            !manifest.parts.every(name => typeof name === 'string' && /^model(?:\.[a-f0-9]{12})?\.part-\d+\.bin$/.test(name)) ||
            (manifest.compression !== undefined && manifest.compression !== 'gzip') ||
            (manifest.compression === 'gzip' && (!Number.isSafeInteger(manifest.decodedBytes) || manifest.decodedBytes <= 0))) {
            throw new Error('Invalid model manifest. Please reload the presentation.');
        }
        let next = 0, loaded = 0;
        const parts = new Array(manifest.parts.length);
        // Bound competing requests while preserving manifest order.
        await Promise.all(Array.from({ length: Math.min(3, parts.length) }, async () => {
            while (next < parts.length) {
                const index = next++;
                parts[index] = await request('./' + manifest.parts[index], response => response.arrayBuffer());
                loaded += parts[index].byteLength;
                if (!parts[index].byteLength || loaded > manifest.bytes) throw new Error('The model download is incomplete or invalid. Please retry.');
                onProgress(Math.min(99, Math.round(loaded / manifest.bytes * 100)));
            }
        }));
        if (loaded !== manifest.bytes) throw new Error('The model download is incomplete. Please retry.');
        const model = new Uint8Array(loaded);
        let offset = 0;
        for (let index = 0; index < parts.length; index++) {
            model.set(new Uint8Array(parts[index]), offset);
            offset += parts[index].byteLength;
            parts[index] = null;
        }
        const decoded = await decodeModelDownload(model, manifest);
        onProgress(100);
        return decoded;
    } catch (error) {
        controller.abort(error);
        throw error;
    }
}

export function isObjectVisible(object) {
    if (!object) return false;
    for (let current = object; current; current = current.parent) {
        if (current.visible === false) return false;
    }
    return true;
}

export function createFrameLoop(draw, { requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame } = {}) {
    let active = false, visible = true, frame = null, previous = null;
    function tick(now) {
        frame = null;
        if (!active || !visible) return;
        const delta = previous === null ? 0 : Math.min((now - previous) / 1000, 0.1);
        previous = now;
        draw(delta);
        schedule();
    }
    function schedule() {
        if (active && visible && frame === null) frame = requestFrame(tick);
        if (!active || !visible) {
            if (frame !== null) cancelFrame(frame);
            frame = null;
            previous = null;
        }
    }
    return {
        setActive(value) { active = Boolean(value); schedule(); },
        setVisible(value) { visible = Boolean(value); schedule(); }
    };
}

export function createMaterialConverter(THREE, config) {
    const materials = new Map();
    return function convert(material) {
        if (Array.isArray(material)) return material.map(convert);
        if (materials.has(material)) return materials.get(material);
        const converted = material instanceof THREE.MeshPhysicalMaterial ? material : new THREE.MeshPhysicalMaterial();
        if (converted !== material) THREE.MeshStandardMaterial.prototype.copy.call(converted, material);
        converted.shadowSide = THREE.DoubleSide;
        converted.roughness = config.disableReflections ? 1 : config.roughness;
        converted.metalness = config.disableReflections ? 0 : config.metalness;
        converted.specularIntensity = config.disableReflections ? 0 : config.specularIntensity;
        if (!config.disableReflections) converted.envMapIntensity = config.envMapIntensity;
        materials.set(material, converted);
        return converted;
    };
}
