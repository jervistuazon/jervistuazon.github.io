const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

console.log('==========================================');
console.log('       BUILD SYSTEM (Minification)        ');
console.log('==========================================');

// Helper to install dependencies if missing
function ensurePackage(pkg) {
    try {
        require.resolve(pkg);
    } catch (e) {
        console.log(`[INFO] Installing ${pkg}...`);
        try {
            execSync(`npm install ${pkg}`, { stdio: 'inherit' });
        } catch (err) {
            console.error(`[ERROR] Failed to install ${pkg}.`);
            process.exit(1);
        }
    }
}

// 1. Install Minifiers
ensurePackage('terser');
ensurePackage('clean-css');

const Terser = require('terser');
const CleanCSS = require('clean-css');

async function build() {
    // 2. Minify JavaScript
    console.log('[INFO] Minifying JavaScript...');
    try {
        const jsCode = fs.readFileSync('script.js', 'utf8');
        const jsMinified = await Terser.minify(jsCode);
        if (jsMinified.error) {
            throw jsMinified.error;
        }
        fs.writeFileSync('script.min.js', jsMinified.code);
        console.log(`[OK] script.js -> script.min.js (${(fs.statSync('script.min.js').size / 1024).toFixed(1)} KB)`);
    } catch (err) {
        console.error('[FAIL] JS Minification failed:', err);
    }

    // 3. Minify CSS
    console.log('[INFO] Minifying CSS...');
    try {
        const cssCode = fs.readFileSync('styles.css', 'utf8');
        const cssOutput = new CleanCSS({}).minify(cssCode);
        if (cssOutput.errors.length > 0) {
            throw new Error(cssOutput.errors.join(', '));
        }
        fs.writeFileSync('styles.min.css', cssOutput.styles);
        console.log(`[OK] styles.css -> styles.min.css (${(fs.statSync('styles.min.css').size / 1024).toFixed(1)} KB)`);
    } catch (err) {
        console.error('[FAIL] CSS Minification failed:', err);
    }

    console.log('==========================================');
    console.log('       BUILD COMPLETE                     ');
    console.log('==========================================');
}

build();
