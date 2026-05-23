---
name: scroll-animated-presentation
description: Build and maintain scroll-driven animated presentation webpages that use scroll-scrubbed video, full-screen sections, inertial motion, minimal progress navigation, and section-by-section presentation content. Use when creating, refining, debugging, or extending animated web presentations, cinematic landing narratives, scroll-telling demos, or video-backed presentation pages.
---

# Scroll Animated Presentation

## Overview

Use this skill to work on animated presentation webpages where scroll position controls a video timeline and each viewport section reveals presentation content. Optimize for a polished keynote-like experience: continuous motion, restrained UI, readable overlays, and reliable forward/reverse scrubbing.

Before editing this project, read `references/effects-database.md`. It is the local registry of implemented effects, reusable templates, tuning knobs, and verification checks.

## Core Model

- Treat scroll progress as the source of truth.
- Map page progress `0..1` to video time `0..duration`.
- Keep the video paused and muted; set `currentTime` programmatically.
- Smooth the perceived motion with `requestAnimationFrame`, not with ordinary playback.
- Make every section part of one continuous timeline.
- Keep navigation secondary: progress rails, tiny markers, or section indexes should not dominate the video.

## Build Workflow

1. Inspect the existing structure before editing: identify the video element, scroll container, sections, navigation rail, and script entry point.
2. Confirm the video source path and keep it local unless the user explicitly asks for a remote asset.
3. Make the video fixed, full-screen, `object-fit: cover`, muted, inline, and non-interactive.
4. Define full-screen content sections over the video. Use sections for presentation beats, not unrelated page regions.
5. Drive video time from scroll progress in JavaScript. Support both downward and upward scrolling.
6. Add light inertia only between target progress and rendered video progress. Do not make the actual page scroll feel sluggish unless explicitly requested.
7. Style the navigation as a minimal progress indicator. Prefer thin lines and small active states over heavy capsules or large buttons.
8. Verify syntax and browser behavior.

## Interaction Requirements

- No play button or visible browser media controls.
- No user-triggered normal video playback.
- Scroll down advances the video.
- Scroll up rewinds the video.
- The video continues smoothly across all sections.
- Section navigation may scroll to a section, but it must not break the continuous video timeline.
- Empty sections should still communicate pacing with subtle indexes or planned content placeholders while the design is being built.

## Content Sections

Use sections as presentation beats:

- `scene-1`: opening/title or setup.
- middle scenes: key points, metrics, feature reveals, narrative steps, or demo annotations.
- final scene: summary, closing claim, call to action, or final frame.

Keep section content short and high contrast. Use overlays sparingly so the video remains the primary motion layer. Avoid visible instructional copy such as "scroll to play" unless the user explicitly asks for onboarding text.

## Motion Tuning

If the video feels too slow:

- reduce total scroll height;
- reduce section count or section height;
- increase timeline response;
- avoid smoothing the actual wheel/page scroll.

If the video feels choppy:

- drive updates through `requestAnimationFrame`;
- smooth rendered progress toward target progress;
- reduce large jumps caused by section snapping;
- check whether the source MP4 needs more frequent keyframes.

If the video only appears to work in one section:

- ensure all sections are inside the same scroll container;
- compute progress against the full scrollable distance;
- avoid mapping progress per-section unless deliberately building chaptered timelines;
- add visible section placeholders while content is unfinished.

## Visual Direction

- Use full-bleed video as the main visual.
- Favor minimal, semi-transparent, or line-based controls.
- Keep text readable with gradients or subtle overlays, not large opaque cards.
- Avoid bulky UI, decorative blobs, and marketing-page layouts.
- Keep mobile spacing clear around the rail and overlay text.

## Verification

Run script syntax checks after JavaScript edits:

```powershell
node --check script.js
```

Then verify in a browser:

- first frame is visible before scrolling;
- no media controls appear;
- scroll down and up scrub video in both directions;
- motion remains continuous through every section;
- progress rail matches page position;
- section content does not overlap or obscure important video areas.

## Effect Registry

Use `references/effects-database.md` when adding, removing, or tuning an effect. Add a new `EFX-###` entry whenever a reusable pattern is introduced so future agents can preserve the presentation system instead of rediscovering it from runtime code.
