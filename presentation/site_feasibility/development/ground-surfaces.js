import { FrontSide } from './vendor/three.module.js';

// The exported site uses very thin, double-sided ground slabs. At the saved
// 1/600 scale, their separation is only a few depth-buffer steps in overview
// views. Render their tops once and bias the supporting layers away from the
// camera so they cannot compete with paths, water, roads, or each other.
const groundLayers = new Map([
    ['Main_Garden_Base', 1],
    ['Campus_Ground', 1],
    ['Broad_Terrain', 2],
    ['PD_Extended_Landscape_Context', 3],
]);

export function stabilizeGroundSurfaces(root) {
    root.traverse(mesh => {
        if (!mesh.isMesh) return;
        const layer = groundLayers.get(mesh.name);
        if (layer === undefined) return;

        const prepare = material => {
            // Grass is shared with other model parts; never alter it globally.
            const ground = material.clone();
            ground.side = FrontSide;
            ground.polygonOffset = true;
            ground.polygonOffsetFactor = layer;
            ground.polygonOffsetUnits = layer;
            return ground;
        };
        mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(prepare)
            : prepare(mesh.material);
    });
}
