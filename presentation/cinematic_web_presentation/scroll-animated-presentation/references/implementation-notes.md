# Implementation Notes

## Recommended Structure

```html
<main class="scroll-stage">
  <video class="scroll-video" muted playsinline preload="auto"></video>
  <aside class="side-rail"></aside>
  <section class="panel"></section>
  <section class="panel"></section>
</main>
```

## Recommended Scrub Logic

Keep two progress values:

- `targetProgress`: direct page scroll progress.
- `smoothProgress`: eased progress used to set `video.currentTime`.

This preserves a direct scroll relationship while reducing hard seek jumps.

## MP4 Encoding Note

Scroll-scrubbed video seeks frequently. If JavaScript is correct but the video still jumps, re-encode the MP4 with more frequent keyframes. A common starting point is one keyframe every 0.5 to 1 second, with browser-friendly H.264 settings.

## Effect Registry

Use `effects-database.md` as the code template database for this project. It records the current scroll scrub, reveal, parallax, rail, section snap, overlay, asset motion, responsive, and video encoding patterns with reusable snippets and verification notes.
