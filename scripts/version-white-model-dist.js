'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const modelPath = path.join(rootDir, 'dist', 'presentation', 'white_model', 'model.glb');
const indexPath = path.join(rootDir, 'dist', 'presentation', 'white_model', 'index.html');

function requireFile(filePath, label) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(`Missing ${label}: ${path.relative(rootDir, filePath)}`);
    }
}

function main() {
    requireFile(modelPath, 'white model GLB');
    requireFile(indexPath, 'white model index');

    const modelHash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(modelPath))
        .digest('hex')
        .slice(0, 16);

    let html = fs.readFileSync(indexPath, 'utf8');
    const modelReference = /(const\s+modelData\s*=\s*["']\.\/model\.glb)(?:\?v=[^"']+)?(["'];)/;

    if (!modelReference.test(html)) {
        throw new Error('Could not find the white-model modelData reference to cache-bust.');
    }

    html = html.replace(modelReference, `$1?v=${modelHash}$2`);
    fs.writeFileSync(indexPath, html);

    console.log(`[OK] white_model/model.glb cache version: ${modelHash}`);
}

try {
    main();
} catch (error) {
    console.error(`[ERROR] White model cache busting failed: ${error.message}`);
    process.exitCode = 1;
}
