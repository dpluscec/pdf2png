---
title: Edit PDF — Design Spec
date: 2026-04-13
status: approved
---

# Edit PDF

## Overview

A new **Edit PDF** tab that lets users annotate a PDF with shapes, text, and signatures — directly in the browser. Annotations are saved to localStorage and the result can be exported as a flattened PDF or a PDF with embedded annotation objects.

No server involvement. All processing happens in the browser.

---

## Architecture

**Approach:** Fabric.js canvas overlay on top of pdfjs-dist rendered pages, with pdf-lib (browser build) for export.

**New files:**

```
src/
├── pages/
│   └── EditPdf.tsx                      # Page shell, PDF upload, page rendering loop
├── components/editor/
│   ├── AnnotationCanvas.tsx             # Fabric.js canvas overlay for one page
│   ├── EditorToolbar.tsx                # Left sidebar: tools, style controls, undo/redo, download
│   └── SignatureManager.tsx             # Slide-in panel: define, save, pick signatures
└── lib/editor/
    ├── fabricHelpers.ts                 # Fabric.js setup, shape/text/image factories
    ├── pdfExport.ts                     # Export pipeline: flatten and annotated modes
    └── persistence.ts                  # localStorage save/restore logic
```

**Layout:**

- Left: vertical `EditorToolbar` sidebar
- Main: scrollable column of PDF pages, each with an `AnnotationCanvas` overlay
- Modal overlay: `SignatureManager`

---

## Section 1: Page Structure & Data Flow

1. User uploads a PDF file
2. A fast hash (djb2/FNV-1a) of the first 64 KB is computed → checked against localStorage
3. If a saved session exists, a **"Restore previous session?"** banner offers Accept / Discard
4. `pdfjs-dist` renders each page to a `<canvas>` element used as the page background
5. A Fabric.js canvas is absolutely positioned on top of each page, pixel-matched to its dimensions
6. All annotation objects (shapes, text, images) live in Fabric.js and are serialized as JSON
7. On every annotation change (debounced 500 ms), state is auto-saved to localStorage
8. On Download, the export pipeline runs entirely in the browser

---

## Section 2: Annotation Tools

### Toolbar layout (vertical left sidebar)

Groups separated by dividers, with hover tooltips showing tool name and keyboard shortcut:

| Group | Tools |
|-------|-------|
| **Select** | Select / move / resize / delete objects |
| **Shapes** | Rectangle, Circle/Ellipse, Line, Cross (two diagonal lines grouped) |
| **Text** | Free text, Monospaced text, ✓ Checkmark, ✗ Cross mark, • Dot |
| **Signature** | Open Signature Manager panel |
| **Style** | Border color, border width (1–10 px), fill color + toggle, opacity |
| **History** | Undo, Redo |
| **Export** | Download button → export dialog |

Style controls are context-sensitive: shown when a shape tool is active or when an object is selected. Changes apply immediately to the selected object.

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| V | Select tool |
| R | Rectangle |
| E | Ellipse/Circle |
| L | Line |
| X | Cross shape |
| T | Free text |
| M | Monospaced text |
| S | Signature tool |
| Del / Backspace | Delete selected object |
| Ctrl+Z | Undo |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Escape | Deselect / return to Select tool |

### Interaction model

- **Shapes:** click-drag to define bounding box; release to place
- **Text:** click to place a text box; immediately enters edit mode
- **Special symbols (✓ ✗ •):** single click to place at cursor position
- **Signature:** clicking the canvas places the active signature as a Fabric.js `Image` object
- **Select mode:** click to select; drag selection handles to resize; all style changes apply to the selected object

---

## Section 3: Signature Manager

### Creating signatures (three tabs)

1. **Draw** — signature pad canvas; user draws with mouse or touch; "Clear" button to retry
2. **Type** — text input with font selector (cursive/handwriting fonts: Dancing Script, Pacifico, Caveat — bundled or loaded from Google Fonts); live preview
3. **Upload** — file drop zone accepting PNG / JPG / SVG; auto-cropped to content bounds (transparent/white edges trimmed)

Each signature is saved as a named entry with a base64 data URL.

### Managing signatures

- Grid/list view of saved signatures: thumbnail, editable name, delete button
- Defaults: "Signature 1", "Signature 2", etc.
- Clicking a signature selects it as active and closes the panel
- No hard count limit (storage budget applies — see Persistence section)

### Placing signatures

- With Signature tool active and a signature selected, clicking the canvas places it as a Fabric.js `Image`
- The placed image can be moved, resized, and rotated in Select mode
- Switching signatures mid-session: re-open the panel and pick another

---

## Section 4: PDF Export

### Download dialog

Two export modes offered when the user clicks Download:

| Mode | Description |
|------|-------------|
| **Flatten to PDF** | Annotations burned into page content as raster images; not re-editable in any viewer |
| **PDF with Annotations** | Annotations translated to pdf-lib drawing calls; shapes/text remain as vector objects in the PDF |

Output filename: `<original-filename>-edited.pdf`

### Flatten pipeline

1. For each page: composite pdfjs-dist background canvas + Fabric.js annotation canvas → single merged canvas
2. Use `pdf-lib` (browser build) to create a new PDF; insert each merged canvas as a full-page PNG or JPEG image
3. Trigger browser download

Result is image-based and not text-searchable, but perfectly faithful to what the user sees on screen.

### Annotated PDF pipeline

1. Load original PDF bytes into `pdf-lib`
2. For each page, iterate Fabric.js objects and translate to pdf-lib drawing calls:

| Fabric.js type | pdf-lib call |
|----------------|-------------|
| `Rect` | `page.drawRectangle()` |
| `Ellipse` | `page.drawEllipse()` |
| `Line` | `page.drawLine()` |
| `IText` / `Textbox` | `page.drawText()` with embedded font |
| `Image` (signature) | `page.drawImage()` |
| Cross shape | Two `page.drawLine()` calls |

3. Trigger browser download

**Font embedding:** A curated set of TTF fonts with broad Unicode coverage (including Latin Extended: ščćđž) are bundled with the app. Font mapping at export: sans-serif fonts → Noto Sans, monospaced → Noto Sans Mono, cursive/handwriting (signatures typed with font) → Dancing Script. These are embedded into the output PDF via pdf-lib's `embedFont`.

**Limitation:** Some Fabric.js visual properties (complex opacity, rotated text) have no direct pdf-lib equivalent. Unsupported properties fall back to their closest approximation. This limitation is noted in a tooltip on the Annotated mode option.

---

## Section 5: Persistence

### Document annotations

- **Key:** `pdf-editor-annotations-<hash>` where `<hash>` is a fast hash of the first 64 KB of the uploaded PDF
- **Value:** JSON blob containing:
  - `pages`: array of Fabric.js canvas JSON, one entry per page
  - `filename`: original filename
  - `savedAt`: ISO timestamp
- **Auto-save:** debounced 500 ms after every annotation change
- **On upload:** hash computed, localStorage checked; if match found → "Restore previous session?" banner (Accept / Discard)
- **Discard:** clears that document's localStorage entry

### Signatures

- **Key:** `pdf-editor-signatures`
- **Value:** `Array<{ id: string, name: string, dataUrl: string }>`
- Shared across all documents; persisted on every change

### Storage management

- The Signature Manager shows an approximate storage usage indicator
- A warning is shown when total usage approaches 4 MB
- A **"Clear all saved data"** button in the editor clears both annotation and signature entries

---

## Dependencies

| Package | Purpose | Already in project? |
|---------|---------|-------------------|
| `fabric` | Interactive annotation canvas | No — add |
| `signature_pad` | Smooth draw-mode signature input | No — add |
| `pdfjs-dist` | Render PDF pages to canvas | Yes |
| `pdf-lib` | Browser-side PDF export | Yes |
| Noto Sans TTF | Unicode font for PDF embedding | No — bundle |

---

## Out of Scope

- OCR or text extraction from the PDF
- Editing existing PDF text content (only adding annotations on top)
- Server-side export (all export is browser-only)
- Collaboration / multi-user editing
- Annotation layers / visibility toggling in the viewer
- Undo/redo across sessions (undo history is in-memory only; localStorage stores final state)
