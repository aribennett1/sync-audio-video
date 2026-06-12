# Audio/Video Sync Tool

A browser-only tool for syncing external audio with video. Load separate video and audio files, preview them in sync with an adjustable offset, compare waveforms side by side, and export a merged MP4 — all without a server.

## Features

### Dual file loading

- **Video**: Any browser-compatible video format (MP4, WebM, MKV, MOV, etc.)
- **Audio**: Any browser-compatible audio format (MP3, WAV, OGG, AAC, etc.)
- Load each file independently via separate file pickers

### Synchronized preview

- Video is the master clock; external audio follows automatically
- **Offset control**: Adjust when external audio starts, with no upper or lower limit
  - Positive offset = audio starts later (matches ffmpeg `-itsoffset`)
  - Use the number input or ±0.1s / ±1s buttons for fine adjustment
- **Mute toggle**: Mute or unmute the video's built-in audio track (external audio is unaffected)

### Dual waveforms

- **Video audio**: Extracted via ffmpeg.wasm and rendered as a full-length waveform
- **External audio**: Decoded with Web Audio API
- External waveform shifts horizontally to reflect the current offset, so peaks align visually when sync is correct
- Progress overlay on both waveforms tracks video playback position
- Click either waveform to seek

### Sync and Download

Exports a merged MP4 using ffmpeg.wasm with these settings:

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

The result downloads as `synced.mp4` in your browser.

## Usage

1. Open `index.html` in a modern browser (Chrome/Edge recommended)
2. On first load, the page may reload once to activate cross-origin isolation for ffmpeg.wasm
3. Select a **video** file and an **audio** file
4. Play the video and adjust the offset until audio and video are in sync
5. Optionally mute the video's built-in audio to hear only the external track
6. Click **Sync and Download** to export the merged file

## Offset semantics

The offset value is passed directly to ffmpeg as `-itsoffset`:

| Offset | Effect |
|--------|--------|
| `+2.0` | External audio starts 2 seconds after the video |
| `-3.0` | External audio starts 3 seconds before the video (audio is trimmed at export via `-shortest`) |
| `0` | External audio starts at the same time as the video |

During preview, external audio time is computed as:

```
targetAudioTime = video.currentTime - offset
```

## Technical details

### Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `@ffmpeg/ffmpeg` | 0.12.10 | Self-hosted in `vendor/ffmpeg/` |
| `@ffmpeg/core` | 0.12.6 | Self-hosted in `vendor/ffmpeg/` |
| `coi-serviceworker` | — | Enables `SharedArrayBuffer` on static hosts |

All ffmpeg.wasm files are self-hosted from `vendor/ffmpeg/` for same-origin loading. No build step or npm install required.

### Large video files

Video is mounted via **WORKERFS** so ffmpeg reads the file in chunks without copying the entire video into memory.

### Export limitations

- **`-c:v copy`** only works when the video codec is MP4-compatible (typically H.264 or HEVC). Exotic codecs may fail or produce an unplayable file.
- Export runs entirely in the browser; very large files may be slow or hit memory limits depending on your device.

## Browser compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari 14.1+
- Any modern browser with Web Audio API and Service Worker support

## License

Free to use and modify for personal or commercial projects.
