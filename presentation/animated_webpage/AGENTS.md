# Animated Presentation Webpage

## Project Scope

Build a scroll-driven animated presentation webpage. The page uses a full-screen video as the motion layer, maps scroll progress to video time, and reveals presentation information section by section. The target experience should feel like an interactive keynote or product story, not a normal article page.

## Current Architecture

- `index.html` contains the page structure, scroll sections, fixed video, and left progress rail.
- `styles.css` owns the visual system, full-screen layout, scrollbar styling, responsive behavior, and minimal navigation UI.
- `script.js` owns scroll-to-video synchronization, inertial smoothing, section marker state, and media-control suppression.
- `Video/Sequence 01_scrub.mp4` is the active scroll-scrubbed video asset.
- `Video/Sequence 01_mobile_scrub.mp4` is the active mobile/touch scrubbed video asset. It is intentionally lower resolution and lower frame rate for smoother phone seeking.
- `Video/Sequence 01.mp4` is the original 60 fps source video for re-encoding.
- `Tools/ffmpeg/bin/ffmpeg.exe` and `Tools/ffmpeg/bin/ffprobe.exe` are project-local portable FFmpeg tools. Keep them in the project when transferring to another PC.
- `scripts/reencode-scroll-video.ps1` re-encodes the source MP4 into desktop and mobile scroll-scrub-friendly MP4s.

## Interaction Rules

- The video must not show media controls, play buttons, picture-in-picture controls, or download/fullscreen controls.
- The video must be scrubbed by scroll position only.
- Scrolling down advances the video; scrolling up rewinds it.
- The video should feel continuous across all sections, not like separate slides or jumps.
- Content sections should sit over the video and reveal presentation information without interrupting the scroll scrub.
- The side rail should stay minimal, sleek, and secondary to the video.

## Implementation Guidance

- Prefer direct scroll progress as the source of truth and use smoothing only for perceived motion quality.
- Keep each section at roughly one viewport height unless a deliberate pacing change is needed.
- Add presentation content inside existing `.panel` sections before adding new layout systems.
- Avoid visible instructions explaining how the page works.
- Keep the UI minimal: thin lines, restrained text, subtle progress indicators, and no heavy cards unless the content truly needs framing.
- Preserve mobile readability by reserving space for the left rail and avoiding text overlap with the video.
- For scroll-scrubbed MP4s, avoid files with only one keyframe. Re-encode with frequent keyframes before tuning JavaScript smoothing.
- Preferred scrub encoding uses H.264, `yuv420p`, no audio, `-g 6`, `-keyint_min 6`, `-sc_threshold 0`, and `-movflags +faststart`.
- When asked specifically to create a mobile version of the video, generate only `Video/Sequence 01_mobile_scrub.mp4` with the mobile workflow. Do not replace the desktop scrub unless the user asks for a full re-encode.
- Mobile scrub encoding should prioritize phone performance: about 960px wide, 30 fps, H.264, `yuv420p`, no audio, frequent keyframes, and `+faststart`.

## Design Guidelines

- Preserve generous margins around all scene text so titles and descriptions never feel pinned to the viewport edge.
- Use subtle borders or fine divider lines when content needs definition, keeping them thin, low-contrast, and secondary to the video.
- Maintain consistent inner spacing inside framed elements so borders feel intentional rather than decorative clutter.
- Keep every text block, image, control, and decorative element inside its section bounds with responsive max-widths, safe padding, and overflow-aware positioning.
- Check desktop and mobile widths for clipping, overlap, and elements escaping outside the visible viewport or their intended panel.
- Avoid heavy boxes, thick outlines, or crowded layouts; margins and borders should support a calm luxury presentation.

## Verification

After script changes, run:

```powershell
node --check script.js
```

After replacing the source video, run:

```powershell
.\scripts\reencode-scroll-video.ps1
```

When asked specifically to create only the mobile version video, run:

```powershell
.\scripts\reencode-scroll-video.ps1 -OnlyMobile
```

If Windows blocks the script because execution policy is disabled, use:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reencode-scroll-video.ps1 -OnlyMobile
```

To verify keyframe spacing, run:

```powershell
.\Tools\ffmpeg\bin\ffprobe.exe -v error -select_streams v:0 -skip_frame nokey -show_frames -show_entries frame=best_effort_timestamp_time,pict_type,key_frame -of csv=p=0 "Video\Sequence 01_scrub.mp4"
```

For the mobile scrub, verify:

```powershell
.\Tools\ffmpeg\bin\ffprobe.exe -v error -select_streams v:0 -skip_frame nokey -show_frames -show_entries frame=best_effort_timestamp_time,pict_type,key_frame -of csv=p=0 "Video\Sequence 01_mobile_scrub.mp4"
```

When visual behavior changes, open `index.html` in a browser and check:

- the video starts on the first frame without controls;
- the video moves forward and backward with scroll;
- all sections contribute to the video scrub;
- the left rail progress matches page position;
- text remains readable on desktop and mobile widths.

## Effect Template Database

- Before modifying animation behavior, read `scroll-animated-presentation/references/effects-database.md`.
- Keep reusable effects documented there with an `EFX-###` ID, live-code locations, templates, tuning knobs, watch outs, and verification notes.
- When adding a new animation, parallax behavior, rail interaction, reveal style, video scrub technique, or encoding requirement, update the effects database in the same change.
