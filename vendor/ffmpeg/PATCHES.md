# Custom ffmpeg.wasm patches (OPFS streaming export)

Stock `@ffmpeg/core` 0.12.6 writes all output to in-memory MEMFS. Large exports OOM because the full MP4 is buffered in WASM heap and again when `readFile()` copies it to JavaScript.

These vendored files are patched so large exports can write output to **Origin Private File System (OPFS)** on disk, then stream-read OPFS in chunks to the user's save location.

## Patched files

| File | Change |
|------|--------|
| `ffmpeg-core.js` | `exec()` detects `__opfs__/filename` output paths, opens OPFS `createSyncAccessHandle()`, hooks MEMFS `stream_ops.write/read/allocate` for that file |
| `814.ffmpeg.js` | `EXEC` handler awaits `exec()` when it returns a Promise (OPFS setup is async) |

Unchanged: `ffmpeg.js`, `ffmpeg-core.wasm` (same upstream 0.12.6 / 0.12.10 pairing as before).

## App usage

When total input size exceeds **300 MB** and the browser supports OPFS + `showSaveFilePicker`, export passes output path `__opfs__/synced.mp4`. ffmpeg writes to OPFS during encode; the main thread streams OPFS to your chosen save path. Small exports still use MEMFS + blob download.

Large OPFS exports omit `-movflags +faststart` (that flag triggers a full-file WASM remux). The MEMFS patch hooks `stream_ops` **and** syncs `MEMFS.ops_table` (Emscripten caches op references at init). Also hooks `expandFileStorage`, `resizeFileStorage`, `setattr`, and `mmap`.

## Re-applying after upstream upgrades

1. Replace `vendor/ffmpeg/ffmpeg-core.js` and `814.ffmpeg.js` with new upstream builds (keep `WORKERFS` enabled).
2. From repo root:

```bash
node scripts/patch-ffmpeg-opfs.js
```

3. Test a large export (1 GB+) in Chrome/Edge.

If the patch script fails with "expected source snippet not found", upstream `exec()` or worker `EXEC` handling changed — update `scripts/patch-ffmpeg-opfs.js` to match.

## Full rebuild (optional)

For a from-source rebuild instead of post-build patching:

1. Clone [ffmpegwasm/ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) and `ffmpeg.wasm-core` at versions matching `package.json` in that repo for core 0.12.6.
2. Build with WORKERFS (`-lworkerfs.js`, export `FS_mount` / `FS_unmount` / `FS_filesystems`).
3. Apply the same OPFS hook logic (or integrate into the build), copy artifacts into `vendor/ffmpeg/`, run `node scripts/patch-ffmpeg-opfs.js` if using post-build patch.

## Browser notes

- **Chrome / Edge**: recommended for large exports (OPFS + save picker).
- **Firefox**: call `navigator.storage.persist()` before large writes; may prompt for storage permission.
- **Safari**: OPFS large writes can fail; app falls back to desktop `ffmpeg` commands when streaming export is unavailable.
