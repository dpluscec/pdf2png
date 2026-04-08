---
title: PDF→PNG Multi-File Enhancement — Design Spec
date: 2026-04-08
status: approved
---

# PDF→PNG Multi-File Enhancement

## Overview

Enhance the PDF→PNG page to support multiple files with a visual card grid, optional first-page thumbnails, per-file conversion, and group conversion downloading a combined zip with one subfolder per file.

No server changes required — this is a client-only change.

---

## UI Layout

### Top toolbar

- DPI input (72–600, default 150)
- Processing mode toggle: Browser / Server
- Preview toggle: on/off (default on) — controls whether first-page thumbnails are rendered
- "Convert All" button — disabled until at least one file is loaded; triggers group conversion

### Drop zone

`FileDropZone` with `multiple` enabled. Once files have been added, it shrinks to a compact "Add more files" strip (new `compact` prop on `FileDropZone`) rather than the full-height zone. Dropped files are appended to the existing list.

### File card grid

`display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))`

Fills the available row width automatically — more columns on wider screens.

Each card contains:
- **Drag handle** (top of card) — drag to reorder using dnd-kit (same library as Merge PDFs page)
- **Thumbnail** (first page rendered at 72 DPI as a `<img>` data URL) when preview is on and rendering is complete, or a large PDF icon SVG (48px) when preview is off or still loading
- **Filename** — truncated with ellipsis
- **Page count** — shown as "N pages" once counted, "— pages" while loading
- **Status badge** — idle / processing / done / error
- **"Convert" button** — triggers individual conversion for this file
- **✕ remove button** — removes file from the list

Cards can be dragged to reorder. The order determines the subfolder sequence in the group zip.

---

## Data Flow

### Adding files

`FileDropZone.onFiles` → new entries appended to the `PdfEntry[]` list. Each entry starts with `status: 'idle'`, `pageCount: null`, `thumbnail: null`.

If preview is on, a background task immediately begins rendering page 1 at 72 DPI (via pdfjs-dist in the browser) and stores the result as a data URL on the entry. Page count is read from the same pdfjs load.

### Individual conversion ("Convert" button on a card)

1. Card status → `processing`
2. File converted via browser or server mode
3. Result zip contains a single subfolder: `<stem>/page-001.png`, `<stem>/page-002.png`, …
4. Zip downloaded immediately as `<stem>-pages.zip`
5. Card status → `done` or `error`

### Group conversion ("Convert All")

1. All `idle` cards set to `processing` (cards already `done` or `error` are skipped)
2. Files converted **sequentially** (one at a time) to avoid memory spikes
3. Each result blob accumulated in memory with its subfolder structure
4. When all complete, a single `converted.zip` downloaded containing one subfolder per file:
   ```
   converted.zip/
     document1/
       page-001.png
       page-002.png
     document2/
       page-001.png
   ```
5. Cards that errored show inline error status; their files are excluded from the zip

### Remove file

Removes entry from the list immediately. If "Convert All" is in progress and that file hasn't been processed yet, it is skipped.

---

## Zip structure (both individual and group)

| Action | Download filename | Zip contents |
|--------|------------------|--------------|
| Individual "Convert" | `<stem>-pages.zip` | `<stem>/page-001.png`, … |
| "Convert All" | `converted.zip` | `<stem1>/page-001.png`, …, `<stem2>/page-001.png`, … |

---

## Components

### Modified

| File | Change |
|------|--------|
| `src/pages/PdfToPng.tsx` | Full rewrite — multi-file state, toolbar, card grid, convert logic |
| `src/components/FileDropZone.tsx` | Add `compact?: boolean` prop — renders as a small "Add more files" strip when true |

### New

| File | Responsibility |
|------|---------------|
| `src/components/PdfFileCard.tsx` | Single file card: thumbnail/icon, filename, page count, status badge, Convert + remove buttons |
| `src/components/PdfThumbnail.tsx` | Renders PDF page 1 to canvas at 72 DPI, returns data URL; memoized by file identity |

---

## State model

```typescript
interface PdfEntry {
  id: string                              // stable key: filename + timestamp + random
  file: File
  pageCount: number | null               // null = not yet loaded
  thumbnail: string | null               // null = not rendered or preview off
  status: 'idle' | 'processing' | 'done' | 'error'
  error: string                          // empty string when no error
}
```

State held in `PdfToPng.tsx`:
- `entries: PdfEntry[]`
- `dpi: number` (default 150)
- `mode: 'browser' | 'server'`
- `showPreview: boolean` (default true)
- `groupStatus: 'idle' | 'processing' | 'done' | 'error'`

---

## Conversion functions

`convertBrowser` and `convertServer` are updated to:
- Accept `file: File`, `dpi: number`, `folderName: string`
- Return `Promise<Blob>` (a zip blob) instead of triggering download directly
- The zip blob contains `<folderName>/page-001.png`, `<folderName>/page-002.png`, …

The caller (`PdfToPng.tsx`) decides whether to download immediately (individual) or accumulate into a group zip (Convert All).

---

## Preview behaviour

- Enabled by default; can be toggled off via the Preview toggle in the toolbar
- When toggled off after files are loaded: thumbnails are hidden; existing rendered thumbnails are discarded from state
- When toggled on: thumbnails are re-rendered for any entries that don't have one
- Rendering uses pdfjs-dist (browser-only) regardless of the selected processing mode — the preview is always browser-side

---

## Out of scope

- Per-file DPI or mode settings
- Progress within a single file's conversion (page N of M)
