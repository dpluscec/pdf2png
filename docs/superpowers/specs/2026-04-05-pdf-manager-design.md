---
title: PDF Manager Web App — Design Spec
date: 2026-04-05
status: approved
---

# PDF Manager Web App

## Overview

A locally-run web app with two features:
1. **PDF → PNG:** Convert each page of a PDF to a PNG image, download all as a zip.
2. **Merge PDFs:** Upload multiple PDFs, reorder them by dragging, download as a single merged PDF.

No login, no persistence, no cloud. All files stay on the user's machine.

---

## Architecture

**Stack:** React (Vite) frontend + Express (Node.js) backend, TypeScript throughout.

**Project structure:**

```
pdf2png/
├── client/                        # React app (Vite)
│   └── src/
│       ├── App.tsx                # Tab navigation
│       ├── pages/
│       │   ├── PdfToPng.tsx       # Feature 1 UI
│       │   └── MergePdf.tsx       # Feature 2 UI
│       └── components/
│           └── FileDropZone.tsx   # Shared drop/select component
├── server/
│   ├── index.ts                   # Express entry point (port 3001)
│   ├── routes/
│   │   ├── convert.ts             # POST /api/convert
│   │   └── merge.ts               # POST /api/merge
│   └── lib/
│       ├── pdfToImages.ts         # Pure conversion logic
│       └── mergePdfs.ts           # Pure merge logic
├── tests/
│   ├── pdfToImages.test.ts
│   └── mergePdfs.test.ts
└── package.json                   # Root scripts using concurrently
```

**Dev setup:** `npm run dev` starts both Vite (port 5173) and Express (port 3001) via `concurrently`. Vite proxies `/api/*` to Express.

---

## Feature 1: PDF → PNG

### UI (PdfToPng.tsx)

- Single-file drop zone (accepts `.pdf` only)
- DPI input: number field, range 72–600, default 150
- Processing mode toggle: **Browser** / **Server**
- "Convert & Download" button
- Status indicator: idle / processing / done / error

### Browser mode

1. User selects PDF and clicks Convert
2. pdf.js loads the PDF in the browser
3. Each page is rendered to a `<canvas>` at the selected DPI
4. Canvas exported as PNG blob
5. JSZip bundles all PNGs (named `page-001.png`, `page-002.png`, …)
6. Zip file downloaded as `<original-filename>-pages.zip`

No data leaves the browser.

### Server mode

1. User selects PDF and clicks Convert
2. File POSTed to `POST /api/convert?dpi=<value>` as multipart/form-data
3. Express receives file via multer (memory storage)
4. `pdfToImages.ts` converts each page using pdf2pic at the requested DPI
5. PNGs collected and zipped in memory using archiver
6. Zip streamed back as `application/zip` download

### pdfToImages.ts (lib)

```ts
convertPdfToImages(pdfBuffer: Buffer, dpi: number): Promise<Buffer[]>
```

Returns one Buffer per page. No Express dependency — purely testable.

---

## Feature 2: Merge PDFs

### UI (MergePdf.tsx)

- Multi-file drop zone (accepts `.pdf` only)
- Ordered list of uploaded files:
  - Drag handle (dnd-kit) for reordering
  - Filename display
  - Remove button per file
- "Merge & Download" button
- Status indicator: idle / processing / done / error

### Flow

1. User drops/selects multiple PDFs
2. Files appear in an ordered list; user drags to desired merge order
3. User clicks Merge
4. Files sent to `POST /api/merge` as multipart/form-data in current order
5. `mergePdfs.ts` uses pdf-lib to load and concatenate all PDFs in order
6. Merged PDF returned as `application/pdf` download, named `merged.pdf`

### mergePdfs.ts (lib)

```ts
mergePdfBuffers(buffers: Buffer[]): Promise<Buffer>
```

Returns a single PDF buffer. No Express dependency — purely testable.

---

## API

| Method | Path | Input | Output |
|--------|------|-------|--------|
| POST | `/api/convert` | multipart: `file` (PDF), query: `dpi` | `application/zip` stream |
| POST | `/api/merge` | multipart: `files[]` (PDFs, ordered) | `application/pdf` download |

Both routes use multer with memory storage (no temp files on disk).

---

## Testing

**Framework:** Vitest

**Scope:** Unit tests only, with mocked/fixture PDF inputs.

| Test file | What it tests |
|-----------|---------------|
| `pdfToImages.test.ts` | `convertPdfToImages` — correct page count, buffer type, DPI effect |
| `mergePdfs.test.ts` | `mergePdfBuffers` — page count of output equals sum of inputs, order preserved |

Test fixtures: small synthetic PDFs generated with pdf-lib in a `tests/fixtures/` helper, or committed as static `.pdf` files.

---

## Dependencies

| Package | Purpose | Where |
|---------|---------|-------|
| react, react-dom | UI framework | client |
| vite | Dev server + bundler | client |
| dnd-kit | Drag-and-drop list | client |
| pdf.js (pdfjs-dist) | Browser-side PDF rendering | client |
| jszip | Browser-side zip creation | client |
| express | HTTP server | server |
| multer | Multipart file upload | server |
| pdf-lib | PDF merging + fixture creation | server + tests |
| pdf2pic | Server-side PDF→PNG conversion | server |
| archiver | Server-side zip creation | server |
| concurrently | Run client + server together | root |
| vitest | Unit test runner | tests |
| typescript | Type checking | all |

---

## Out of Scope

- Page-level reordering within a document (merge is document-level only)
- Authentication or user accounts
- File history or persistence
- Deployment / cloud hosting
