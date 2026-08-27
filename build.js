// Forestville mobile patch workflow trigger: 2026-08-27
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
    const requestedVersion = process.env.BUILD_VERSION;
    if (requestedVersion !== undefined && !/^\d+$/.test(requestedVersion)) {
        throw new Error(`BUILD_VERSION must contain only digits; received: ${requestedVersion}`);
    }
    const version = requestedVersion || Date.now().toString();
    let buildFailed = false;

    // 2. Update cache-busted public URLs before minifying
    console.log('[INFO] Updating cache-busted public URLs...');
    try {
        let scriptJs = fs.readFileSync('script.js', 'utf8');
        scriptJs = scriptJs.replace(
            /(const INTERACTIVE_PRESENTATION_DEMO_URL = ['"]presentation\/interactive_presentation_demo\/)(?:\?v=\d+)?(['"];)/,
            `$1?v=${version}$2`
        );
        fs.writeFileSync('script.js', scriptJs);

        let galleryData = fs.readFileSync('gallery-data.js', 'utf8');
        galleryData = galleryData.replace(
            /("href":\s*"presentation\/interactive_presentation_demo\/)(?:\?v=\d+)?(")/g,
            `$1?v=${version}$2`
        );
        // Also update cinematic web presentation href cache buster
        galleryData = galleryData.replace(
            /("href":\s*"presentation\/cinematic_web_presentation\/)(?:\?v=\d+)?(")/g,
            `$1?v=${version}$2`
        );
        fs.writeFileSync('gallery-data.js', galleryData);

        console.log(`[OK] Public URLs updated with version: ${version}`);
    } catch (err) {
        console.error('[FAIL] Public URL version update failed:', err);
        buildFailed = true;
    }

    // 2a. Update cinematic web presentation sub-assets
    console.log('[INFO] Updating cinematic web presentation sub-assets...');
    try {
        const cinematicIndexPath = path.join('presentation', 'cinematic_web_presentation', 'index.html');
        let cinematicIndexHtml = fs.readFileSync(cinematicIndexPath, 'utf8');

        // Update css references
        cinematicIndexHtml = cinematicIndexHtml.replace(/(href="styles\.css)(?:\?v=\d+)?(")/g, `$1?v=${version}$2`);

        // Update js references
        cinematicIndexHtml = cinematicIndexHtml.replace(/(src="script\.js)(?:\?v=\d+)?(")/g, `$1?v=${version}$2`);

        // Update video references, including deferred data-src URLs used by the scrub loader.
        cinematicIndexHtml = cinematicIndexHtml.replace(/((?:data-)?src="Video\/[^"]+\.mp4)(?:\?v=\d+)?(")/g, `$1?v=${version}$2`);

        fs.writeFileSync(cinematicIndexPath, cinematicIndexHtml);
        console.log(`[OK] cinematic_web_presentation/index.html updated with version: ${version}`);
    } catch (err) {
        console.error('[FAIL] Cinematic presentation asset version update failed:', err);
        buildFailed = true;
    }

    // 2b. Keep Forestville's mobile landscape control stable across
    // fullscreen/orientation transitions. The exported presentation is a
    // generated single-file HTML, so inject this idempotent runtime patch at
    // build time so future re-exports cannot reintroduce the stale button state.
    console.log('[INFO] Applying Forestville mobile landscape control fix...');
    try {
        const forestvilleIndexPath = path.join('presentation', 'forestville_test', 'index.html');
        let forestvilleIndexHtml = fs.readFileSync(forestvilleIndexPath, 'utf8');
        const patchStart = '<!-- FORESTVILLE_MOBILE_LANDSCAPE_FIX_START -->';
        const patchEnd = '<!-- FORESTVILLE_MOBILE_LANDSCAPE_FIX_END -->';
        const existingPatchPattern = new RegExp(
            '\\s*' + patchStart.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') +
            '[\\s\\S]*?' + patchEnd.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&') + '\\s*',
            'g'
        );
        forestvilleIndexHtml = forestvilleIndexHtml.replace(existingPatchPattern, '\n');

        const forestvilleMobileFix = `
${patchStart}
<style>
  /* Stable touch target: label changes must never resize the mobile control. */
  #requestLandscapeButton {
    width: 168px;
    min-width: 168px;
    justify-content: center;
  }
</style>
<script>
  (() => {
    const button = document.getElementById('requestLandscapeButton');
    const label = button?.querySelector('span');
    if (!button || !label) return;

    const resetLandscapeButton = () => {
      if (!window.matchMedia('(orientation: portrait)').matches) return;
      label.textContent = 'VIEW LANDSCAPE';
      button.setAttribute('aria-label', 'View landscape fullscreen');
      button.disabled = false;
    };

    // Returning from landscape can happen through a physical rotation,
    // fullscreen exit, browser UI gesture, or an orientation-lock release.
    // Cover both authoritative browser state transitions and defer one frame so
    // matchMedia/visualViewport have settled before restoring the control.
    const scheduleReset = () => {
      window.requestAnimationFrame(() => {
        window.setTimeout(resetLandscapeButton, 0);
      });
    };

    window.addEventListener('orientationchange', scheduleReset, { passive: true });
    document.addEventListener('fullscreenchange', scheduleReset);
    if (screen.orientation && typeof screen.orientation.addEventListener === 'function') {
      screen.orientation.addEventListener('change', scheduleReset);
    }
    window.addEventListener('pageshow', scheduleReset, { passive: true });
  })();
<\/script>
${patchEnd}`;

        if (!forestvilleIndexHtml.includes('</body>')) {
            throw new Error('Forestville export is missing </body>; cannot inject mobile fix safely.');
        }
        forestvilleIndexHtml = forestvilleIndexHtml.replace('</body>', `${forestvilleMobileFix}\n  </body>`);
        fs.writeFileSync(forestvilleIndexPath, forestvilleIndexHtml);
        console.log('[OK] forestville_test mobile landscape control fix applied.');
    } catch (err) {
        console.error('[FAIL] Forestville mobile landscape control fix failed:', err);
        buildFailed = true;
    }

    // 3. Minify JavaScript
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
        buildFailed = true;
    }

    // 4. Minify CSS
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
        buildFailed = true;
    }

    // 5. Update index.html versioning for Cache Busting
    console.log('[INFO] Updating index.html versioning...');
    try {
        let indexHtml = fs.readFileSync('index.html', 'utf8');

        // Update CSS references
        indexHtml = indexHtml.replace(/(href="styles(?:\.min)?\.css)(?:\?v=\d+)?(")/g, `$1?v=${version}$2`);

        // Update JS references
        indexHtml = indexHtml.replace(/(src="script(?:\.min)?\.js)(?:\?v=\d+)?(")/g, `$1?v=${version}$2`);

        // Update gallery-data.js reference
        indexHtml = indexHtml.replace(/(src="gallery-data\.js)(?:\?v=\d+)?(")/g, `$1?v=${version}$2`);

        fs.writeFileSync('index.html', indexHtml);
        console.log(`[OK] index.html updated with version: ${version}`);
    } catch (err) {
        console.error('[FAIL] index.html version update failed:', err);
        buildFailed = true;
    }

    if (buildFailed) {
        console.error('==========================================');
        console.error('       BUILD FAILED                       ');
        console.error('==========================================');
        process.exitCode = 1;
        return;
    }

    console.log('==========================================');
    console.log('       BUILD COMPLETE                     ');
    console.log('==========================================');
}

build();
