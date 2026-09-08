// Keep material conversion compatible with unlit glTF exports and shared slots.
export function createMaterialConverter(THREE, config) {
    const converted = new WeakMap();
    return function convertMaterial(source) {
        if (Array.isArray(source)) return source.map(convertMaterial);
        if (!source) return source;
        if (converted.has(source)) return converted.get(source);

        let material = source;
        if (!source.isMeshPhysicalMaterial) {
            material = new THREE.MeshPhysicalMaterial();
            if (source.isMeshStandardMaterial) {
                THREE.MeshStandardMaterial.prototype.copy.call(material, source);
            } else {
                // MeshBasicMaterial has no emissive/PBR fields. Standard.copy()
                // would call Color.copy(undefined) and abort the whole viewer.
                THREE.Material.prototype.copy.call(material, source);
                for (const key of ['color', 'emissive', 'normalScale']) {
                    if (source[key] && material[key]) material[key].copy(source[key]);
                }
                for (const key of [
                    'map', 'alphaMap', 'lightMap', 'lightMapIntensity',
                    'aoMap', 'aoMapIntensity', 'envMap', 'normalMap',
                    'bumpMap', 'bumpScale', 'displacementMap',
                    'displacementScale', 'displacementBias', 'wireframe',
                    'wireframeLinewidth', 'flatShading'
                ]) {
                    if (source[key] !== undefined) material[key] = source[key];
                }
            }
        }
        material.shadowSide = THREE.DoubleSide;
        material.roughness = config.disableReflections ? 1 : config.roughness;
        material.metalness = config.disableReflections ? 0 : config.metalness;
        material.specularIntensity = config.disableReflections ? 0 : config.specularIntensity;
        if (!config.disableReflections) material.envMapIntensity = config.envMapIntensity;
        converted.set(source, material);
        return material;
    };
}
