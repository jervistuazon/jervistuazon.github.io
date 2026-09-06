import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, Mesh, BoxGeometry, MeshPhysicalMaterial, Texture, DoubleSide, FrontSide } from '../presentation/site_feasibility/development/vendor/three.module.js';
import { stabilizeGroundSurfaces } from '../presentation/site_feasibility/development/ground-surfaces.js';

// Use the actual export's node names and material sharing, without loading
// textures or requiring WebGL. This catches a replacement export silently
// losing the fix, and guards against changing every object using M_Grass.
const chunk = readFileSync(new URL('../presentation/site_feasibility/development/model.part-00.bin', import.meta.url));
const gltf = JSON.parse(chunk.subarray(20, 20 + chunk.readUInt32LE(12)).toString());
const materials = gltf.materials.map(m => new MeshPhysicalMaterial({
    name: m.name, side: m.doubleSided ? DoubleSide : FrontSide,
    map: new Texture(), roughness: 0.5, metalness: 0.05,
}));
const root = new Group();
const original = new Map();
for (const node of gltf.nodes) {
    if (node.mesh === undefined) continue;
    const primitive = gltf.meshes[node.mesh].primitives[0];
    const mesh = new Mesh(new BoxGeometry(), materials[primitive.material]);
    mesh.name = node.name;
    root.add(mesh);
    original.set(mesh, mesh.material);
}
stabilizeGroundSurfaces(root);
const changed = root.children.filter(mesh => mesh.material !== original.get(mesh));
assert.equal(changed.length, 4, 'All four exported ground slabs must be handled');
for (const mesh of changed) {
    const before = original.get(mesh);
    assert.equal(mesh.material.side, FrontSide);
    assert.equal(mesh.material.map, before.map, 'Preserve the grass texture and UV mapping');
    assert.equal(mesh.material.roughness, before.roughness);
    assert.equal(before.side, DoubleSide, 'Never mutate shared model materials');
    assert.equal(mesh.material.polygonOffset, true);
}
const layer = name => root.getObjectByName(name).material.polygonOffsetUnits;
assert(layer('Main_Garden_Base') < layer('Broad_Terrain'));
assert(layer('Campus_Ground') < layer('Broad_Terrain'));
assert(layer('Broad_Terrain') < layer('PD_Extended_Landscape_Context'));
const road = root.getObjectByName('Outer_Roads');
assert.equal(road.material, original.get(road), 'Roads retain their original rendering');

// A multi-material replacement slab must be isolated too.
const multi = new Mesh(new BoxGeometry(), [materials[3], materials[10]]);
multi.name = 'Main_Garden_Base';
const saved = multi.material;
stabilizeGroundSurfaces(multi);
assert.notEqual(multi.material, saved);
multi.material.forEach((m, i) => {
    assert.notEqual(m, saved[i]);
    assert.equal(m.side, FrontSide);
    assert.equal(m.map, saved[i].map);
});
console.log('PASS: actual exported ground nodes, shared materials, layer order, and multi-material slabs');
