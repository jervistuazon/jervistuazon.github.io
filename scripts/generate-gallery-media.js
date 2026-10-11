'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sharp = require('sharp');
const { collectGalleryAssetReferences, loadGalleryData } = require('./dist-config');

const root = path.resolve(__dirname, '..');
const thumbnailDir = 'assets/gallery-thumbnails';
const videoDir = 'assets/gallery-previews';
const videoManifestPath = path.join(root, 'gallery-video-previews.json');

function digest(bytes) {
    return crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

async function generateGalleryMedia({ videos = false } = {}) {
    const gallery = loadGalleryData(root);
    const referenceSet = collectGalleryAssetReferences(gallery);
    function addPresentationMedia(value) {
        if (Array.isArray(value)) value.forEach(entry => {
            const reference = typeof entry === 'string' ? entry : entry?.src;
            if (reference?.startsWith('presentation/')) referenceSet.add(reference);
        });
        else if (value && typeof value === 'object') Object.values(value).forEach(addPresentationMedia);
    }
    addPresentationMedia(gallery);
    const references = [...referenceSet].sort();
    const media = {};
    const videoManifest = fs.existsSync(videoManifestPath)
        ? JSON.parse(fs.readFileSync(videoManifestPath, 'utf8')) : {};
    fs.mkdirSync(path.join(root, thumbnailDir), { recursive: true });
    if (videos) fs.mkdirSync(path.join(root, videoDir), { recursive: true });

    for (const reference of references) {
        const absolute = path.join(root, reference);
        if (!fs.existsSync(absolute)) throw new Error(`Missing gallery media: ${reference}`);
        if (/\.(webp|png|jpe?g|avif)$/i.test(reference)) {
            const bytes = fs.readFileSync(absolute);
            const hash = digest(bytes);
            const metadata = await sharp(bytes).metadata();
            const orientedWidth = metadata.autoOrient?.width || metadata.width;
            const widths = [...new Set([480, 960, 1440].map(width => Math.min(width, orientedWidth)))];
            const images = [];
            for (const width of widths) {
                const relative = `${thumbnailDir}/${hash}-${width}.webp`;
                const output = path.join(root, relative);
                if (!fs.existsSync(output)) await sharp(bytes).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 76 }).toFile(output);
                images.push({ src: relative, width });
            }
            media[reference] = { images };
        } else if (/\.(mp4|webm)$/i.test(reference)) {
            const sourceHash = digest(fs.readFileSync(absolute));
            if (videos) {
                const preview = `${videoDir}/${sourceHash}-preview.mp4`;
                const poster = `${videoDir}/${sourceHash}-poster.webp`;
                const posterPng = path.join(root, videoDir, `${sourceHash}-poster.png`);
                const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
                execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', absolute,
                    '-t', '6', '-an', '-vf', 'scale=640:-2,fps=20', '-c:v', 'libx264', '-preset', 'medium', '-crf', '29',
                    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(root, preview)]);
                execFileSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', absolute, '-frames:v', '1', '-vf', 'scale=960:-2', posterPng]);
                await sharp(posterPng).webp({ quality: 78 }).toFile(path.join(root, poster));
                fs.unlinkSync(posterPng);
                videoManifest[reference] = { sourceHash, preview, poster };
            }
            const descriptor = videoManifest[reference];
            if (!descriptor || descriptor.sourceHash !== sourceHash) throw new Error(`Regenerate the video preview for ${reference}: npm run media:gallery:videos (FFMPEG_PATH may be set).`);
            for (const relative of [descriptor.preview, descriptor.poster]) {
                if (!fs.existsSync(path.join(root, relative))) throw new Error(`Missing gallery preview: ${relative}`);
            }
            media[reference] = { preview: descriptor.preview, poster: descriptor.poster };
        }
    }
    if (videos) fs.writeFileSync(videoManifestPath, `${JSON.stringify(videoManifest, null, 2)}\n`);
    fs.writeFileSync(path.join(root, 'gallery-media.js'), `window.galleryMedia = ${JSON.stringify(media, null, 2)};\n`);
    console.log(`[OK] Gallery media prepared for ${Object.keys(media).length} source files.`);
    return media;
}

if (require.main === module) generateGalleryMedia({ videos: process.argv.includes('--videos') }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});

module.exports = { generateGalleryMedia };
