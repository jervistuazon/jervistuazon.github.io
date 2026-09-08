import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { test } from 'node:test';
import { parse } from 'acorn';
import { loadSplitModel, decodeModelDownload, createFrameLoop, createMaterialConverter, isObjectVisible } from '../presentation/site_feasibility/development/viewer-runtime.mjs';
import { readGlb, sha256 } from './optimize-feasibility-model.mjs';
import { MeshoptDecoder } from '../presentation/site_feasibility/development/vendor/meshopt_decoder.mjs';
import * as THREE from '../presentation/site_feasibility/development/vendor/three.module.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'presentation/site_feasibility');
const page = fs.readFileSync(path.join(site, '_next/static/chunks/page-DeLNxDSA.js'), 'utf8');
const ast = parse(page, { ecmaVersion: 'latest', sourceType: 'module' });
const scenarioNode = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'fl');
const calculate = vm.runInNewContext('(' + page.slice(scenarioNode.start, scenarioNode.end) + ')');

test('scenario integer boundaries preserve valid homes, parking and trips', () => {
    for (const [values, expected] of [
        [[4, 2, 80, 75, 85, 1, .35], [564, 564, 198]],
        [[.5, 1, 80, 75, 60, 1.1, .35], [50, 55, 18]],
        [[1, 1, 80, 75, 60, 1, .55], [100, 100, 55]],
        [[1.5, 4.1, 20, 50, 50, 1, .35], [123, 123, 44]],
        [[.5, .5, 20, 50, 200, .1, .15], [1, 1, 1]]
    ]) {
        const [area, fsi, residential, efficiency, unit, parking, trips] = values;
        const result = calculate({ area, fsi, residential, efficiency, unit, parking, trips, coverage: 30 });
        assert.deepEqual([result.units, result.parking, result.trips], expected);
    }
});

function downloadFixture({ truncated = false, failed = false } = {}) {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5]), new Uint8Array([6])];
    let active = 0, peak = 0;
    const signals = [];
    return {
        get peak() { return peak; }, signals,
        async fetcher(url, { signal }) {
            signals.push(signal);
            if (url.includes('.json')) return { ok: true, json: async () => ({ bytes: 6, parts: chunks.map((_, i) => `model.part-0${i}.bin`) }) };
            const index = Number(url.match(/(\d+)\.bin$/)[1]);
            if (failed && index === 1) return { ok: false, status: 503 };
            return { ok: true, async arrayBuffer() {
                peak = Math.max(peak, ++active);
                await new Promise(resolve => setTimeout(resolve, (3 - index) * 2));
                active--;
                return truncated && index === 3 ? new ArrayBuffer(0) : chunks[index].buffer;
            } };
        }
    };
}

test('split download preserves order, caps concurrency and reports completion', async () => {
    const fixture = downloadFixture(), progress = [];
    const model = await loadSplitModel({ fetcher: fixture.fetcher, onProgress: value => progress.push(value) });
    assert.deepEqual([...new Uint8Array(model)], [1, 2, 3, 4, 5, 6]);
    assert.equal(fixture.peak, 3);
    assert.equal(progress.at(-1), 100);
    assert.ok(progress.slice(0, -1).every(value => value < 100));
});

test('truncated and failed model parts reject and abort outstanding requests', async () => {
    for (const options of [{ truncated: true }, { failed: true }]) {
        const fixture = downloadFixture(options);
        await assert.rejects(loadSplitModel({ fetcher: fixture.fetcher }), /incomplete|503/);
        assert.ok(fixture.signals.every(signal => signal.aborted));
    }
});

test('invalid manifest fails before model requests', async () => {
    let requests = 0;
    await assert.rejects(loadSplitModel({ fetcher: async () => {
        requests++;
        return { ok: true, json: async () => ({ bytes: 6, parts: ['../wrong.bin'] }) };
    } }), /Invalid model manifest/);
    assert.equal(requests, 1);
});

test('stalled model download times out instead of leaving a permanent spinner', async () => {
    await assert.rejects(loadSplitModel({ timeoutMs: 5, fetcher: (_, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }) }), /timed out/);
});

test('frame scheduling pauses, resumes without a time jump, and avoids duplicate loops', () => {
    let next = 0;
    const queue = new Map(), deltas = [];
    const loop = createFrameLoop(delta => deltas.push(delta), {
        requestFrame: callback => { queue.set(++next, callback); return next; },
        cancelFrame: id => queue.delete(id)
    });
    function tick(now) { const [id, callback] = queue.entries().next().value; queue.delete(id); callback(now); }
    loop.setActive(true); loop.setActive(true);
    assert.equal(queue.size, 1);
    tick(100); tick(116);
    loop.setActive(false);
    assert.equal(queue.size, 0);
    loop.setActive(true); tick(10000);
    assert.deepEqual(deltas, [0, .016, 0]);
    loop.setVisible(false); assert.equal(queue.size, 0);
    loop.setActive(true); assert.equal(queue.size, 0);
    loop.setVisible(true); assert.equal(queue.size, 1);
});

test('hidden hotspot or hidden ancestor is excluded from interaction candidates', () => {
    const group = new THREE.Group(), sprite = new THREE.Sprite();
    group.add(sprite);
    assert.equal(isObjectVisible(sprite), true);
    sprite.visible = false; assert.equal(isObjectVisible(sprite), false);
    sprite.visible = true; group.visible = false; assert.equal(isObjectVisible(sprite), false);
    assert.equal(isObjectVisible(null), false);
});

test('material conversion shares instances and preserves texture/color/array assignments', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#678901', map: new THREE.Texture() });
    material.name = 'M_Grass';
    const convert = createMaterialConverter(THREE, { roughness: .5, metalness: .05, envMapIntensity: 1, specularIntensity: 1 });
    const output = convert(material);
    assert.equal(convert(material), output);
    assert.equal(output.map, material.map);
    assert.equal(output.color.getHex(), material.color.getHex());
    assert.equal(output.name, material.name);
    assert.deepEqual(convert([material, material]), [output, output]);
    assert.equal(new Set(Array.from({ length: 603 }, () => convert(material))).size, 1);
});

function walk(node, visit) {
    if (!node || typeof node !== 'object') return;
    if (node.type) visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walk(child, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
}

// Run the actual exported component's state/effects with a small deterministic
// hook driver; no JSX rendering or browser behavior is simulated here.
function parentHarness() {
    const component = ast.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'Sl');
    const returned = component.body.body.find(node => node.type === 'ReturnStatement');
    let towerCallback, retryCallback;
    walk(returned, node => {
        if (node.type !== 'Property') return;
        const source = page.slice(node.value.start, node.value.end);
        if (node.key.name === 'onTower') towerCallback = source;
        if (node.key.name === 'onClick' && source.includes('contentWindow?.location.reload')) retryCallback = source;
    });
    assert.ok(towerCallback && retryCallback);
    const slots = [], messages = [], listeners = new Map();
    let cursor = 0, dirty = false, effects = [], current, reloads = 0;
    const frame = { contentWindow: { postMessage: message => messages.push(message), location: { reload() { reloads++; } } } };
    const f = {
        useState(initial) {
            const id = cursor++;
            if (!(id in slots)) slots[id] = initial;
            return [slots[id], value => { slots[id] = typeof value === 'function' ? value(slots[id]) : value; dirty = true; }];
        },
        useRef(initial) { const id = cursor++; return slots[id] ??= { current: initial }; },
        useMemo(callback) { cursor++; return callback(); },
        useEffect(callback, deps) {
            const id = cursor++, previous = slots[id];
            if (!previous || deps.some((value, i) => value !== previous.deps[i])) {
                effects.push(() => { previous?.cleanup?.(); slots[id] = { deps, cleanup: callback() }; });
            }
        }
    };
    const source = page.slice(component.start, returned.start) + `return {view:e, ready:W, error:se, frame:Se, setLayers:xe, changeView:De, selectTower:${towerCallback}, retry:${retryCallback}}}`;
    const renderComponent = vm.runInNewContext(source + ';Sl', { f, dl: {}, cl: [], fl: () => ({}), location: { origin: 'https://atlas.test' }, window: {
        addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type)
    } });
    function render() {
        do {
            cursor = 0; dirty = false; effects = [];
            current = renderComponent(); current.frame.current = frame;
            effects.forEach(effect => effect());
        } while (dirty);
        return current;
    }
    render();
    return {
        messages, render, get current() { return current; }, get reloads() { return reloads; },
        message(type, extra = {}) { listeners.get('message')({ origin: 'https://atlas.test', source: frame.contentWindow, data: { type, ...extra } }); return render(); }
    };
}

test('map tower selection is replayed after ready and on subsequent map visits', () => {
    const app = parentHarness();
    app.current.selectTower('R_W02'); app.render();
    assert.equal(app.current.view, 'model');
    assert.equal(app.messages.filter(message => message.command === 'tower').length, 0);
    app.message('atlas-ready');
    assert.equal(app.messages.findLast(message => message.command === 'tower').value, 'R_W02');
    app.current.changeView('context'); app.render();
    assert.equal(app.messages.findLast(message => message.command === 'active').value, false);
    app.current.selectTower('R_W02'); app.render();
    assert.equal(app.messages.filter(message => message.command === 'tower').length, 2);
});

test('layers changed during download and after retry are replayed; errors reset ready state', () => {
    const app = parentHarness();
    app.current.changeView('model'); app.current.setLayers({ roads: true, landscape: false, hotspots: false }); app.render();
    app.message('atlas-ready');
    assert.equal(app.messages.findLast(message => message.command === 'layer' && message.value.name === 'hotspots').value.visible, false);
    app.message('atlas-error');
    assert.equal(app.current.ready, false); assert.ok(app.current.error);
    assert.equal(app.messages.findLast(message => message.command === 'active').value, false);
    app.current.retry(); app.render(); assert.equal(app.reloads, 1);
    app.message('atlas-ready');
    assert.equal(app.messages.findLast(message => message.command === 'layer' && message.value.name === 'landscape').value.visible, false);
});

test('gzip decoder supports native streams and fallback; rejects corrupt or truncated data', async () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const compressed = gzipSync(original), manifest = { compression: 'gzip', decodedBytes: original.length };
    for (const Stream of [globalThis.DecompressionStream, null]) {
        assert.deepEqual(new Uint8Array(await decodeModelDownload(compressed, manifest, Stream)), original);
        await assert.rejects(decodeModelDownload(compressed, { ...manifest, decodedBytes: 50 }, Stream), /incomplete/);
        await assert.rejects(decodeModelDownload(compressed.subarray(0, 8), manifest, Stream));
    }
});

test('production model downloads, decodes and preserves original geometry and texture fingerprints', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(site, 'development/model-manifest.json')));
    const transport = Buffer.concat(manifest.parts.map(name => fs.readFileSync(path.join(site, 'development', name))));
    assert.equal(transport.length, manifest.bytes);
    assert.equal(sha256(transport), manifest.sha256);
    const model = await loadSplitModel({ fetcher: async url => new Response(fs.readFileSync(path.join(site, 'development', url.split('?')[0]))) });
    assert.equal(model.byteLength, manifest.decodedBytes);
    assert.equal(sha256(new Uint8Array(model)), manifest.verification.optimizedSha256);
    const { json, binary } = readGlb(model);
    const geometryHash = createHash('sha256'), pixelHash = createHash('sha256');
    const imageViews = new Set(json.images.map(image => image.bufferView));
    await MeshoptDecoder.ready;
    for (const [index, view] of json.bufferViews.entries()) {
        if (imageViews.has(index)) {
            pixelHash.update(await sharp(binary.subarray(view.byteOffset, view.byteOffset + view.byteLength)).ensureAlpha().raw().toBuffer());
        } else {
            const ext = view.extensions.EXT_meshopt_compression;
            const decoded = new Uint8Array(view.byteLength);
            MeshoptDecoder.decodeGltfBuffer(decoded, ext.count, ext.byteStride, binary.subarray(ext.byteOffset, ext.byteOffset + ext.byteLength), ext.mode, ext.filter);
            geometryHash.update(decoded);
        }
    }
    assert.equal(geometryHash.digest('hex'), manifest.verification.geometrySha256);
    assert.equal(pixelHash.digest('hex'), manifest.verification.pixelSha256);
    assert.equal(json.nodes.length, manifest.verification.nodes);
    assert.equal(json.meshes.length, manifest.verification.meshes);
    assert.equal(json.materials.length, manifest.verification.materials);
});

test('the shipped Three.js loader parses compressed geometry, named towers and materials', async () => {
    // Resolve the browser import map for Node without modifying the shipped loader.
    const vendor = new URL('../presentation/site_feasibility/development/vendor/', import.meta.url);
    const moduleUrl = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
    const resolveThree = source => source.replace("from 'three'", `from '${new URL('three.module.js', vendor).href}'`);
    const utils = moduleUrl(resolveThree(fs.readFileSync(new URL('examples/jsm/utils/BufferGeometryUtils.js', vendor), 'utf8')));
    const loaderSource = resolveThree(fs.readFileSync(new URL('examples/jsm/loaders/GLTFLoader.js', vendor), 'utf8'))
        .replace("from '../utils/BufferGeometryUtils.js'", `from '${utils}'`);
    const { GLTFLoader } = await import(moduleUrl(loaderSource));
    const model = await loadSplitModel({ fetcher: async url => new Response(fs.readFileSync(path.join(site, 'development', url.split('?')[0]))) });
    const oldSelf = globalThis.self, oldBitmap = globalThis.createImageBitmap;
    // Decode image dimensions with Sharp in this GPU-free integration test.
    globalThis.self = globalThis;
    globalThis.createImageBitmap = async blob => {
        const { width, height } = await sharp(Buffer.from(await blob.arrayBuffer())).metadata();
        return { width, height, close() {} };
    };
    try {
        const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(model, '');
        const names = [], materials = new Set();
        gltf.scene.traverse(object => {
            names.push(object.name);
            if (object.isMesh) {
                assert.ok(object.geometry.attributes.position.count > 0);
                const list = Array.isArray(object.material) ? object.material : [object.material];
                for (const material of list) materials.add(material.name);
            }
        });
        for (const side of ['W', 'E']) for (let i = 1; i <= 6; i++) {
            assert.ok(names.some(name => name.startsWith(`R_${side}${String(i).padStart(2, '0')}_`)));
        }
        assert.ok(materials.has('M_Grass')); assert.ok(materials.has('M_Grass_Light'));
        assert.ok(!new THREE.Box3().setFromObject(gltf.scene).isEmpty());
    } finally {
        if (oldSelf === undefined) delete globalThis.self; else globalThis.self = oldSelf;
        if (oldBitmap === undefined) delete globalThis.createImageBitmap; else globalThis.createImageBitmap = oldBitmap;
    }
});

test('bridge retains pre-ready activity and invalidates shadows when layers change', () => {
    const handlers = new Map(), sent = [], active = [];
    const parent = { postMessage: message => sent.push(message) };
    const window = { addEventListener: (type, handler) => handlers.set(type, handler) };
    vm.runInNewContext(fs.readFileSync(path.join(site, 'development/atlas-bridge.js'), 'utf8'), {
        window, parent, location: { origin: 'https://atlas.test' }
    });
    const send = (command, value, origin = 'https://atlas.test') => handlers.get('message')({ source: parent, origin, data: { command, value } });
    send('active', true);
    send('active', false, 'https://foreign.test');
    const scene = new THREE.Scene(), tree = new THREE.Group(), sprite = new THREE.Sprite();
    tree.name = 'TreeGroup'; scene.add(tree, sprite);
    let invalidations = 0, cleared = 0;
    window.__VIEWER__ = {
        ready: true, THREE, scene, camera: new THREE.PerspectiveCamera(), controls: { target: new THREE.Vector3() },
        setActive: value => active.push(value), clearHotspots: () => cleared++, invalidateScene: () => invalidations++
    };
    handlers.get('atlas-viewer-ready')();
    assert.deepEqual(active, [true]);
    assert.equal(sent.at(-1).type, 'atlas-ready');
    send('layer', { name: 'landscape', visible: false });
    assert.equal(tree.visible, false);
    send('layer', { name: 'hotspots', visible: false });
    assert.equal(sprite.visible, false); assert.equal(cleared, 1); assert.equal(invalidations, 2);
    send('active', false); assert.equal(active.at(-1), false);
});

test('orbit resumes after interaction only while still requested', () => {
    const html = fs.readFileSync(path.join(site, 'development/index.html'), 'utf8');
    const source = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)][0][1];
    const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    let setter;
    walk(tree, node => { if (node.type === 'Property' && node.key.name === 'setAutoRotate') setter = source.slice(node.start, node.end); });
    const events = new Map(), timers = new Map(); let id = 0;
    const context = vm.createContext({ config: { autoRotate: false, autoRotateDelay: 2 }, controls: {
        autoRotate: false, addEventListener: (name, handler) => events.set(name, handler)
    }, rotationTimeout: null, clearTimeout: key => timers.delete(key), setTimeout: fn => { timers.set(++id, fn); return id; } });
    const setAutoRotate = vm.runInContext('({' + setter + '}).setAutoRotate', context);
    const start = source.indexOf("controls.addEventListener('start'");
    vm.runInContext(source.slice(start, source.indexOf('function applyView', start)), context);
    setAutoRotate(true); events.get('start')(); assert.equal(context.controls.autoRotate, false);
    events.get('end')(); timers.values().next().value(); assert.equal(context.controls.autoRotate, true);
    events.get('start')(); events.get('end')(); setAutoRotate(false);
    assert.equal(timers.has(context.rotationTimeout), false); assert.equal(context.controls.autoRotate, false);
});

test('changed viewer scripts and exported modules parse successfully', () => {
    const html = fs.readFileSync(path.join(site, 'development/index.html'), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
        if (/type="importmap"/.test(match[1])) continue;
        parse(match[2], { ecmaVersion: 'latest', sourceType: /type="module"/.test(match[1]) ? 'module' : 'script' });
    }
    parse(fs.readFileSync(path.join(site, 'development/atlas-bridge.js'), 'utf8'), { ecmaVersion: 'latest' });
    for (const filename of fs.readdirSync(path.join(site, '_next/static/chunks'))) {
        if (filename.endsWith('.js')) parse(fs.readFileSync(path.join(site, '_next/static/chunks', filename), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' });
    }
});
