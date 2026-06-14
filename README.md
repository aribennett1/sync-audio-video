# Audio/Video Sync Tool

A browser-only tool for syncing external audio with video. Load one or more video files, preview them in sync with an adjustable offset, view the external audio waveform, and export a merged MP4 — all without a server.

## Features

### File loading

- **Video queue**: Add one or many videos via the file picker (hold Ctrl/Cmd or Shift for multiple)
- Drag and drop to reorder clips in the queue
- Double-click a queue item to jump to that clip
- Remove individual clips with the **Remove** button
- Clips auto-advance when one finishes playing
- **Audio**: Single external audio file (MP3, WAV, OGG, AAC, etc.)

### Synchronized preview

- Video queue plays sequentially; external audio follows on a **combined timeline**
- **Offset control**: Adjust when external audio starts, with no upper or lower limit
  - Positive offset = audio starts later (matches ffmpeg `-itsoffset`)
  - Use the number input or ±0.1s / ±1s buttons for fine adjustment
- **Mute toggle**: Mute or unmute the video's built-in audio track (external audio is unaffected)

### External audio waveform

- Decoded with Web Audio API and rendered as a full-length waveform
- Shifts horizontally to reflect the current offset relative to the combined video timeline
- Progress overlay tracks playback across all queued clips
- Click the waveform to seek on the combined timeline

### Sync and Download

**Single video** — same as before:

```bash
ffmpeg -y \
  -i video.mp4 \
  -itsoffset {offset} \
  -i audio.mp3 \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k \
  -shortest -movflags +faststart \
  synced.mp4
```

**Multiple videos** — joins clips in queue order, then syncs audio in one pass:

```bash
ffmpeg -y \
  -f concat -safe 0 -i concat.txt \
  -itsoffset {offset} \
  -i audio.mp3 \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k \
  -shortest -movflags +faststart \
  synced.mp4
```

Video is joined with stream copy (no re-encode). External audio is encoded to AAC. The result downloads as `synced.mp4`.

## Usage

1. Open `index.html` in a modern browser (Chrome/Edge recommended)
2. On first load, the page may reload once to activate cross-origin isolation for ffmpeg.wasm
3. Select one or more **video** files and an **audio** file
4. Reorder videos in the queue if needed
5. Play through the queue and adjust the offset until audio and video are in sync
6. Optionally mute the video's built-in audio to hear only the external track
7. Click **Sync and Download** to export the merged file

## Offset semantics

The offset value is passed directly to ffmpeg as `-itsoffset`:

| Offset | Effect |
|--------|--------|
| `+2.0` | External audio starts 2 seconds after the combined video starts |
| `-3.0` | External audio starts 3 seconds before the video (audio is trimmed at export via `-shortest`) |
| `0` | External audio starts at the same time as the first frame |

During preview, external audio time is computed as:

```
globalVideoTime = sum(prior clip durations) + currentClipTime
targetAudioTime = globalVideoTime - offset
```

## Technical details

### Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `@ffmpeg/ffmpeg` | 0.12.10 | Self-hosted in `vendor/ffmpeg/` |
| `@ffmpeg/core` | 0.12.6 | Self-hosted in `vendor/ffmpeg/` |
| `coi-serviceworker` | — | Enables `SharedArrayBuffer` on static hosts |

All ffmpeg.wasm files are self-hosted from `vendor/ffmpeg/` for same-origin loading. ffmpeg is only loaded when you click **Sync and Download** — not on file load. No build step or npm install required.

### Large video files

Videos are mounted via **WORKERFS** so ffmpeg reads files in chunks without copying the entire video into memory.

### Large exports (streaming save)

Exports over **300 MB** total input size use a patched ffmpeg core that writes output to **OPFS** (browser disk storage) instead of MEMFS. The app then streams OPFS to your chosen save path in 16 MB chunks via the File System Access API (`showSaveFilePicker`). Peak tab memory stays bounded instead of scaling with output file size.

| Size | Path |
|------|------|
| ≤ 300 MB | MEMFS + automatic blob download (all supported browsers) |
| > 300 MB, Chrome/Edge | OPFS encode + save picker + chunked stream to disk |
| > 300 MB, unsupported browser | Desktop `ffmpeg` commands shown in the UI |

Requires cross-origin isolation (see `coi-serviceworker.js`) for SharedArrayBuffer and OPFS sync handles in the ffmpeg worker. See `vendor/ffmpeg/PATCHES.md` for patch details and rebuild steps.

On Firefox, large exports may require granting persistent storage when prompted.

### Export limitations

- **`-c:v copy`** requires MP4-compatible video codecs (typically H.264 or HEVC)
- **Multi-clip join** with `-c:v copy` requires clips to share the same codec, resolution, and frame rate. Mixed formats may fail
- Export runs entirely in the browser; very large files or many clips may be slow depending on your device
- For exports over ~300 MB, use **Chrome or Edge** for streaming save, or use the desktop `ffmpeg` commands the app provides as a fallback

## Browser compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari 14.1+
- Any modern browser with Web Audio API and Service Worker support

## License

Free to use and modify for personal or commercial projects.
