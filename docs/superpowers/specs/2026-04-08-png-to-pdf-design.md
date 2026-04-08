---
title: PNG/JPEG → PDF Feature — Design Spec
date: 2026-04-08
status: approved
---

# PNG/JPEG → PDF

## Overview

A new "PNG → PDF" tab in the PDF Manager app that lets users upload multiple PNG or JPEG images, reorder them via drag-and-drop, choose a page size, and download a single PDF where each image becomes one page.

Supports both browser mode (all processing in-browser, no data sent to server) and server mode (images POSTed to a new Express endpoint).

---

## Architecture

No new dependencies required. `pdf-lib` (already installed) handles PDF creation in both modes. `dnd-kit` (already installed) handles drag-and-drop reordering.

**New files:**

```
src/pages/PngToPdf.tsx          # New tab page component
server/routes/pngToPdf.ts       # POST /api/png-to-pdf route
server/lib/pngToPdf.ts          # Pure conversion logic (server-side)
tests/pngToPdf.test.ts          # Unit tests for server lib
```

**Modified files:**

```
src/App.tsx                     # Add third tab "PNG → PDF"
server/index.ts                 # Register /api/png-to-pdf route
```

---

## UI (`PngToPdf.tsx`)

### Controls

| Control | Details |
|---|---|
| Multi-file drop zone | Accepts `.png`, `.jpg`, `.jpeg`; rejects other formats with a visible error message |
| Card size slider | Controls thumbnail display width; range 100–300 px, default 150 px |
| Page size dropdown | Options: **Original**, **A4**, **Letter**, **A3** |
| Mode toggle | **Browser** / **Server** — same style as PDF→PNG tab |
| Convert & Download button | Disabled until at least one image is loaded |
| Status indicator | idle / processing / done / error |

### Image Preview Cards

- Each accepted file is shown as a card containing a thumbnail preview and the filename.
- Cards are draggable via dnd-kit (same library used in Merge PDFs tab).
- The card size slider resizes all thumbnails simultaneously — allows zooming in for easier reordering.
- Card order determines page order in the output PDF.

### Output filename

`images.pdf` when multiple files are loaded; `<original-filename>.pdf` when only one file is loaded.

---

## Conversion Logic

### Page sizing

| Selection | Behaviour |
|---|---|
| Original | Page dimensions set to the image's natural pixel dimensions (1 pt per px) |
| A4 | 595 × 842 pt |
| Letter | 612 × 792 pt |
| A3 | 842 × 1191 pt |

For named page sizes, the image is scaled to fit within the page while preserving aspect ratio. It is centered; white margins appear if the aspect ratios differ (letterboxing). The image is never cropped.

### Browser mode

1. Each `File` is read as `ArrayBuffer`.
2. A `PDFDocument` is created with pdf-lib.
3. For each image in display order:
   - Determine page dimensions from the selected page size (or image's natural size for "Original").
   - Embed the image (`embedPng` / `embedJpg` depending on file type).
   - Add a page, draw the image scaled and centered.
4. Serialize the PDF and trigger a browser download.

No data leaves the browser.

### Server mode

1. Files are POSTed to `POST /api/png-to-pdf?pageSize=<value>` as `multipart/form-data`.
2. Multer stores files in memory in the received order.
3. `server/lib/pngToPdf.ts` builds the PDF with the same logic as browser mode.
4. The PDF buffer is returned as `application/pdf`; the client triggers a download.

---

## Server Route (`server/routes/pngToPdf.ts`)

- `POST /api/png-to-pdf`
- Query param: `pageSize` — one of `original | a4 | letter | a3` (default: `original`)
- Body: `multipart/form-data`, field name `files` (array), accepts multiple files
- Validates MIME types server-side (`image/png`, `image/jpeg`) — rejects others with 400
- Returns 200 with `Content-Type: application/pdf` on success
- Returns 400 for invalid input, 500 for unexpected errors

---

## Error Handling

- **Drop zone:** Non-PNG/JPEG files rejected at drop with a visible inline message (same pattern as PDF validation in existing tabs).
- **Server errors:** Surfaced as an error status message below the button — same pattern as PDF→PNG tab.
- **Corrupted image:** If pdf-lib fails to embed an image, the error is caught, conversion stops, and an error status is shown.

---

## Testing (`tests/pngToPdf.test.ts`)

Unit tests cover `server/lib/pngToPdf.ts`:

- Single PNG → single-page PDF
- Single JPEG → single-page PDF
- Multiple images → multi-page PDF with correct page count and order
- A4 page size produces 595×842 pt pages
- Letter page size produces 612×792 pt pages
- A3 page size produces 842×1191 pt pages
- Original mode sets page size to the image's natural pixel dimensions

No browser-mode unit tests (consistent with existing test approach for `pdfToImages`).
