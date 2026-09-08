import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../presentation/white_model/vendor/three.module.js';
import { createMaterialConverter } from '../presentation/white_model/materials.js';

const config = { roughness: 0.5, metalness: 0.05, envMapIntensity: 1, specularIntensity: 1 };

test('unlit model materials convert without missing-emissive crash and keep textures/color', () => {
    const map = new THREE.Texture();
    const source = new THREE.MeshBasicMaterial({ color: 0xaabbcc, map, transparent: true, opacity: 0.6, side: THREE.DoubleSide, alphaTest: 0.2 });
    const convert = createMaterialConverter(THREE, config);
    const material = convert(source);
    assert(material.isMeshPhysicalMaterial);
    assert.notEqual(material, source);
    assert(material.color.equals(source.color));
    assert.equal(material.map, map);
    for (const key of ['transparent', 'opacity', 'side', 'alphaTest']) assert.equal(material[key], source[key]);
    assert.equal(material.roughness, config.roughness);
    assert.equal(material.emissive.getHex(), 0);
    assert.equal(convert(source), material, 'Shared source material stays shared');
    assert.deepEqual(convert([source, source]), [material, material]);
    assert.equal(source.type, 'MeshBasicMaterial', 'Source is not changed');
});

test('standard and physical material paths preserve compatible PBR properties', () => {
    const source = new THREE.MeshStandardMaterial({ emissive: 0x123456, roughness: 0.9 });
    const physical = createMaterialConverter(THREE, config)(source);
    assert(physical.emissive.equals(source.emissive));
    assert.equal(physical.roughness, 0.5);
    const originalPhysical = new THREE.MeshPhysicalMaterial({ clearcoat: 0.7 });
    assert.equal(createMaterialConverter(THREE, config)(originalPhysical), originalPhysical);
    assert.equal(originalPhysical.clearcoat, 0.7);
});

test('disabled reflections remain disabled for every material slot', () => {
    const convert = createMaterialConverter(THREE, { ...config, disableReflections: true });
    const output = convert([new THREE.MeshBasicMaterial(), new THREE.MeshStandardMaterial()]);
    for (const material of output) {
        assert.equal(material.roughness, 1);
        assert.equal(material.metalness, 0);
        assert.equal(material.specularIntensity, 0);
        assert.equal(material.shadowSide, THREE.DoubleSide);
    }
});
