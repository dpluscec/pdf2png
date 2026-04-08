# Split PDF Feature — Design Spec

**Date:** 2026-04-08  
**Status:** Approved

---

## Overview

Add a "Split PDF" tab to the existing pdf2png application. The feature allows users to split a single PDF into multiple output PDFs using three modes: Range, Pages, and Size. Processing can be done in the browser or on the server (Range and Pages modes), or server-only (Size mode).

---

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/pages/SplitPdf.tsx` | Main page component — UI, state, client-side processing |
| `server/routes/split.ts` | Express route — handles `POST /api/split` |
| `server/lib/splitPdf.ts` | Core server-side splitting logic |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add 4th "Split PDF" tab |
| `server/index.ts` | Register `/api/split` route |

### Processing Modes

- **Range & Pages:** Browser (pdf-lib + JSZip) or Server — user selects via toggle
- **Size:** Server only — file size cannot be reliably predicted client-side before PDF creation

### Libraries Used

| Library | Use |
|---------|-----|
| `pdf-lib` | Extract pages, create new PDFs (both client and server) |
| `pdfjs-dist` | Render page thumbnails for visual page picker (client only) |
| `JSZip` | Package multiple PDFs into ZIP (client-side) |
| `archiver` | Package multiple PDFs into ZIP (server-side) |
| `multer` | File upload handling on the server |

---

## API Contract

**Endpoint:** `POST /api/split`  
**Content-Type:** `multipart/form-data`  
**Fields:** `file` (PDF), `config` (JSON string)

### Config Shapes

**Range — Custom:**
```json
{
  "mode": "range",
  "rangeType": "custom",
  "ranges": [{ "from": 1, "to": 5 }, { "from": 10, "to": 12 }],
  "mergeAll": false
}
```

**Range — Fixed (every N pages):**
```json
{
  "mode": "range",
  "rangeType": "fixed",
  "everyN": 5,
  "mergeAll": true
}
```

**Pages — Selected:**
```json
{
  "mode": "pages",
  "pageSelection": "selected",
  "pages": [1, 3, 7, 8, 9],
  "mergeSelected": false
}
```

**Pages — All:**
```json
{
  "mode": "pages",
  "pageSelection": "all"
}
```

**Size:**
```json
{
  "mode": "size",
  "maxSizeMb": 5
}
```

### Responses

- Single output PDF → `Content-Type: application/pdf`, PDF blob
- Multiple output PDFs → `Content-Type: application/zip`, ZIP blob

---

## UI Layout

Single "Split PDF" tab in the existing tab bar, following the same visual style (max-width 720px, inline CSS, #0070f3 accent).

### Top-to-Bottom Flow

1. **File drop zone** — accepts a single PDF file (reuses `FileDropZone` in compact mode after a file is selected)
2. **Mode selector** — three radio buttons: `Range | Pages | Size`
3. **Processing toggle** — `Browser / Server` radio (same pattern as PDF→PNG and PNG→PDF)
   - Hidden for Size mode; replaced with a static "Server only" label
4. **Mode panel** — changes based on selected mode (see below)
5. **Split button** — disabled until a file and valid config are present
6. **Status indicator** — idle / processing / done / error (same color scheme as existing features)
7. **Download button** — appears on success

---

## Mode Panels

### Range Mode

**Sub-mode radio:** `Custom | Fixed`

**Custom sub-mode:**
- List of row inputs, each with a "From" and "To" page number field
- "Add range" button appends a new empty row
- Each row has a remove (×) button
- Ranges may overlap; no validation enforced — user responsibility
- At least one range required to enable Split button

**Fixed sub-mode:**
- Single labeled number input: "Every N pages"
- Minimum value: 1

**Shared:**
- Checkbox: "Merge all ranges into one PDF"
  - Checked → single PDF output
  - Unchecked → one PDF per range, delivered as ZIP

---

### Pages Mode

**Sub-mode radio:** `All pages | Selected pages`

**All pages sub-mode:**
- No additional inputs
- Output: one PDF per page, delivered as ZIP

**Selected pages sub-mode:**
- **Text input:** accepts comma-separated page numbers and ranges (e.g. `1, 3, 5-8`)
  - Parsed to a sorted, deduplicated array of page numbers
  - Invalid entries are ignored with inline validation feedback
- **Thumbnail grid:** renders all PDF pages using pdfjs-dist
  - Clicking a thumbnail toggles its selection (highlighted border when selected)
  - Thumbnail grid and text input stay in sync bidirectionally
- **Checkbox:** "Merge selected pages into one PDF"
  - Checked → single PDF output
  - Unchecked → one PDF per selected page, delivered as ZIP

---

### Size Mode

- Single labeled number input: "Max size per chunk (MB)"
- Minimum value: 0.1
- Splitting strategy: pages are added to the current chunk sequentially; when adding the next page would push the chunk over the size limit, a new chunk begins
- Edge case: if a single page exceeds the max size, it is placed alone in its own chunk (no infinite loop)
- Output: always ZIP, multiple PDFs named `chunk-1.pdf`, `chunk-2.pdf`, etc.
- Processing toggle not shown; "Server only" label shown instead

---

## Error Handling

- Invalid page numbers (out of range, non-numeric) shown as inline validation below the text input
- Empty range list (Custom mode) disables the Split button
- Server errors returned as JSON `{ error: string }` and shown in the status area
- If a chunk ends up empty (e.g. range beyond document length), it is skipped silently on the server

---

## Testing

Add `tests/splitPdf.test.ts` covering:
- Custom ranges: correct pages extracted, correct number of output PDFs
- Fixed ranges: correct chunking at N-page boundaries
- Merge all: single output PDF contains all specified pages in order
- Pages — all: one PDF per page
- Pages — selected + merge: single PDF with only selected pages
- Size: chunks do not exceed max size; oversized single pages placed alone
- Edge cases: out-of-range pages ignored, empty ranges skipped

---

## Out of Scope

- Reordering output chunks before download
- Previewing output PDFs before download
- Saving split configurations for reuse
- Client-side processing for Size mode
