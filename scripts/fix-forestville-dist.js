'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const target = path.join(rootDir, 'dist', 'presentation', 'forestville_test', 'index.html');

if (!fs.existsSync(target)) {
    throw new Error(`Missing Forestville dist output: ${target}`);
}

let html = fs.readFileSync(target, 'utf8');
const start = '<!-- FORESTVILLE_MOBILE_LANDSCAPE_FIX_START -->';
const end = '<!-- FORESTVILLE_MOBILE_LANDSCAPE_FIX_END -->';
const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const existingPatch = new RegExp(
    `\\s*${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}\\s*`,
    'g'
);

// Hash the page without the injected runtime patch so the version changes
// whenever the actual Forestville export changes, while repeated builds remain stable.
const baseHtml = html.replace(existingPatch, '\n');
const cacheVersion = crypto
    .createHash('sha256')
    .update(baseHtml)
    .digest('hex')
    .slice(0, 12);

const patch = `
${start}
<style>
  #rotateDeviceFallback {
    --mobile-ui-scale: 1;
    transform: translateX(-50%) scale(var(--mobile-ui-scale)) !important;
    transform-origin: 50% 100%;
  }

  #requestLandscapeButton {
    box-sizing: border-box;
    width: 168px;
    min-width: 168px;
    max-width: 168px;
    height: 42px;
    min-height: 42px;
    max-height: 42px;
    flex: 0 0 168px;
    justify-content: center;
    gap: 8px;
    padding: 9px 14px 9px 11px;
    font-size: 11.2px;
    line-height: 1;
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  #requestLandscapeButton .rotate-device-icon {
    width: 20px;
    min-width: 20px;
    max-width: 20px;
    height: 20px;
    min-height: 20px;
    max-height: 20px;
    flex: 0 0 20px;
  }
</style>
<script>
  (() => {
    const cacheVersion = '${cacheVersion}';
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get('v') !== cacheVersion) {
      currentUrl.searchParams.set('v', cacheVersion);
      window.location.replace(currentUrl.toString());
      return;
    }

    const overlay = document.getElementById('rotateDeviceFallback');
    const button = document.getElementById('requestLandscapeButton');
    const label = button?.querySelector('span');
    if (!overlay || !button || !label) return;

    let settleTimers = [];
    const isPortrait = () => window.matchMedia('(orientation: portrait)').matches;

    const syncLandscapeControl = () => {
      if (!isPortrait()) return;

      label.textContent = 'VIEW LANDSCAPE';
      button.setAttribute('aria-label', 'View landscape fullscreen');
      button.disabled = false;

      const visualScale = Number(window.visualViewport?.scale) || 1;
      const compensation = Math.min(2, Math.max(0.5, 1 / visualScale));
      overlay.style.setProperty('--mobile-ui-scale', String(compensation));
    };

    const scheduleSync = () => {
      settleTimers.forEach(window.clearTimeout);
      settleTimers = [];

      syncLandscapeControl();
      window.requestAnimationFrame(syncLandscapeControl);
      [50, 150, 300, 600].forEach(delay => {
        settleTimers.push(window.setTimeout(syncLandscapeControl, delay));
      });
    };

    window.addEventListener('resize', scheduleSync, { passive: true });
    window.addEventListener('orientationchange', scheduleSync, { passive: true });
    document.addEventListener('fullscreenchange', scheduleSync);
    window.visualViewport?.addEventListener('resize', scheduleSync, { passive: true });
    window.visualViewport?.addEventListener('scroll', scheduleSync, { passive: true });

    if (screen.orientation && typeof screen.orientation.addEventListener === 'function') {
      screen.orientation.addEventListener('change', scheduleSync);
    }

    window.addEventListener('pageshow', scheduleSync, { passive: true });
    scheduleSync();
  })();
</script>
${end}`;

if (!baseHtml.includes('</body>')) {
    throw new Error('Forestville dist output is missing </body>.');
}

html = baseHtml.replace('</body>', `${patch}\n  </body>`);
fs.writeFileSync(target, html);
console.log(`[OK] Forestville dist fix applied with cache version ${cacheVersion}.`);
