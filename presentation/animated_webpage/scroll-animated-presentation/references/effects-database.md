# Effects Database

This is the reusable effect registry for the scroll animated presentation. Read it before changing `index.html`, `styles.css`, or `script.js`.

Use each effect as a contract:

- `Purpose` explains why the effect exists.
- `Current implementation` points to the live code.
- `Template` shows the minimum pattern to reuse.
- `Tuning knobs` lists values that can be changed safely.
- `Watch outs` lists common ways the effect breaks.
- `Verification` lists checks to run after editing.

## EFX-001: Scroll-Scrubbed Video Timeline

**Purpose**

Map page scroll progress directly to the video timeline so scrolling down advances the video and scrolling up rewinds it.

**Current implementation**

- HTML video: `index.html` `#scrollVideo`
- Mobile video source: `index.html` `Video/Sequence 01_mobile_scrub.mp4`
- Stage and sections: `index.html` `.scroll-stage`, `.panel`
- Progress source: `script.js` `getScrollableDistance()`, `getScrollProgress()`
- Video time mapping: `script.js` `setVideoTime()`, `flushVideoSeek()`
- Initialization: `script.js` `initializeVideoScrub()`

**Template**

```html
<main class="scroll-stage">
  <video
    id="scrollVideo"
    class="scroll-video"
    muted
    playsinline
    preload="auto"
    controlslist="nodownload nofullscreen noremoteplayback"
    disablepictureinpicture
    disableremoteplayback
  >
    <source src="Video/example_mobile_scrub.mp4" type="video/mp4" media="(max-width: 760px), (pointer: coarse)">
    <source src="Video/example_scrub.mp4" type="video/mp4">
  </video>
  <section class="panel"></section>
  <section class="panel"></section>
</main>
```

```js
const video = document.querySelector("#scrollVideo");
const stage = document.querySelector(".scroll-stage");

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getScrollableDistance() {
  return Math.max(stage.offsetHeight - window.innerHeight, 1);
}

function getScrollProgress() {
  return clamp((window.scrollY - stage.offsetTop) / getScrollableDistance(), 0, 1);
}

function updateVideoFromScroll() {
  if (!video.duration) return;
  video.pause();
  video.currentTime = video.duration * getScrollProgress();
}

video.addEventListener("loadedmetadata", updateVideoFromScroll);
window.addEventListener("scroll", updateVideoFromScroll, { passive: true });
```

**Tuning knobs**

- Page duration is controlled by the number and height of `.panel` sections.
- Use `height: 100vh` for normal presentation pacing.
- Use a scrub-optimized MP4. Current script: `scripts/reencode-scroll-video.ps1`.

**Watch outs**

- Do not use video playback as the timeline source.
- Do not map progress per section unless building a deliberately chaptered timeline.
- Sparse video keyframes can look frozen or jumpy even when JavaScript is correct.

**Verification**

- First frame is visible before scrolling.
- Downward scroll moves video forward.
- Upward scroll rewinds video.
- All panels contribute to the same continuous timeline.

## EFX-002: Spring-Smoothed Video Seeking

**Purpose**

Keep direct scroll as the truth while smoothing the visible video seek position to reduce harsh frame jumps.

**Current implementation**

- Tuning object: `script.js` `motion`
- Target progress: `script.js` `targetProgress`
- Rendered progress: `script.js` `renderedProgress`
- Animation loop: `script.js` `drawFrame()`, `requestDraw()`
- Seek throttling: `script.js` `flushVideoSeek()`
- Mobile seek profile: `script.js` `isMobileScrub`, `motion.mobileFollow`

**Template**

```js
let targetProgress = 0;
let renderedProgress = 0;
let progressVelocity = 0;
let lastFrameTime = 0;

const motion = {
  spring: 260,
  damping: 27,
  maxDeltaSeconds: 0.04,
  settleDistance: 0.00004,
  settleVelocity: 0.0004,
};

function drawFrame(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;
  const deltaSeconds = Math.min((timestamp - lastFrameTime) / 1000, motion.maxDeltaSeconds);
  lastFrameTime = timestamp;

  const progressDelta = targetProgress - renderedProgress;
  const acceleration = progressDelta * motion.spring;
  const drag = Math.exp(-motion.damping * deltaSeconds);

  progressVelocity = (progressVelocity + acceleration * deltaSeconds) * drag;
  renderedProgress = clamp(renderedProgress + progressVelocity * deltaSeconds, 0, 1);

  if (
    Math.abs(targetProgress - renderedProgress) < motion.settleDistance &&
    Math.abs(progressVelocity) < motion.settleVelocity
  ) {
    renderedProgress = targetProgress;
    progressVelocity = 0;
  }

  setVideoTime(renderedProgress, timestamp, progressVelocity === 0);
  updateSceneProgress();

  if (renderedProgress !== targetProgress || progressVelocity !== 0) {
    requestAnimationFrame(drawFrame);
  } else {
    lastFrameTime = 0;
  }
}
```

**Tuning knobs**

- `spring`: higher catches up faster (desktop: 260, mobile: 340).
- `damping`: higher reduces overshoot (desktop: 27, mobile: 34).
- `seekInterval`: lower seeks more often but may increase CPU cost. On mobile, we use `1000 / 24` (41.6ms) to align perfectly with the mobile video's native 24 FPS framerate, matching desktop performance while maximizing smooth frame updates.
- `seekPrecision`: lower allows finer, more continuous time updates. On mobile, we use `1 / 24` (41.6ms) to match the native 24 FPS framerate. This prevents high CPU overhead from redundant seeks to identical frames that lie on sub-frame time steps, while still maintaining full frame-by-frame scrubbing resolution.
- Mobile/touch devices should use the lower-resolution mobile file with exact `currentTime` seeks; avoid `fastSeek()` when slow swipes need frame-to-frame continuity.

**Watch outs**

- Over-smoothing makes video feel detached from scroll.
- Mobile spring smoothing can look like rubber-banding after native swipe momentum; use no-overshoot follow smoothing for touch devices.
- Seeking every tiny delta can overload the decoder.
- Always clamp progress to `0..1`.

**Verification**

- Quick scrolls settle smoothly to the correct frame.
- Slow scrolls still feel responsive.
- On mobile, slow swipe-down scrolling advances the video without visible keyframe stepping.
- CPU does not spike noticeably while scrolling.

## EFX-003: Media-Control Suppression

**Purpose**

Prevent browser UI from making the video feel like a normal media player.

**Current implementation**

- HTML attributes: `index.html` `#scrollVideo`
- Runtime lock: `script.js` `lockVideoAtProgress()`, `keepVideoScrubOnly()`
- Event suppression: `script.js` `play` and `contextmenu` listeners
- CSS non-interaction: `styles.css` `.scroll-video { pointer-events: none; }`

**Template**

```html
<video
  muted
  playsinline
  preload="auto"
  controlslist="nodownload nofullscreen noremoteplayback"
  disablepictureinpicture
  disableremoteplayback
  draggable="false"
></video>
```

```js
video.controls = false;
video.pause();
video.addEventListener("play", () => video.pause());
video.addEventListener("contextmenu", (event) => event.preventDefault());
```

```css
.scroll-video {
  pointer-events: none;
  -webkit-user-drag: none;
}
```

**Tuning knobs**

- None for the core behavior. Keep this strict unless the product intentionally needs media controls.

**Watch outs**

- Some browsers may still expose limited media actions in native long-press menus.
- Do not add `controls`.

**Verification**

- No play, download, picture-in-picture, remote playback, or fullscreen control appears.

## EFX-004: Custom Inertial Wheel And Keyboard Scroll

**Purpose**

Give scroll navigation a controlled motion feel without changing the scroll-to-video source of truth.

**Current implementation**

- Tuning object: `script.js` `scrollMotion`
- Wheel smoothing: `script.js` `handleWheel()`, `runSmoothScroll()`
- Keyboard smoothing: `script.js` `handleKeydown()`
- Programmatic scroll tracking: `script.js` `setProgrammaticScroll()`, `handleScroll()`

**Template**

```js
let smoothScrollId = null;
let smoothScrollY = window.scrollY;
let targetScrollY = window.scrollY;
let scrollAnimationVelocity = 0;
let lastSmoothScrollTime = 0;

const scrollMotion = {
  spring: 185,
  damping: 23,
  wheelMultiplier: 0.82,
  maxDeltaSeconds: 0.04,
};

function runSmoothScroll(timestamp) {
  if (!lastSmoothScrollTime) lastSmoothScrollTime = timestamp;
  const deltaSeconds = Math.min((timestamp - lastSmoothScrollTime) / 1000, scrollMotion.maxDeltaSeconds);
  lastSmoothScrollTime = timestamp;

  const distance = targetScrollY - smoothScrollY;
  const acceleration = distance * scrollMotion.spring;
  const drag = Math.exp(-scrollMotion.damping * deltaSeconds);

  scrollAnimationVelocity = (scrollAnimationVelocity + acceleration * deltaSeconds) * drag;
  smoothScrollY = clamp(smoothScrollY + scrollAnimationVelocity * deltaSeconds, 0, getMaxScrollY());
  window.scrollTo(0, smoothScrollY);

  if (Math.abs(targetScrollY - smoothScrollY) > 0.35 || Math.abs(scrollAnimationVelocity) > 4) {
    smoothScrollId = requestAnimationFrame(runSmoothScroll);
  } else {
    smoothScrollId = null;
    lastSmoothScrollTime = 0;
  }
}
```

**Tuning knobs**

- `wheelMultiplier`: lower means less distance per wheel event.
- `spring`: higher means faster movement toward target.
- `damping`: higher means less glide.
- Keyboard deltas in `handleKeydown()`.

**Watch outs**

- `wheel` listener must be `{ passive: false }` when calling `preventDefault()`.
- Do not block horizontal wheel gestures or pinch zoom.
- Programmatic scrolls should not recursively fight native scroll state.

**Verification**

- Wheel, trackpad, arrow keys, Page Up/Down, Home, End, and Space feel controlled.
- Browser does not jump unpredictably after the smooth scroll settles.

## EFX-005: Section Snap After Scroll Settles

**Purpose**

Let users land neatly near section starts without making the video jump between slides.

**Current implementation**

- Snap points: `script.js` `getNavigationPoints()`, `getSnapPoints()`, `getNearestSnapPoint()`
- Settling: `script.js` `settleToNearestSection()`, `scheduleSectionSettle()`
- Mobile guard: `script.js` `scheduleSectionSettle()` exits on `isMobileScrub`

**Template**

```js
function getSnapPoints() {
  return sections.map((section) => section.offsetTop);
}

function getNearestSnapPoint(value) {
  return getSnapPoints().reduce((nearest, point) => {
    return Math.abs(point - value) < Math.abs(nearest - value) ? point : nearest;
  }, 0);
}

function settleToNearestSection() {
  const snapPoint = getNearestSnapPoint(targetScrollY);
  const snapRange = window.innerHeight * 0.24;
  if (Math.abs(snapPoint - targetScrollY) <= snapRange) {
    targetScrollY = snapPoint;
    requestSmoothScroll();
  }
}
```

**Tuning knobs**

- `snapRange`: larger catches more scroll positions.
- `snapMinDistance`: avoids tiny corrections that feel jittery.
- `settleDelay`: how long after scrolling stops before snapping begins.

**Watch outs**

- Snapping too aggressively makes the experience feel like separate slides.
- Avoid section snapping on touch/mobile; native momentum plus snap correction can look like scrub rubber-banding.
- Snap points must match section offsets and rail marker destinations.

**Verification**

- Natural scroll still controls the video continuously.
- Near a section boundary, the page settles cleanly.
- Mid-section scrolling does not unexpectedly jump.
- On mobile, releasing after a swipe does not pull the page back to a section boundary.

## EFX-006: Minimal Side Rail Progress

**Purpose**

Show page progress and provide section navigation without competing with the video.

**Current implementation**

- HTML rail: `index.html` `.side-rail`, `.rail-mark`
- CSS rail line and active fill: `styles.css` `.side-rail::before`, `.side-rail::after`, `.rail-mark`
- Progress variable: `script.js` `setActiveMark()`
- Click navigation: `script.js` rail and mark click listeners

**Template**

```html
<aside class="side-rail" aria-label="Page sections">
  <a class="rail-mark is-active" href="#scene-1" aria-label="Section 1"></a>
  <a class="rail-mark" href="#scene-2" aria-label="Section 2"></a>
</aside>
```

```css
.side-rail::after {
  height: calc((100% - 32px) * var(--rail-progress));
}

.rail-mark.is-active {
  border-color: var(--accent);
  background: var(--accent);
}
```

```js
document.documentElement.style.setProperty("--rail-progress", railProgress.toFixed(4));
marks.forEach((mark, index) => {
  mark.classList.toggle("is-active", index === activeIndex);
});
```

**Tuning knobs**

- Rail side, marker size, marker gap, active glow, and click destination logic.
- Use `getRailProgress()` when section offsets are not evenly distributed.

**Watch outs**

- Keep the rail secondary and out of text-safe areas on mobile.
- Marker count should match navigation points.

**Verification**

- The fill line tracks page position.
- Active marker updates near the expected section.
- Clicking a marker scrolls smoothly to the correct scene.

## EFX-007: Scroll-Driven Reveal Motion

**Purpose**

Reveal text and assets based on section viewport progress instead of fixed CSS animation timing.

**Current implementation**

- HTML markers: `index.html` `.reveal`, `.reveal-left`, `.reveal-right`, `.reveal-up`, `.reveal-scale`, `.delay-*`
- CSS variables and base transform: `styles.css` `.reveal`
- Direction profiles: `styles.css` `.reveal-left`, `.reveal-right`, `.reveal-up`, `.reveal-scale`
- Runtime vector logic: `script.js` `getRevealDelay()`, `getRevealVector()`, `updateRevealMotion()`

**Template**

```html
<h2 class="scene-title reveal reveal-left delay-1">Scene title</h2>
<p class="scene-desc reveal reveal-left delay-2">Short presentation copy.</p>
```

```css
.reveal {
  --motion-opacity: 0;
  --motion-x: var(--x, 0px);
  --motion-y: var(--y, 28px);
  --motion-scale: var(--scale, 1);
  opacity: var(--motion-opacity);
  transform: translate3d(var(--motion-x), var(--motion-y), 0) scale(var(--motion-scale));
  transition: opacity 120ms linear, transform 120ms linear;
  will-change: opacity, transform;
}

.delay-2 {
  --delay: 80ms;
}
```

```js
function updateRevealMotion() {
  const viewportHeight = window.innerHeight || 1;
  revealItems.forEach(({ element, delay, section, vector }) => {
    const sectionRect = section.getBoundingClientRect();
    const sectionTravel = (viewportHeight - sectionRect.top) / viewportHeight;
    const enter = ease((sectionTravel - 0.2 - delay / 1000 * 0.12) / 0.54);
    const opacity = clamp(enter, 0, 1);

    element.style.setProperty("--motion-opacity", opacity.toFixed(3));
    element.style.setProperty("--motion-x", `${(vector.inX * (1 - enter)).toFixed(2)}px`);
    element.style.setProperty("--motion-y", `${(vector.inY * (1 - enter)).toFixed(2)}px`);
  });
}
```

**Tuning knobs**

- Reveal classes define direction and scale.
- `delay-*` classes control stagger.
- `enterStart`, `enterEnd`, `exitStart`, `exitEnd` in `updateRevealMotion()`.

**Watch outs**

- Do not rely on one-shot CSS animations for scroll-bound reveal content.
- Check all text at mobile widths; transforms can push content toward the rail.

**Verification**

- Elements enter and exit in both scroll directions.
- Reveals stay tied to the viewport, not elapsed time.
- Text never clips or overlaps critical controls.

## EFX-008: Scene Progress CSS Parallax

**Purpose**

Move text and image layers at different speeds within a section for depth while the video remains the main motion layer.

**Current implementation**

- Scene progress variable: `script.js` `updateSceneProgress()`
- Text drift: `styles.css` `.panel-copy`
- Asset parallax: `styles.css` `#scene-2 .scene-asset-wrapper`, `#scene-3 .scene-asset-wrapper`, `.cluster-asset-wrapper.asset-*`
- Mobile overrides: `styles.css` `@media (max-width: 760px)`

**Template**

```js
sections.forEach((section) => {
  const sceneProgress = (renderedScrollY - section.offsetTop) / window.innerHeight;
  section.style.setProperty("--scene-progress", sceneProgress.toFixed(4));
});
```

```css
.panel-copy {
  transform: translateY(calc(var(--scene-progress) * -42px));
  will-change: transform;
}

.scene-asset-wrapper {
  transform: translateY(calc(var(--scene-progress) * -120px));
  will-change: transform;
}
```

**Tuning knobs**

- Negative values move up as the scene advances.
- Larger multipliers create stronger parallax.
- Mobile should use smaller multipliers and relative positioning.
- Mobile should reduce nonessential animation and filter work around the fixed video.

**Watch outs**

- Avoid parallax that pulls content outside section bounds.
- Use max-widths and safe padding before increasing motion distance.

**Verification**

- Text and assets remain inside the viewport on desktop and mobile.
- Motion supports the story without distracting from the video.

## EFX-009: Pointer-Based Video Parallax

**Purpose**

Add subtle depth on pointer devices by shifting the oversized fixed video opposite the cursor.

**Current implementation**

- CSS overscan: `styles.css` `@media (pointer: fine) .scroll-video`
- Runtime mouse smoothing: `script.js` `updateParallax()`, `handleMouseMove()`

**Template**

```css
@media (pointer: fine) {
  .scroll-video {
    inset: -24px;
    width: calc(100% + 48px);
    height: calc(100% + 48px);
    transform: translate3d(var(--parallax-x, 0px), var(--parallax-y, 0px), 0);
    will-change: transform;
  }
}
```

```js
let targetMouseX = 0;
let targetMouseY = 0;
let currentMouseX = 0;
let currentMouseY = 0;

function handleMouseMove(event) {
  const x = (event.clientX / window.innerWidth) * 2 - 1;
  const y = (event.clientY / window.innerHeight) * 2 - 1;
  targetMouseX = x * -20;
  targetMouseY = y * -20;
  requestAnimationFrame(updateParallax);
}
```

**Tuning knobs**

- Overscan size: current implementation uses `24px` on each side.
- Parallax distance: current implementation uses `20px`.
- Lerp factor: current implementation uses `0.08`.

**Watch outs**

- Overscan must be larger than the maximum translation or viewport edges will show.
- Only run on fine pointers; avoid mobile pointer movement costs.

**Verification**

- No black/empty edges appear when moving the cursor.
- Video movement is subtle and does not fight scroll scrubbing.

## EFX-010: Cinematic Overlay And Film Grain

**Purpose**

Improve text contrast and add texture while keeping the page visually quiet.

**Current implementation**

- Grain overlay: `styles.css` `.scroll-stage::before`
- Top/bottom vignette: `styles.css` `.scroll-stage::after`
- Per-scene gradient overlays: `styles.css` `.panel-*.panel::before`
- Active scene fade: `styles.css` `.panel.is-active::before`

**Template**

```css
.scroll-stage::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0.038;
  background-image: url("data:image/svg+xml,...");
}

.panel::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.85s cubic-bezier(0.16, 1, 0.3, 1);
}

.panel.is-active::before {
  opacity: 1;
}
```

**Tuning knobs**

- Grain opacity.
- Gradient direction by scene.
- Overlay fade duration.

**Watch outs**

- Keep overlays subtle; heavy overlays turn the page into static cards.
- Fixed pseudo-elements need correct `z-index` relative to video, rail, and content.

**Verification**

- Text remains readable over bright video frames.
- Grain is barely visible, not noisy.
- Scene gradient changes are smooth.

## EFX-011: Floating Section Assets

**Purpose**

Give still image assets a gentle independent motion so they do not feel pasted over the video.

**Current implementation**

- Image styling: `styles.css` `.scene-asset`
- Float animation: `styles.css` `@keyframes assetFloat`
- Asset groups: `index.html` `.scene-asset-wrapper`, `.scene-assets-cluster`

**Template**

```css
.scene-asset {
  width: 100%;
  height: auto;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 16px 32px rgba(0, 0, 0, 0.44));
  mix-blend-mode: screen;
  animation: assetFloat 8.2s ease-in-out infinite alternate;
}

@keyframes assetFloat {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-12px);
  }
}
```

**Tuning knobs**

- Animation duration.
- Float distance.
- Drop shadow intensity.
- Blend mode.

**Watch outs**

- Do not combine large float animation with strong scene parallax; the asset can drift too far.
- Verify transparent PNGs against bright and dark video frames.

**Verification**

- Assets remain legible and within their section.
- Float motion is slow enough to feel atmospheric.

## EFX-012: Scroll Hint Line

**Purpose**

Provide a minimal opening cue without explaining the full mechanism.

**Current implementation**

- HTML: `index.html` `.scroll-hint`, `.hint-line`
- CSS animation: `styles.css` `@keyframes scrollHintAnim`

**Template**

```html
<div class="scroll-hint reveal reveal-up delay-3">
  <span class="hint-text">Scroll to explore</span>
  <div class="hint-line-container">
    <span class="hint-line"></span>
  </div>
</div>
```

```css
.hint-line {
  animation: scrollHintAnim 2.4s cubic-bezier(0.76, 0, 0.24, 1) infinite;
  transform-origin: top;
}
```

**Tuning knobs**

- Cue label.
- Line height.
- Animation duration.

**Watch outs**

- Keep this only in the intro.
- Avoid long instructional text.

**Verification**

- Hint is visible but secondary to the title.
- Hint does not overlap mobile text.

## EFX-013: Responsive Scene Reflow

**Purpose**

Preserve readability and keep presentation assets inside viewport bounds on narrow screens.

**Current implementation**

- Mobile breakpoint: `styles.css` `@media (max-width: 760px)`
- Stable mobile viewport stabilization: locked utilizing a custom `--vh` CSS variable and cached dimensions (`cachedViewportHeight`, `cachedViewportWidth`) in `script.js` to prevent mobile address bars and toolbars from resizing or jumping the layout on scroll.
- Orientation-aware resizing: `script.js` `resize` listener checks for width changes on mobile before recalculating viewport bounds, ensuring seamless, non-jittery performance.
- Stable mobile video sizing: anchored at `top: 0`, `left: 0` with `transform: none` and sized at `height: calc(var(--vh, 1vh) * 100)` to ensure a perfectly steady background that doesn't shift when the dynamic URL/address bar changes the viewport's visual center.
- Stable side rail, vignettes, and grain overlays: pinned using `top: 0; left: 0` and sized using the locked `--vh` height variable (and `top: calc(var(--vh, 1vh) * 50)` for `.side-rail`) to prevent dynamic shifts or jumps when the mobile browser toolbar appears/disappears on scroll.
- Scaled mobile typography: dynamic fluid bounds (`clamp`) for `.scene-desc`, `.eyebrow`, and `.hint-text` to ensure high contrast and premium editorial legibility on small high-density screens.
- Panel padding and section height changes.
- Text switches from right-aligned to left-aligned.
- Absolute assets become relative assets.
- Parallax multipliers become smaller.

**Template**

```css
@media (max-width: 760px) {
  .panel {
    height: auto;
    padding: 24px 48px 48px 22px;
  }

  .panel-copy {
    width: 100%;
  }

  .scene-asset-wrapper {
    position: relative;
    width: 100%;
    max-width: 290px;
    margin: 16px auto 0;
    transform: translateY(calc(var(--scene-progress) * 36px)) !important;
  }
}
```

**Tuning knobs**

- Breakpoint.
- Rail inset.
- Mobile panel top padding.
- Mobile asset max-width and parallax multiplier.

**Watch outs**

- Keep enough right padding for the side rail.
- Avoid absolute positioning for mobile assets unless the bounds are tested carefully.

**Verification**

- No clipping at 320px width.
- Titles, descriptions, images, and rail do not overlap.
- Every panel still contributes to the video scrub.

## EFX-014: Scrub-Friendly Video Encoding

**Purpose**

Make the MP4 seekable enough for scroll-driven scrubbing.

**Current implementation**

- Source: `Video/Sequence 01.mp4`
- Scrub output: `Video/Sequence 01_scrub.mp4`
- Mobile scrub output: `Video/Sequence 01_mobile_scrub.mp4`
- Re-encode script: `scripts/reencode-scroll-video.ps1`
- Portable tools: `Tools/ffmpeg/bin/ffmpeg.exe`, `Tools/ffmpeg/bin/ffprobe.exe`
- Mobile-only source: when `Video/Sequence 01_scrub.mp4` exists, `-OnlyMobile` derives from that desktop scrub.

**Template**

```powershell
.\scripts\reencode-scroll-video.ps1
```

Mobile-only workflow:

```powershell
.\scripts\reencode-scroll-video.ps1 -OnlyMobile
```

Preferred encoding settings:

```powershell
-an `
-c:v libx264 `
-pix_fmt yuv420p `
-r 24 `
-preset slow `
-crf 18 `
-g 6 `
-keyint_min 6 `
-sc_threshold 0 `
-movflags +faststart
```

Mobile portrait scrub variant:

```powershell
-an `
-vf "crop='min(iw,ceil(ih*9/16/2)*2)':ih:(iw-ow)/2:0,scale=-2:'min(1080,ih)'" `
-c:v libx264 `
-pix_fmt yuv420p `
-r 24 `
-preset medium `
-tune fastdecode `
-crf 22 `
-g 4 `
-keyint_min 4 `
-bf 0 `
-sc_threshold 0 `
-movflags +faststart
```

Verify keyframe spacing:

```powershell
.\Tools\ffmpeg\bin\ffprobe.exe -v error -select_streams v:0 -skip_frame nokey -show_frames -show_entries frame=best_effort_timestamp_time,pict_type,key_frame -of csv=p=0 "Video\Sequence 01_scrub.mp4"
```

**Tuning knobs**

- `-crf`: lower means higher quality and larger file.
- `-g` and `-keyint_min`: lower means more keyframes and smoother seeking but larger file.
- `-r`: set to `24` fps for both desktop and mobile scrub versions to synchronize smooth seeking with the optimized 24 fps timeline in JavaScript.
- Mobile output uses a center 9:16 portrait crop, capped at 1080px high, to avoid browser-side landscape cropping on phones while keeping random-seek decode cost lower than the full desktop stream.
- Use `-OnlyMobile` when the user specifically asks to create or refresh only the mobile video. This derives from `Video/Sequence 01_scrub.mp4` when that desktop scrub exists.

**Watch outs**

- A file with only one keyframe will scrub poorly.
- A 1080p, high-bitrate video can stutter on phones even with frequent keyframes if the framerate or bitrate is excessively high.
- Keep audio removed for this presentation unless a separate sound design system is added.

**Verification**

- FFprobe shows frequent keyframes.
- Browser scrubbing responds across the full video.

## EFX-015: Exported Fullscreen Startup Gate

**Purpose**

Give client-delivered single-file exports a polished entry screen that opens the presentation in fullscreen from a user click.

**Current implementation**

- Export UI: `single-file-exporter.html` startup checkbox and button text field
- CLI export: `scripts/export-single-html.ps1` `-StartupScreen` and `-StartButtonText`
- Generated code: injected `.startup-gate` markup, CSS, and click handler in the exported HTML only

**Template**

```html
<body data-startup-locked>
  <div class="startup-gate" data-startup-gate role="dialog" aria-modal="true" aria-label="Start presentation">
    <div class="startup-gate__inner">
      <span class="startup-gate__line" aria-hidden="true"></span>
      <button class="startup-gate__button" type="button" data-startup-button>Start Experience</button>
    </div>
  </div>
</body>
```

```js
const gate = document.querySelector(".startup-gate[data-startup-gate]");
const button = document.querySelector("[data-startup-button]");

button.addEventListener("click", function () {
  Promise.resolve(document.documentElement.requestFullscreen()).catch(function () {}).then(function () {
    gate.classList.add("is-dismissed");
    document.body.removeAttribute("data-startup-locked");
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("scroll"));
  });
}, { once: true });
```

**Tuning knobs**

- Button label.
- Gate background opacity and radial highlight strength.
- Fade duration.

**Watch outs**

- Fullscreen must be requested from the button click; browsers reject automatic fullscreen.
- Some browsers or user settings can deny fullscreen. The gate should still dismiss and open the presentation.
- Keep the gate in exported builds only unless the main source presentation intentionally needs it.

**Verification**

- Exported HTML initially shows the startup gate.
- Clicking the button asks for fullscreen where supported.
- The gate fades out and the presentation starts at the first frame.
- Scroll/video synchronization still works after the gate is removed.

## EFX-016: Mobile Touch Overscroll Guard

**Purpose**

Prevent phone viewport edge bounce from making the scroll-scrubbed video look like it is rubber-banding or stuttering at the start and end of the page.

**Current implementation**

- CSS overscroll clamp: `styles.css` `html`, `body`
- Touch tracking: `script.js` `lastTouchY`, `handleTouchStart()`, `handleTouchMove()`, `handleTouchEnd()`, `handleTouchCancel()`
- Mobile-only guard: `script.js` `isMobileScrub`

**Template**

```css
html,
body {
  overscroll-behavior: none;
}
```

```js
let lastTouchY = 0;

function handleTouchStart(event) {
  lastTouchY = event.touches.length ? event.touches[0].clientY : 0;
}

function handleTouchMove(event) {
  const currentTouchY = event.touches[0].clientY;
  const touchDelta = currentTouchY - lastTouchY;
  lastTouchY = currentTouchY;

  if ((window.scrollY <= 0 && touchDelta > 0) || (window.scrollY >= getMaxScrollY() - 1 && touchDelta < 0)) {
    event.preventDefault();
  }
}

window.addEventListener("touchmove", handleTouchMove, { passive: false });
```

**Tuning knobs**

- Boundary tolerance near `getMaxScrollY()`.
- Whether the guard is mobile-only through `isMobileScrub`.

**Watch outs**

- Keep normal one-finger vertical scrolling native; only prevent default at page boundaries.
- The touchmove listener must be `{ passive: false }` when preventing edge bounce.

**Verification**

- On mobile, swiping down at the first scene does not bounce the viewport.
- Swiping near the last scene does not stretch past the page end.
- Normal mid-page swipes still scroll freely and keep the video advancing smoothly.

## Add-A-New-Scene Recipe

1. Add a new rail mark in `index.html`.
2. Add a new `.panel` section with one `.panel-copy` block.
3. Use `.reveal` and a direction class on every entering text or asset.
4. Add section-specific assets in `Assets/scene-N/`.
5. Add scoped layout CSS for the new scene.
6. Add mobile overrides if the scene uses absolute positioning.
7. Confirm `getNavigationPoints()` still maps marks to panels correctly.

## Add-A-New-Effect Recipe

1. Give the effect a new `EFX-###` ID in this file.
2. Document where the live code lives.
3. Include the minimum reusable HTML, CSS, or JS template.
4. List tuning knobs and failure modes.
5. Add a verification checklist.
6. If the effect changes project rules, update `AGENTS.md`.

## Quick Verification Matrix

After JavaScript changes:

```powershell
node --check script.js
```

After video replacement:

```powershell
.\scripts\reencode-scroll-video.ps1
```

After visual behavior changes, check:

- first frame appears without controls;
- scroll moves video forward and backward;
- rail fill and active marker match page position;
- reveals work in both scroll directions;
- parallax stays within viewport bounds;
- desktop and mobile layouts have no clipping or overlap.
