import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4' };
const server = http.createServer(async (request, response) => {
    try {
        let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (name.endsWith('/')) name += 'index.html';
        const file = path.resolve(dist, `.${name}`);
        if (!file.startsWith(dist + path.sep)) throw new Error('Invalid path');
        const bytes = await fs.readFile(file);
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
        response.end(bytes);
    } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || undefined });
const errors = [];
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://cdn.jsdelivr.net/npm/lenis@1.1.20/dist/lenis.min.js', route => route.fulfill({ path: path.join(root, 'node_modules/lenis/dist/lenis.min.js'), contentType: 'text/javascript' }));
    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    const origin = `http://127.0.0.1:${server.address().port}`;
    await page.goto(origin);
    await page.waitForSelector('.gallery-item');
    assert.equal(await page.evaluate(() => lenis.options.smoothWheel), false);
    assert.equal(await page.evaluate(() => scrollAnimationFrame), null);
    await page.evaluate(() => filterGallery('interactive-presentation'));
    await page.waitForSelector('video[data-autoplay-on-visible]');
    assert.equal(await page.locator('video[data-autoplay-on-visible][src]').count(), 0, 'reduced motion must not fetch video sources automatically');
    assert.ok(await page.locator('video[data-autoplay-on-visible][poster]').count() >= 3, 'every gallery video has a poster');
    assert.equal(requests.filter(url => /\.mp4(?:[?]|$)/.test(url)).length, 0);
    await page.evaluate(() => filterGallery('residential'));
    const image = page.locator('.gallery-img').first();
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(img => img.decode());
    assert.match(await image.getAttribute('srcset'), /480w/);
    assert.match(await image.evaluate(img => img.currentSrc), /gallery-thumbnails\//);
    assert.ok(await image.evaluate(img => img.naturalWidth) <= 1440);
    assert.equal(await page.evaluate(() => hoverSlideshowStops.size), await page.locator('.gallery-item').evaluateAll(items => items.filter(item => item.stopHoverSlideshow).length));
    await page.locator('.gallery-item').first().click();
    await page.waitForSelector('#lightbox.active');
    assert.ok(await page.locator('#lightbox img.lightbox-content').count() > 0, 'full original remains available through lightbox');
    await page.keyboard.press('Escape');
    await page.evaluate(() => filterGallery('interactive-presentation'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const video = page.locator('video[data-autoplay-on-visible]').first();
    await video.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => [...document.querySelectorAll('video[data-autoplay-on-visible]')].some(video => video.hasAttribute('src')));
    assert.match(await video.getAttribute('src'), /gallery-previews\/.*-preview\.mp4/);
    await page.waitForFunction(() => [...document.querySelectorAll('video[data-autoplay-on-visible]')].some(video => !video.paused));
    // Reproduce a coalesced media-query notification: matches changes without
    // dispatching change, while native automatic playback is already active.
    await page.evaluate(() => Object.defineProperty(reducedMotionQuery, 'matches', { configurable: true, value: true }));
    await page.waitForFunction(() => [...document.querySelectorAll('video[data-autoplay-on-visible]')].every(video => video.paused));
    await page.evaluate(() => { delete reducedMotionQuery.matches; reconcileGalleryPlayback(); updateScrollMotion(); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => reducedMotionQuery.matches && [...document.querySelectorAll('video[data-autoplay-on-visible]')].every(video => video.paused), undefined, { timeout: 5000 }).catch(async error => {
        console.error({ errors, state: await page.evaluate(() => ({ matches: reducedMotionQuery.matches, videos: [...document.querySelectorAll('video[data-autoplay-on-visible]')].map(video => ({ paused: video.paused, src: video.src })) })) });
        throw error;
    });
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('video[data-autoplay-on-visible]')].every(video => video.paused)), true);
    assert.equal(await page.evaluate(() => scrollAnimationFrame), null);
    await page.evaluate(() => filterGallery('commercial'));
    assert.equal(await page.evaluate(() => visibleGalleryVideos.size), 0);
    await page.evaluate(() => filterGallery('featured'));
    const screenshots = process.env.GALLERY_SCREENSHOT_DIR || path.join(root, 'test-artifacts');
    await fs.mkdir(screenshots, { recursive: true });
    await page.screenshot({ path: path.join(screenshots, 'portfolio-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(screenshots, 'portfolio-mobile.png'), fullPage: false });
    assert.deepEqual(errors, [], 'no browser runtime errors');
    await context.close();
    console.log('[OK] Gallery browser checks: reduced motion, deferred video, responsive images, originals, live preference changes, filtering cleanup.');
} finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
}
