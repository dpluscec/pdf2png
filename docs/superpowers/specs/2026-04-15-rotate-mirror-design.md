---
title: Rotate & Mirror PDF + PNG Card Rotation — Design Spec
date: 2026-04-15
status: approved
---

# Rotate & Mirror PDF + PNG Card Rotation

## Overview

Two related features:

1. **Rotate & Mirror PDF** — a new "Rotate PDF" tab where users can rotate and/or mirror individual pages (or the entire PDF) before downloading. Browser-only, lossless via pdf-lib transforms.
2. **PNG card rotation** — per-card rotate CW/CCW buttons on the PNG → PDF tab. 90° increments, cumulative. Applied via canvas pre-rotation at conversion time.

No new dependencies required. Both features use `pdf-lib` and `pdfjs-dist` which are already in the project.

---

## Architecture

### New file

```
src/pages/RotatePdf.tsx    # full page: upload, grid, controls, download
```

### Modified files

```
src/App.tsx                # add "Rotate PDF" tab
src/pages/PngToPdf.tsx     # add rotation field to ImageItem, rotate buttons to SortableImageCard,
                           # canvas pre-rotation in convertBrowser / convertServer
```

No new shared components. `PdfThumbnail` is reused as-is for page previews in `RotatePdf.tsx`.

---

## Section 1: Data Model

### RotatePdf page

```ts
type Rotation = 0 | 90 | 180 | 270;

interface PageEntry {
  id: string;        // string of 0-based page index
  index: number;     // 0-based index into the PDF document
  rotation: Rotation;
  mirrorH: boolean;  // flip left-right
  mirrorV: boolean;  // flip top-bottom
}
```

State held in React only — no persistence. The user loads, modifies, downloads.

Multi-select is a `Set<string>` of page IDs. When any pages are selected, a bulk action toolbar appears above the grid.

### PNG → PDF

`ImageItem` gains one field:

```ts
rotation: Rotation;  // 0 | 90 | 180 | 270, default 0
```

Rotation accumulates: CCW subtracts 90°, CW adds 90°, both wrap at 360°.

---

## Section 2: UI

### RotatePdf page

- **Drop zone** — accepts a single PDF file
- **Page grid** — one card per page, using `PdfThumbnail` with a CSS transform applied:
  `rotate(${rotation}deg) scaleX(mirrorH ? -1 : 1) scaleY(mirrorV ? -1 : 1)`
  Instant preview — no re-render of the thumbnail required.
- **Per-card controls:**
  - Checkbox (top-left) for multi-select
  - Page number label
  - Footer buttons: ↺ CCW · ↻ CW · ⇔ Flip H · ⇕ Flip V
- **Bulk action toolbar** (visible when 1+ pages selected): same four buttons applied to all selected pages at once, plus a "Clear selection" link
- **Download button** — triggers the export pipeline; output filename: `<original-name>-rotated.pdf`

### PNG → PDF cards

The existing card footer (filename + remove button) gains two buttons placed between the filename and the remove button:

- ↺ CCW
- ↻ CW

The preview `<img>` gets `transform: rotate(${rotation}deg)` applied.

Both buttons use `onPointerDown={(e) => e.stopPropagation()}` to prevent accidental drag activation (same pattern as the existing remove button).

---

## Section 3: Processing Pipeline

### RotatePdf — download

1. Load the uploaded PDF: `PDFDocument.load(arrayBuffer)`
2. For each `PageEntry` with any modification (rotation ≠ 0 or either mirror is `true`):
   - `const page = doc.getPage(entry.index)`
   - Capture `const { width, height } = page.getSize()` before applying transforms
   - Rotation: `page.setRotation(degrees(entry.rotation))`
   - Mirror H: `page.scaleContent(-1, 1)` then `page.translateContent(width, 0)`
   - Mirror V: `page.scaleContent(1, -1)` then `page.translateContent(0, height)`
3. `const bytes = await doc.save()`
4. Trigger download as `<original-name>-rotated.pdf`

Pages with no modifications are passed through untouched.

### PNG → PDF — browser mode

For each `ImageItem` with `rotation !== 0`:
1. Draw the image to an offscreen `<canvas>`, rotating the canvas context by `rotation * (Math.PI / 180)` — swap canvas width/height for 90°/270° rotations
2. Obtain rotated bytes via `canvas.toBlob('image/png')`
3. Embed the rotated PNG into the PDF page as normal

Items with `rotation === 0` use the existing path unchanged.

### PNG → PDF — server mode

Same canvas pre-rotation step applied before building `FormData`. The server receives an already-rotated image file. No server API changes required.

---

## Out of Scope

- Mirror for PNG cards (rotation only, as requested)
- Arbitrary angle rotation (90° increments only)
- Per-page rotation in other tabs (Merge PDF, Split PDF, etc.)
- Server-side processing for Rotate PDF (browser-only)
- Undo/redo within the Rotate PDF page
