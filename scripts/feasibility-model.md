# Feasibility model maintenance

The development viewer downloads three content-named `.bin` parts totaling
22,949,705 bytes, compared with the original 69,533,364 bytes (67.0% smaller).
The parts contain one gzip stream. The browser decompresses it to a
36,248,180-byte GLB and Three.js decodes `EXT_meshopt_compression` using the
locally shipped Meshopt decoder. A local fflate fallback supports browsers
without `DecompressionStream`.

Compression preserves vertex/index bytes, texture pixels, scene hierarchy,
material names, and bindings. It deduplicates embedded image bytes, optimizes
PNG encoding, and losslessly encodes geometry. It does not reduce GPU memory,
triangle counts, or draw calls. Avoid quantization or hierarchy flattening:
the procedural grass uses local vertex coordinates and the tower controls use
exported node names.

Use the Node version in `.node-version`, run `npm ci`, and retain the original
export outside the deployed site. The original split model is also recoverable
from commit `92fec9a366e92d6a5805c6e815fd6f4b21f7f293` by concatenating the
`development/model.part-00.bin` through `model.part-08.bin` files in that order.

```sh
node scripts/optimize-feasibility-model.mjs /path/to/original.glb /tmp/optimized.glb presentation/site_feasibility/development
npm run check:update
```

The optimizer checks every decoded geometry buffer and texture pixel against
the input before writing the optimized output. The manifest records SHA-256
fingerprints used by `test:feasibility`; that test also exercises native and
fallback gzip decoding and the actual shipped Three.js loader. When replacing
an export, remove obsolete model parts after verifying the new manifest, and
advance the viewer/manifest/module cache versions together. Keep vendored
decoder versions and their licenses aligned with pinned development packages.

The original export has six validator errors for null material attenuation
distances and one extra texture-channel property warning. The optimization
preserves those material definitions; validating reconstructed decoded assets
produced identical issues before and after compression.

For browser QA, run the production build before `npm run dev -- --port 4173`.
The preview config serves the built feasibility route and resolves its local
Three.js import map. Verify tower focus, layers, orbit, retry, and return to
Context in a WebGL-enabled browser.
