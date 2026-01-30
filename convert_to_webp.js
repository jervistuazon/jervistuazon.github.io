const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const ASSETS_DIR = path.join(__dirname, 'assets');
const FILES_TO_UPDATE = [
    path.join(__dirname, 'gallery-data.js'),
    path.join(__dirname, 'styles.css'),
    path.join(__dirname, 'index.html'),
    path.join(__dirname, '404.html')
];

const QUALITY = 80;

console.log('==========================================');
console.log('   IMAGE OPTIMIZER (WebP Converter)       ');
console.log('==========================================');

// Check if 'sharp' is installed
try {
    require.resolve('sharp');
} catch (e) {
    console.log('[INFO] Installing "sharp" library for image processing...');
    try {
        execSync('npm install sharp', { stdio: 'inherit' });
    } catch (err) {
        console.error('[ERROR] Failed to install "sharp". Please run "npm install sharp" manually.');
        process.exit(1);
    }
}

const sharp = require('sharp');

// recursive function to find files
function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        const fullPath = path.join(dirPath, file);
        if (fs.statSync(fullPath).isDirectory()) {
            arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
        } else {
            if (/\.(png|jpg|jpeg)$/i.test(file)) {
                arrayOfFiles.push(fullPath);
            }
        }
    });

    return arrayOfFiles;
}

async function convertImages() {
    console.log(`[INFO] Scanning directory: ${ASSETS_DIR}`);
    const files = getAllFiles(ASSETS_DIR);
    console.log(`[INFO] Found ${files.length} images to optimize.`);

    let converted = 0;
    let savedSpace = 0;

    for (const file of files) {
        // Skip favicon (browsers prefer ico/png)
        if (file.includes('favicon')) continue;

        const ext = path.extname(file);
        const webpPath = file.replace(ext, '.webp');

        // Check if we need to convert
        try {
            const originalSize = fs.statSync(file).size;

            // If WebP exists and is younger than original, skip?
            // For now, simple overwrite logic

            await sharp(file)
                .webp({ quality: QUALITY })
                .toFile(webpPath);

            const newSize = fs.statSync(webpPath).size;
            const savings = originalSize - newSize;
            savedSpace += savings;

            converted++;
            console.log(`[OK] Converted: ${path.basename(file)} -> ${path.basename(webpPath)} (Saved ${(savings / 1024).toFixed(1)} KB)`);

        } catch (err) {
            console.error(`[ERROR] Failed to convert ${path.basename(file)}: ${err.message}`);
        }
    }

    console.log('\n==========================================');
    console.log(`[DONE] Converted ${converted} images.`);
    console.log(`[INFO] Total space saved: ${(savedSpace / 1024 / 1024).toFixed(2)} MB`);

    // Update Code References
    console.log('\n[INFO] Updating code references from .png/.jpg to .webp...');
    updateCodeReferences();

    console.log('==========================================');
}

function updateCodeReferences() {
    FILES_TO_UPDATE.forEach(filePath => {
        if (fs.existsSync(filePath)) {
            let content = fs.readFileSync(filePath, 'utf8');
            let updated = false;

            // Regex to replace .png, .jpg, .jpeg with .webp
            // Avoids changing favicon.png or external links if possible, but global replace is usually fine for these specific project files
            // We use a negative lookbehind or check to avoid replacing things we explicitely excluded?
            // "favicon.png" exclusion:

            // Strategy: Replace all .png/.jpg/.jpeg INSIDE known asset paths or data structures
            // Simpler: Just replace all except favicon.png

            const originalContent = content;

            content = content.replace(/(?<!favicon)\.png/gi, '.webp');
            content = content.replace(/\.jpg/gi, '.webp');
            content = content.replace(/\.jpeg/gi, '.webp');

            if (content !== originalContent) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`[UPDATED] ${path.basename(filePath)}`);
            } else {
                console.log(`[NO CHANGE] ${path.basename(filePath)}`);
            }
        }
    });
}

convertImages();
