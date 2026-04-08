---
title: PDF Compress Feature — Design Spec
date: 2026-04-08
status: approved
---

# PDF Compress Feature

## Overview

Add a "Compress PDF" tab to the PDF Manager app. Users can upload multiple PDFs, choose a compression level, and download each compressed file individually or all at once as a zip. All processing is server-side via Ghostscript (wrapped by the `compress-pdf` npm package).

---

## Architecture

**New files:**
```
src/pages/CompressPdf.tsx          # UI — mirrors PdfToPng.tsx structure
server/routes/compress.ts          # POST /api/compress
server/lib/compressPdf.ts          # Pure compression logic
```

**Modified files:**
- `src/App.tsx` — add "Compress PDF" tab
- `server/index.ts` — register `/api/compress` route

**Reused components:** `FileDropZone`, `PdfFileCard` — no changes needed.

---

## Compression Levels

Maps to Ghostscript PDFSETTINGS presets:

| Level | Label | GS Preset | Resolution | Use case |
|-------|-------|-----------|------------|----------|
| `maximum` | Maximum | `/screen` | 72 dpi | Smallest file, lower quality |
| `balanced` | Balanced *(default)* | `/ebook` | 150 dpi | Good quality, good compression |
| `quality` | High Quality | `/printer` | 300 dpi | Minimal quality loss, less compression |

---

## UI (`src/pages/CompressPdf.tsx`)

Mirrors `PdfToPng.tsx`:

**Toolbar:**
- Compression level: three radio buttons (`Maximum`, `Balanced`, `High Quality`), default `Balanced`
- "Compress All" button (right-aligned)

**File area:**
- `FileDropZone` — multi-file, `.pdf` only
- `PdfFileCard` grid with drag-to-reorder (dnd-kit)
- Per-card "Compress" button → downloads individual file as `<filename>-compressed.pdf`

**"Compress All" behavior:**
- Compresses all idle files sequentially
- Single file → `<filename>-compressed.pdf`
- Multiple files → `compressed.zip` containing all compressed PDFs

**Status:** same `groupStatus` pattern (`idle / processing / done / error`) with bottom messages.

**No browser/server toggle** — compression requires server-side Ghostscript.

---

## Server

### `server/lib/compressPdf.ts`

```ts
compressPdf(inputBuffer: Buffer, level: 'maximum' | 'balanced' | 'quality'): Promise<Buffer>
```

1. Write `inputBuffer` to `<tmpdir>/<uuid>-input.pdf`
2. Call `compress-pdf` with resolution: `maximum` → 72, `balanced` → 150, `quality` → 300
3. Read output file into a Buffer
4. Delete both temp files in `finally`

No Express dependency — purely testable.

### `server/routes/compress.ts`

- `POST /api/compress?level=balanced` (default: `balanced`)
- multer memory storage
- Validates `level` is one of `maximum | balanced | quality`
- Returns compressed PDF as `application/pdf` with `Content-Disposition: attachment; filename="compressed.pdf"`

### `server/index.ts`

Register: `app.use('/api/compress', compressRouter)`

---

## API

| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/api/compress` | multipart: `file` (PDF), query: `level` | `application/pdf` download |

---

## Dependencies

| Package | Purpose | License |
|---------|---------|---------|
| `compress-pdf` | Ghostscript wrapper for PDF compression | MIT |
| Ghostscript (system) | Actual compression engine | AGPL (local use only — no distribution) |

---

## Out of Scope

- Browser-side compression (not feasible with Ghostscript)
- Custom DPI input beyond the three presets
- Preview of compressed file size before downloading
