# Nurtureize Studio

A local screen + camera recorder and editor, built on the Nurtureize brand system.
Record your screen (full screen, a window, or a custom region) with your camera
and mic captured as a separate track, then compose, trim, and cut the two
together in a built-in editor. Everything — recordings, edits, exports — is
saved to a folder on your own machine. No cloud, no account.

This is an MVP: the core recording and editing loop is solid, but it's built
to be extended (see **Known limitations** below).

## Features

- **Recorder** — a floating control bar (styled like Loom's): choose Full
  Screen / Window / Custom Region, toggle camera and mic, record, pause,
  resume, stop. The bar itself is excluded from its own recording.
- **Local storage** — pick the folder recordings save to; each recording is
  its own subfolder with the raw screen + camera files, metadata, your edit
  state, and the exported final video.
- **Editor**
  - Reposition/resize the screen recording on the canvas (crop or "zoom" by
    making it larger than the frame).
  - Reposition/resize/reshape the camera layer (circle, rounded, square).
  - Background color (Nurtureize palette swatches + custom picker) or a
    custom image behind everything.
  - Trim the start/end of the recording.
  - Cut a segment out of the middle of the timeline (drag-select on the
    timeline, remove it from the chip list).
  - Export a single composited video to your recordings folder.

## Getting started

```bash
npm install
npm start
```

First run on **macOS** will prompt for:
- **Screen Recording** permission (System Settings → Privacy & Security →
  Screen Recording). macOS requires you to quit and relaunch the app after
  granting this — the OS won't apply it to the already-running process.
- **Camera** and **Microphone** permission (standard prompts).

On **Windows**, camera/mic access is gated by Settings → Privacy & security →
Camera / Microphone; screen capture has no extra prompt.

### Building an installer

```bash
npm run dist:mac   # → dist/*.dmg
npm run dist:win   # → dist/*.exe (nsis)
```

## How recordings are stored

```
<your chosen folder>/
  rec-20260101-120000/
    screen.webm      # screen/window/region capture, video only
    webcam.webm      # camera + mic (or mic-only narration), if enabled
    meta.json        # duration, resolution, source type, flags
    project.json      # your edit (layers, background, trim, cutouts) — written on first edit
    export.webm       # the rendered result, once you hit Export
```

Nothing here is proprietary — it's plain webm and JSON, readable by any
video tool or text editor.

## Architecture notes

- **Electron**, no bundler: each window is a plain HTML/CSS/JS bundle loaded
  directly, wired to the main process through a whitelisted `contextBridge`
  API (see `src/main/preload.js`). No native dependencies beyond Electron
  itself.
- **Recording**: the control bar's renderer captures the chosen
  `desktopCapturer` source directly (`chromeMediaSource: 'desktop'`) and, for
  Custom Region, crops it live via an offscreen `<canvas>` before feeding
  `MediaRecorder`. Camera + mic are captured as a second, independent
  `MediaRecorder` stream — this is what lets the editor treat them as
  separately styleable layers instead of a single baked-together video.
- **Editing/export**: the editor plays both tracks back through a shared
  segment model (`src/renderer/editor/compositor.js`) that walks trim +
  cutout ranges, so preview playback and export use identical logic — what
  you see while editing is what gets exported. Export works by re-playing
  the edit through an offscreen canvas and re-recording it
  (`canvas.captureStream()` + `MediaRecorder`), muxing in the camera
  track's audio. There's no ffmpeg dependency, which keeps the app simple
  to install and package, at the cost of export taking roughly as long as
  the edited video's own length (see limitations).

## Known limitations / good next steps

- **Export is real-time.** Because there's no ffmpeg pass, exporting a
  5-minute edited video takes roughly 5 minutes (it's literally replaying
  and re-encoding the composite). A follow-up could add an ffmpeg-based
  fast path.
- **No system audio capture.** Only your microphone is recorded; audio
  playing on your screen isn't. Desktop audio loopback is OS-specific and
  was left out of this MVP.
- **Custom Region and screen-source permission checks are single-monitor.**
  The region picker always targets your primary display. Full-screen/window
  capture works across multiple monitors (pick the specific screen from the
  source list); dragging a custom region on a secondary display doesn't yet.
- **Camera/mic device choice is fixed at record start.** You can mute/hide
  mid-recording, but you can't add a camera that wasn't enabled when you hit
  Record.
- **No thumbnail generation** in the recordings library yet — cards show an
  icon, not a preview frame.
- **`setContentProtection(true)`** (what hides the control bar from its own
  recording) is reliable on macOS; on Windows it needs Windows 10 2004+ and
  can vary by graphics driver. Test on your actual target machines before
  relying on it.
- Fonts (Big Shoulders, Work Sans, Geist Mono) load from Google Fonts over
  the network on first run; offline-first would mean vendoring them locally.

## Testing status

This was built in a headless remote container with no display, camera, or
real OS — I validated it with Electron running under Xvfb with Chromium's
fake media devices, driving the full pipeline programmatically: source
selection → record → save → open in editor → drag/resize layers → add a
cutout → trim → export. That caught and fixed one real bug (a duration
mismatch between the recorder's own timer and the actual encoded video
length, which made playback/export hang at the last frame). It has **not**
been run with a real camera/mic/screen or a human clicking through it — do
that pass before you rely on it for anything real, especially the
`setContentProtection` behavior, which can only be verified visually on
real hardware.
