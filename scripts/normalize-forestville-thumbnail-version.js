'use strict';

const fs = require('fs');

const galleryPath = 'gallery-data.js';
const source = fs.readFileSync(galleryPath, 'utf8');
const normalized = source.replace(
    /(presentation\/forestville\/assets\/video_thumbnail\.mp4)(?:\?v=\d+)?/g,
    '$1'
);

if (normalized !== source) {
    fs.writeFileSync(galleryPath, normalized);
    console.log('[OK] Normalized Forestville gallery thumbnail cache suffix before Cloudflare build.');
} else {
    console.log('[INFO] Forestville gallery thumbnail URL already normalized.');
}
