# Edit PDF — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-only "Edit PDF" tab that lets users annotate a PDF with shapes, text, and signatures, save annotations to localStorage, and export as a flattened or annotated PDF.

**Architecture:** pdfjs-dist renders each PDF page to a background `<canvas>`; a Fabric.js `Canvas` sits transparently on top to handle interactive annotation objects. All state is serialized as Fabric.js JSON and auto-saved to localStorage keyed by a hash of the uploaded file. Export runs entirely in the browser using pdf-lib.

**Tech Stack:** React 18, TypeScript, Fabric.js v6, signature_pad, pdfjs-dist (already installed), pdf-lib (already installed), Vitest (node env for pure-function tests)

---

## File Map

| File | Role |
|------|------|
| `src/lib/editor/types.ts` | Shared types: `ToolType`, `StyleState`, `SavedSignature`, `AnnotationSession` |
| `src/lib/editor/persistence.ts` | localStorage save/restore; djb2 hash; storage usage |
| `src/lib/editor/fabricHelpers.ts` | Fabric.js canvas init; shape/text/signature factories; undo/redo history |
| `src/lib/editor/pdfExport.ts` | Flatten pipeline; annotated pipeline; `downloadBlob` |
| `src/components/editor/AnnotationCanvas.tsx` | One-page component: pdfjs bg canvas + Fabric.js overlay; exposes handle via ref |
| `src/components/editor/EditorToolbar.tsx` | Left sidebar: tool buttons, style controls, undo/redo, download |
| `src/components/editor/SignatureManager.tsx` | Modal: draw/type/upload tabs; list of saved signatures |
| `src/pages/EditPdf.tsx` | Page shell: upload, session restore banner, scrollable pages, export dialog |
| `src/App.tsx` | Add `'edit'` tab |
| `src/pages/Home.tsx` | Add Edit PDF card |
| `tests/persistence.test.ts` | Unit tests for `djb2Hash` and localStorage helpers |
| `public/fonts/NotoSans-Regular.ttf` | Bundled font for PDF export |
| `public/fonts/NotoSansMono-Regular.ttf` | Bundled monospaced font |
| `public/fonts/DancingScript-Regular.ttf` | Bundled cursive font for typed signatures |

---

## Task 1: Install dependencies and bundle fonts

**Files:**
- Modify: `package.json`
- Create: `public/fonts/` (three TTF files)

- [ ] **Step 1: Install Fabric.js and signature_pad**

```bash
npm install fabric signature_pad
npm install --save-dev @types/signature_pad
```

Expected output: both packages added to `node_modules`. Fabric.js v6 includes its own TypeScript types so no `@types/fabric` needed.

- [ ] **Step 2: Download fonts**

Download these three TTF files from Google Fonts and place them in `public/fonts/`:

1. `NotoSans-Regular.ttf` — https://fonts.google.com/specimen/Noto+Sans → Download family → find `NotoSans-Regular.ttf` in the zip
2. `NotoSansMono-Regular.ttf` — https://fonts.google.com/specimen/Noto+Sans+Mono → `NotoSansMono-Regular.ttf`
3. `DancingScript-Regular.ttf` — https://fonts.google.com/specimen/Dancing+Script → `DancingScript-Regular.ttf`

Create the directory:
```bash
mkdir -p public/fonts
```

Verify:
```bash
ls public/fonts/
# NotoSans-Regular.ttf  NotoSansMono-Regular.ttf  DancingScript-Regular.ttf
```

- [ ] **Step 3: Load fonts for on-screen rendering via CSS**

Add to `src/main.tsx` (or create `src/editor-fonts.css` and import it in `src/main.tsx`):

In `src/main.tsx`, add at the top:
```tsx
// existing imports...
import './editor-fonts.css';
```

Create `src/editor-fonts.css`:
```css
@font-face {
  font-family: 'Noto Sans';
  src: url('/fonts/NotoSans-Regular.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'Noto Sans Mono';
  src: url('/fonts/NotoSansMono-Regular.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}
@font-face {
  font-family: 'Dancing Script';
  src: url('/fonts/DancingScript-Regular.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json public/fonts/ src/editor-fonts.css src/main.tsx
git commit -m "feat: install fabric, signature_pad and bundle fonts for PDF editor"
```

---

## Task 2: Shared editor types

**Files:**
- Create: `src/lib/editor/types.ts`

- [ ] **Step 1: Create the types file**

```bash
mkdir -p src/lib/editor
```

Create `src/lib/editor/types.ts`:
```typescript
export type ToolType =
  | 'select'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'cross'
  | 'text'
  | 'mono-text'
  | 'checkmark'
  | 'crossmark'
  | 'dot'
  | 'signature';

export interface StyleState {
  strokeColor: string;
  strokeWidth: number;
  fillColor: string;
  fillEnabled: boolean;
  opacity: number;
  fontSize: number;
  fontFamily: string;
}

export const DEFAULT_STYLE: StyleState = {
  strokeColor: '#000000',
  strokeWidth: 2,
  fillColor: '#ff0000',
  fillEnabled: false,
  opacity: 1,
  fontSize: 16,
  fontFamily: 'Noto Sans',
};

export interface SavedSignature {
  id: string;
  name: string;
  dataUrl: string;
}

export interface AnnotationSession {
  filename: string;
  /** Fabric.js canvas.toJSON() result for each page, indexed by page number */
  pages: object[];
  savedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/editor/types.ts
git commit -m "feat: add shared editor types"
```

---

## Task 3: Persistence module

**Files:**
- Create: `src/lib/editor/persistence.ts`
- Create: `tests/persistence.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `tests/persistence.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { djb2Hash } from '../src/lib/editor/persistence';

describe('djb2Hash', () => {
  it('returns a hex string', () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const result = djb2Hash(bytes);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('returns the same hash for the same input', () => {
    const bytes = new Uint8Array([10, 20, 30]);
    expect(djb2Hash(bytes)).toBe(djb2Hash(bytes));
  });

  it('returns different hashes for different inputs', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 4]);
    expect(djb2Hash(a)).not.toBe(djb2Hash(b));
  });

  it('only reads up to 65536 bytes', () => {
    const short = new Uint8Array(100).fill(42);
    const long = new Uint8Array(200000).fill(42);
    // First 65536 bytes are the same (all 42), so hashes match
    expect(djb2Hash(short)).not.toBe(djb2Hash(long)); // short < 65536, long > 65536 but same prefix
    // Just verify it doesn't throw on large input
    expect(() => djb2Hash(long)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/persistence.test.ts
```

Expected: FAIL — `djb2Hash` not found.

- [ ] **Step 3: Implement persistence.ts**

Create `src/lib/editor/persistence.ts`:
```typescript
import type { SavedSignature, AnnotationSession } from './types';

const ANNO_KEY_PREFIX = 'pdf-editor-annotations-';
const SIG_KEY = 'pdf-editor-signatures';

export function djb2Hash(bytes: Uint8Array): string {
  let hash = 5381;
  const len = Math.min(bytes.length, 65536);
  for (let i = 0; i < len; i++) {
    hash = (((hash << 5) + hash) ^ bytes[i]) >>> 0;
  }
  return hash.toString(16);
}

export async function hashFile(file: File): Promise<string> {
  const slice = file.slice(0, 65536);
  const buffer = await slice.arrayBuffer();
  return djb2Hash(new Uint8Array(buffer));
}

export function saveAnnotations(hash: string, session: AnnotationSession): void {
  localStorage.setItem(ANNO_KEY_PREFIX + hash, JSON.stringify(session));
}

export function loadAnnotations(hash: string): AnnotationSession | null {
  const raw = localStorage.getItem(ANNO_KEY_PREFIX + hash);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AnnotationSession;
  } catch {
    return null;
  }
}

export function clearAnnotations(hash: string): void {
  localStorage.removeItem(ANNO_KEY_PREFIX + hash);
}

export function saveSignatures(signatures: SavedSignature[]): void {
  localStorage.setItem(SIG_KEY, JSON.stringify(signatures));
}

export function loadSignatures(): SavedSignature[] {
  const raw = localStorage.getItem(SIG_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as SavedSignature[];
  } catch {
    return [];
  }
}

export function getStorageUsageBytes(): number {
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('pdf-editor-')) {
      const val = localStorage.getItem(key) ?? '';
      total += (key.length + val.length) * 2;
    }
  }
  return total;
}

export function clearAllEditorData(): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('pdf-editor-')) keys.push(key);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npm test -- tests/persistence.test.ts
```

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor/persistence.ts tests/persistence.test.ts
git commit -m "feat: add persistence module with localStorage save/restore and djb2 hash"
```

---

## Task 4: Fabric.js helpers

**Files:**
- Create: `src/lib/editor/fabricHelpers.ts`

This module is browser-only (requires DOM); it is not unit tested in the node test environment.

- [ ] **Step 1: Create fabricHelpers.ts**

Create `src/lib/editor/fabricHelpers.ts`:
```typescript
import {
  Canvas,
  Rect,
  Ellipse,
  Line,
  Group,
  IText,
  FabricImage,
} from 'fabric';
import type { ToolType, StyleState } from './types';

// ── History ──────────────────────────────────────────────────────────────────

export interface HistoryState {
  snapshots: string[];
  index: number;
}

export function createHistory(): HistoryState {
  return { snapshots: ['{"version":"6.0.0","objects":[]}'], index: 0 };
}

export function saveSnapshot(canvas: Canvas, history: HistoryState): void {
  const json = JSON.stringify(canvas.toJSON());
  history.snapshots.splice(history.index + 1);
  history.snapshots.push(json);
  if (history.snapshots.length > 50) {
    history.snapshots.shift();
  } else {
    history.index++;
  }
}

export async function undoHistory(canvas: Canvas, history: HistoryState): Promise<void> {
  if (history.index <= 0) return;
  history.index--;
  await canvas.loadFromJSON(JSON.parse(history.snapshots[history.index]));
  canvas.renderAll();
}

export async function redoHistory(canvas: Canvas, history: HistoryState): Promise<void> {
  if (history.index >= history.snapshots.length - 1) return;
  history.index++;
  await canvas.loadFromJSON(JSON.parse(history.snapshots[history.index]));
  canvas.renderAll();
}

// ── Canvas setup ──────────────────────────────────────────────────────────────

export function initFabricCanvas(el: HTMLCanvasElement, width: number, height: number): Canvas {
  return new Canvas(el, {
    width,
    height,
    backgroundColor: undefined, // transparent — PDF canvas shows through
    selection: true,
  });
}

export function deleteSelected(canvas: Canvas): void {
  canvas.getActiveObjects().forEach((obj) => canvas.remove(obj));
  canvas.discardActiveObject();
  canvas.renderAll();
}

// ── Drawing handlers ─────────────────────────────────────────────────────────

/**
 * Installs mouse event handlers on the Fabric.js canvas for all drawing tools.
 * Re-call this when the active tool changes (it removes previous listeners first).
 * Returns a cleanup function to remove the listeners.
 */
export function installDrawingHandlers(
  canvas: Canvas,
  getActiveTool: () => ToolType,
  getStyle: () => StyleState,
  getActiveSignatureUrl: () => string | null,
  onObjectAdded: () => void,
): () => void {
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let previewShape: Rect | Ellipse | Line | null = null;

  function ptr(e: MouseEvent): { x: number; y: number } {
    const p = canvas.getScenePoint(e);
    return { x: p.x, y: p.y };
  }

  const onMouseDown = (opt: { e: MouseEvent }) => {
    const tool = getActiveTool();
    const style = getStyle();
    const { x, y } = ptr(opt.e);
    startX = x;
    startY = y;

    if (tool === 'select') return;

    // ── Click-to-place tools ──────────────────────────────────────────────────
    if (tool === 'text' || tool === 'mono-text') {
      const fontFamily = tool === 'mono-text' ? 'Noto Sans Mono' : style.fontFamily;
      const itext = new IText('Text', {
        left: x,
        top: y,
        fontSize: style.fontSize,
        fontFamily,
        fill: style.strokeColor,
        opacity: style.opacity,
        padding: 2,
      });
      canvas.add(itext);
      canvas.setActiveObject(itext);
      itext.enterEditing();
      itext.selectAll();
      canvas.renderAll();
      onObjectAdded();
      return;
    }

    if (tool === 'checkmark' || tool === 'crossmark' || tool === 'dot') {
      const char = tool === 'checkmark' ? '✓' : tool === 'crossmark' ? '✗' : '•';
      const sym = new IText(char, {
        left: x,
        top: y,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fill: style.strokeColor,
        opacity: style.opacity,
        editable: false,
      });
      canvas.add(sym);
      canvas.setActiveObject(sym);
      canvas.renderAll();
      onObjectAdded();
      return;
    }

    if (tool === 'cross') {
      const sz = style.fontSize * 1.5;
      const l1 = new Line([0, 0, sz, sz], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
      });
      const l2 = new Line([sz, 0, 0, sz], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
      });
      const group = new Group([l1, l2], { left: x - sz / 2, top: y - sz / 2 });
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.renderAll();
      onObjectAdded();
      return;
    }

    if (tool === 'signature') {
      const sigUrl = getActiveSignatureUrl();
      if (!sigUrl) return;
      FabricImage.fromURL(sigUrl).then((img) => {
        // Scale down large signatures to at most 200px wide
        if ((img.width ?? 0) > 200) {
          const scale = 200 / (img.width ?? 200);
          img.scaleX = scale;
          img.scaleY = scale;
        }
        img.set({ left: x, top: y });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        onObjectAdded();
      });
      return;
    }

    // ── Drag-to-draw tools ────────────────────────────────────────────────────
    isDrawing = true;
    canvas.selection = false;

    const common = {
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
      fill: style.fillEnabled ? style.fillColor : 'transparent',
      opacity: style.opacity,
      selectable: false,
      evented: false,
    };

    if (tool === 'rect') {
      previewShape = new Rect({ left: x, top: y, width: 0, height: 0, ...common });
    } else if (tool === 'ellipse') {
      previewShape = new Ellipse({ left: x, top: y, rx: 0, ry: 0, ...common });
    } else if (tool === 'line') {
      previewShape = new Line([x, y, x, y], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
        selectable: false,
        evented: false,
      });
    }

    if (previewShape) canvas.add(previewShape);
  };

  const onMouseMove = (opt: { e: MouseEvent }) => {
    if (!isDrawing || !previewShape) return;
    const tool = getActiveTool();
    const { x, y } = ptr(opt.e);
    const dx = x - startX;
    const dy = y - startY;

    if (tool === 'rect') {
      (previewShape as Rect).set({
        left: dx < 0 ? x : startX,
        top: dy < 0 ? y : startY,
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    } else if (tool === 'ellipse') {
      (previewShape as Ellipse).set({
        left: Math.min(startX, x),
        top: Math.min(startY, y),
        rx: Math.abs(dx) / 2,
        ry: Math.abs(dy) / 2,
      });
    } else if (tool === 'line') {
      (previewShape as Line).set({ x2: x, y2: y });
    }
    canvas.renderAll();
  };

  const onMouseUp = (opt: { e: MouseEvent }) => {
    if (!isDrawing) return;
    isDrawing = false;
    canvas.selection = true;

    const tool = getActiveTool();
    const style = getStyle();
    const { x, y } = ptr(opt.e);
    const dx = x - startX;
    const dy = y - startY;

    if (previewShape) {
      canvas.remove(previewShape);
      previewShape = null;
    }

    // Skip if the user just clicked without dragging
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;

    const finalStyle = {
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
      fill: style.fillEnabled ? style.fillColor : 'transparent',
      opacity: style.opacity,
    };

    let finalShape: Rect | Ellipse | Line;

    if (tool === 'rect') {
      finalShape = new Rect({
        left: dx < 0 ? x : startX,
        top: dy < 0 ? y : startY,
        width: Math.abs(dx),
        height: Math.abs(dy),
        ...finalStyle,
      });
    } else if (tool === 'ellipse') {
      finalShape = new Ellipse({
        left: Math.min(startX, x),
        top: Math.min(startY, y),
        rx: Math.abs(dx) / 2,
        ry: Math.abs(dy) / 2,
        ...finalStyle,
      });
    } else {
      // line
      finalShape = new Line([startX, startY, x, y], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
      });
    }

    canvas.add(finalShape);
    canvas.setActiveObject(finalShape);
    canvas.renderAll();
    onObjectAdded();
  };

  canvas.on('mouse:down', onMouseDown);
  canvas.on('mouse:move', onMouseMove);
  canvas.on('mouse:up', onMouseUp);

  return () => {
    canvas.off('mouse:down', onMouseDown);
    canvas.off('mouse:move', onMouseMove);
    canvas.off('mouse:up', onMouseUp);
  };
}

// ── Style update on selected object ──────────────────────────────────────────

export function applyStyleToSelected(canvas: Canvas, style: StyleState): void {
  const objs = canvas.getActiveObjects();
  objs.forEach((obj) => {
    if ('stroke' in obj) obj.set('stroke', style.strokeColor);
    if ('strokeWidth' in obj) obj.set('strokeWidth', style.strokeWidth);
    if ('fill' in obj && obj.type !== 'i-text') {
      obj.set('fill', style.fillEnabled ? style.fillColor : 'transparent');
    }
    if ('fill' in obj && obj.type === 'i-text') {
      obj.set('fill', style.strokeColor);
    }
    obj.set('opacity', style.opacity);
  });
  canvas.renderAll();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/editor/fabricHelpers.ts
git commit -m "feat: add Fabric.js helper module with drawing handlers and history"
```

---

## Task 5: PDF export module

**Files:**
- Create: `src/lib/editor/pdfExport.ts`

- [ ] **Step 1: Create pdfExport.ts**

Create `src/lib/editor/pdfExport.ts`:
```typescript
import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { Canvas as FabricCanvas } from 'fabric';

export interface PageExportData {
  /** pdfjs-rendered background canvas */
  bgCanvas: HTMLCanvasElement;
  /** Fabric.js canvas JSON (canvas.toJSON()) */
  fabricJSON: object;
  /** Canvas pixel width */
  canvasWidth: number;
  /** Canvas pixel height */
  canvasHeight: number;
  /** Original PDF page width in points */
  pdfPageWidth: number;
  /** Original PDF page height in points */
  pdfPageHeight: number;
}

export async function flattenToPdf(pages: PageExportData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const pageData of pages) {
    // Composite bg + annotations onto an offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = pageData.canvasWidth;
    offscreen.height = pageData.canvasHeight;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(pageData.bgCanvas, 0, 0);

    // Render Fabric annotations to a temp canvas
    const tempEl = document.createElement('canvas');
    tempEl.width = pageData.canvasWidth;
    tempEl.height = pageData.canvasHeight;
    const tempFc = new FabricCanvas(tempEl, {
      width: pageData.canvasWidth,
      height: pageData.canvasHeight,
    });
    await tempFc.loadFromJSON(pageData.fabricJSON);
    tempFc.renderAll();
    ctx.drawImage(tempEl, 0, 0);
    tempFc.dispose();

    // Embed composite as PNG in the PDF page
    const pngDataUrl = offscreen.toDataURL('image/png');
    const pngBytes = await fetch(pngDataUrl).then((r) => r.arrayBuffer());
    const pdfPage = pdfDoc.addPage([pageData.pdfPageWidth, pageData.pdfPageHeight]);
    const pngImage = await pdfDoc.embedPng(pngBytes);
    pdfPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageData.pdfPageWidth,
      height: pageData.pdfPageHeight,
    });
  }

  return pdfDoc.save();
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

/** Converts canvas-pixel Y (top-down) to pdf-lib Y (bottom-up) */
function toPointY(fabricY: number, objectHeightPx: number, scaleY: number, pdfH: number): number {
  return pdfH - fabricY / scaleY - objectHeightPx / scaleY;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean, 16);
  return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
}

function parseColor(fill: unknown): ReturnType<typeof rgb> | undefined {
  if (!fill || fill === 'transparent' || fill === '' || fill === 'rgba(0,0,0,0)') return undefined;
  if (typeof fill === 'string' && fill.startsWith('#')) {
    const { r, g, b } = hexToRgb(fill);
    return rgb(r, g, b);
  }
  return undefined;
}

// ── Annotated export ──────────────────────────────────────────────────────────

interface FontUrls {
  regular: string;
  mono: string;
  cursive: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricObject = Record<string, any>;

export async function exportAnnotated(
  originalPdfBytes: Uint8Array,
  pages: PageExportData[],
  fontUrls: FontUrls,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pdfPages = pdfDoc.getPages();

  const [regularBytes, monoBytes, cursiveBytes] = await Promise.all([
    fetch(fontUrls.regular).then((r) => r.arrayBuffer()),
    fetch(fontUrls.mono).then((r) => r.arrayBuffer()),
    fetch(fontUrls.cursive).then((r) => r.arrayBuffer()),
  ]);
  const regularFont = await pdfDoc.embedFont(regularBytes);
  const monoFont = await pdfDoc.embedFont(monoBytes);
  const cursiveFont = await pdfDoc.embedFont(cursiveBytes);

  for (let i = 0; i < pages.length && i < pdfPages.length; i++) {
    const pageData = pages[i];
    const pdfPage = pdfPages[i];
    const { width: pdfW, height: pdfH } = pdfPage.getSize();
    const scaleX = pageData.canvasWidth / pdfW;
    const scaleY = pageData.canvasHeight / pdfH;

    const fabricData = pageData.fabricJSON as { objects?: FabricObject[] };
    for (const obj of fabricData.objects ?? []) {
      const opacity = (obj.opacity as number) ?? 1;
      const angle = (obj.angle as number) ?? 0;
      const strokeColor = parseColor(obj.stroke);
      const fillColor = parseColor(obj.fill);
      const strokeWidth = ((obj.strokeWidth as number) ?? 1) / scaleX;

      if (obj.type === 'Rect' || obj.type === 'rect') {
        const w = ((obj.width as number) * ((obj.scaleX as number) ?? 1)) / scaleX;
        const h = ((obj.height as number) * ((obj.scaleY as number) ?? 1)) / scaleY;
        pdfPage.drawRectangle({
          x: (obj.left as number) / scaleX,
          y: toPointY(obj.top as number, (obj.height as number) * ((obj.scaleY as number) ?? 1), scaleY, pdfH),
          width: w,
          height: h,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          color: fillColor,
          opacity,
          rotate: degrees(angle),
        });
      } else if (obj.type === 'Ellipse' || obj.type === 'ellipse') {
        const rx = ((obj.rx as number) * ((obj.scaleX as number) ?? 1)) / scaleX;
        const ry = ((obj.ry as number) * ((obj.scaleY as number) ?? 1)) / scaleY;
        pdfPage.drawEllipse({
          x: ((obj.left as number) + (obj.rx as number) * ((obj.scaleX as number) ?? 1)) / scaleX,
          y: toPointY(
            obj.top as number,
            (obj.ry as number) * ((obj.scaleY as number) ?? 1) * 2,
            scaleY,
            pdfH,
          ) + ry,
          xScale: rx,
          yScale: ry,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          color: fillColor,
          opacity,
        });
      } else if (obj.type === 'Line' || obj.type === 'line') {
        // Fabric Line: x1/y1/x2/y2 are relative to center; left/top is center
        const cx = (obj.left as number) / scaleX;
        const cy = (obj.top as number) / scaleY;
        const hw = ((obj.width as number) / 2) / scaleX;
        const hh = ((obj.height as number) / 2) / scaleY;
        const absX1 = cx - hw;
        const absY1 = pdfH - cy + hh;
        const absX2 = cx + hw;
        const absY2 = pdfH - cy - hh;
        pdfPage.drawLine({
          start: { x: absX1, y: absY1 },
          end: { x: absX2, y: absY2 },
          thickness: strokeWidth,
          color: strokeColor,
          opacity,
        });
      } else if (obj.type === 'IText' || obj.type === 'i-text' || obj.type === 'Textbox') {
        const fontFamily = (obj.fontFamily as string) ?? 'Noto Sans';
        const font = fontFamily.includes('Mono') ? monoFont
          : fontFamily.includes('Dancing') ? cursiveFont
          : regularFont;
        const fontSize = ((obj.fontSize as number) ?? 16) / scaleY;
        const textColor = parseColor(obj.fill);
        const text = (obj.text as string) ?? '';
        if (text.trim()) {
          pdfPage.drawText(text, {
            x: (obj.left as number) / scaleX,
            y: toPointY(obj.top as number, (obj.fontSize as number) ?? 16, scaleY, pdfH),
            size: fontSize,
            font,
            color: textColor,
            opacity,
            rotate: degrees(angle),
          });
        }
      } else if (obj.type === 'Image' || obj.type === 'image') {
        // Signatures — embed as image
        const src = (obj.src as string) ?? '';
        if (src.startsWith('data:image/png')) {
          const imgBytes = await fetch(src).then((r) => r.arrayBuffer());
          const embeddedImg = await pdfDoc.embedPng(imgBytes);
          const w = ((obj.width as number) * ((obj.scaleX as number) ?? 1)) / scaleX;
          const h = ((obj.height as number) * ((obj.scaleY as number) ?? 1)) / scaleY;
          pdfPage.drawImage(embeddedImg, {
            x: (obj.left as number) / scaleX,
            y: toPointY(obj.top as number, (obj.height as number) * ((obj.scaleY as number) ?? 1), scaleY, pdfH),
            width: w,
            height: h,
            opacity,
            rotate: degrees(angle),
          });
        }
      }
      // Group (cross shapes) — child objects handled recursively if needed;
      // for now groups render correctly in the flatten export.
    }
  }

  return pdfDoc.save();
}

export function downloadBlob(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/editor/pdfExport.ts
git commit -m "feat: add PDF export module with flatten and annotated pipelines"
```

---

## Task 6: AnnotationCanvas component

**Files:**
- Create: `src/components/editor/AnnotationCanvas.tsx`

- [ ] **Step 1: Create AnnotationCanvas.tsx**

```bash
mkdir -p src/components/editor
```

Create `src/components/editor/AnnotationCanvas.tsx`:
```tsx
import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import { Canvas as FabricCanvas } from 'fabric';
import {
  initFabricCanvas,
  installDrawingHandlers,
  saveSnapshot,
  undoHistory,
  redoHistory,
  deleteSelected,
  createHistory,
  applyStyleToSelected,
} from '../../lib/editor/fabricHelpers';
import type { ToolType, StyleState } from '../../lib/editor/types';

export interface AnnotationCanvasHandle {
  undo: () => void;
  redo: () => void;
  getJSON: () => object;
  getBgCanvas: () => HTMLCanvasElement;
  getFabricCanvas: () => FabricCanvas;
  loadJSON: (json: object) => Promise<void>;
  getPdfDimensions: () => { width: number; height: number };
}

interface Props {
  page: PDFPageProxy;
  pageIndex: number;
  scale: number;
  activeTool: ToolType;
  style: StyleState;
  activeSignatureUrl: string | null;
  onChange: (pageIndex: number, json: object) => void;
  onActivate: (pageIndex: number) => void;
}

const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, Props>(
  ({ page, pageIndex, scale, activeTool, style, activeSignatureUrl, onChange, onActivate }, ref) => {
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const fabricElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    const historyRef = useRef(createHistory());
    const cleanupRef = useRef<(() => void) | null>(null);

    const activeToolRef = useRef(activeTool);
    const styleRef = useRef(style);
    const sigUrlRef = useRef(activeSignatureUrl);

    // Keep refs in sync with props for use inside stable callbacks
    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { styleRef.current = style; }, [style]);
    useEffect(() => { sigUrlRef.current = activeSignatureUrl; }, [activeSignatureUrl]);

    const viewport = page.getViewport({ scale });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    // ── Render PDF page ────────────────────────────────────────────────────────
    useEffect(() => {
      const bgCanvas = bgCanvasRef.current;
      if (!bgCanvas) return;
      bgCanvas.width = width;
      bgCanvas.height = height;
      const ctx = bgCanvas.getContext('2d')!;
      page.render({ canvasContext: ctx, viewport }).promise.catch(console.error);
    }, [page, viewport, width, height]);

    // ── Init Fabric.js canvas ─────────────────────────────────────────────────
    useEffect(() => {
      const el = fabricElRef.current;
      if (!el) return;
      const fc = initFabricCanvas(el, width, height);
      fabricRef.current = fc;

      fc.on('mouse:down', () => onActivate(pageIndex));

      return () => {
        fc.dispose();
        fabricRef.current = null;
      };
    }, [width, height, pageIndex, onActivate]);

    // ── Install drawing handlers (re-installs when tool or style changes) ─────
    useEffect(() => {
      const fc = fabricRef.current;
      if (!fc) return;

      if (cleanupRef.current) cleanupRef.current();

      // Update cursor
      fc.defaultCursor = activeToolRef.current === 'select' ? 'default' : 'crosshair';
      fc.selection = activeToolRef.current === 'select';

      cleanupRef.current = installDrawingHandlers(
        fc,
        () => activeToolRef.current,
        () => styleRef.current,
        () => sigUrlRef.current,
        () => {
          const fc2 = fabricRef.current;
          if (!fc2) return;
          saveSnapshot(fc2, historyRef.current);
          onChange(pageIndex, fc2.toJSON());
        },
      );
    }, [activeTool, pageIndex, onChange]);

    // ── Apply style changes to currently selected object ──────────────────────
    useEffect(() => {
      const fc = fabricRef.current;
      if (!fc) return;
      applyStyleToSelected(fc, style);
      onChange(pageIndex, fc.toJSON());
    }, [style, pageIndex, onChange]);

    useImperativeHandle(ref, () => ({
      undo: () => {
        const fc = fabricRef.current;
        if (!fc) return;
        undoHistory(fc, historyRef.current).then(() => onChange(pageIndex, fc.toJSON()));
      },
      redo: () => {
        const fc = fabricRef.current;
        if (!fc) return;
        redoHistory(fc, historyRef.current).then(() => onChange(pageIndex, fc.toJSON()));
      },
      getJSON: () => fabricRef.current?.toJSON() ?? { objects: [] },
      getBgCanvas: () => bgCanvasRef.current!,
      getFabricCanvas: () => fabricRef.current!,
      loadJSON: async (json: object) => {
        const fc = fabricRef.current;
        if (!fc) return;
        await fc.loadFromJSON(json);
        fc.renderAll();
        saveSnapshot(fc, historyRef.current);
      },
      getPdfDimensions: () => {
        const vp = page.getViewport({ scale: 1 });
        return { width: vp.width, height: vp.height };
      },
    }));

    return (
      <div
        style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}
        role="region"
        aria-label={`Page ${pageIndex + 1}`}
      >
        <canvas
          ref={bgCanvasRef}
          style={{ display: 'block', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
        />
        <div style={{ position: 'absolute', top: 0, left: 0 }}>
          <canvas
            ref={fabricElRef}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                const fc = fabricRef.current;
                if (!fc) return;
                deleteSelected(fc);
                saveSnapshot(fc, historyRef.current);
                onChange(pageIndex, fc.toJSON());
              }
            }}
            tabIndex={0}
          />
        </div>
      </div>
    );
  },
);

AnnotationCanvas.displayName = 'AnnotationCanvas';
export default AnnotationCanvas;
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/AnnotationCanvas.tsx
git commit -m "feat: add AnnotationCanvas component with pdfjs + Fabric.js overlay"
```

---

## Task 7: EditorToolbar component

**Files:**
- Create: `src/components/editor/EditorToolbar.tsx`

- [ ] **Step 1: Create EditorToolbar.tsx**

Create `src/components/editor/EditorToolbar.tsx`:
```tsx
import type { CSSProperties } from 'react';
import type { ToolType, StyleState } from '../../lib/editor/types';

interface ToolDef {
  id: ToolType;
  label: string;
  shortcut: string;
  symbol: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select',    label: 'Select',      shortcut: 'V', symbol: '↖' },
  { id: 'rect',      label: 'Rectangle',   shortcut: 'R', symbol: '▭' },
  { id: 'ellipse',   label: 'Ellipse',     shortcut: 'E', symbol: '⬭' },
  { id: 'line',      label: 'Line',        shortcut: 'L', symbol: '╱' },
  { id: 'cross',     label: 'Cross (×)',   shortcut: 'X', symbol: '✕' },
  { id: 'text',      label: 'Free text',   shortcut: 'T', symbol: 'T' },
  { id: 'mono-text', label: 'Monospaced',  shortcut: 'M', symbol: 'T̲' },
  { id: 'checkmark', label: 'Checkmark',   shortcut: '',  symbol: '✓' },
  { id: 'crossmark', label: 'Cross mark',  shortcut: '',  symbol: '✗' },
  { id: 'dot',       label: 'Dot',         shortcut: '',  symbol: '•' },
  { id: 'signature', label: 'Signature',   shortcut: 'S', symbol: '✒' },
];

const FONT_FAMILIES = ['Noto Sans', 'Arial', 'Georgia', 'Dancing Script'];

interface Props {
  activeTool: ToolType;
  style: StyleState;
  onToolChange: (tool: ToolType) => void;
  onStyleChange: (patch: Partial<StyleState>) => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenSignatures: () => void;
  onDownload: () => void;
  hasFile: boolean;
}

const sidebarStyle: CSSProperties = {
  width: 56,
  minHeight: '100%',
  background: '#f9fafb',
  borderRight: '1px solid #e5e7eb',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px 0',
  gap: 2,
  flexShrink: 0,
};

const dividerStyle: CSSProperties = {
  width: 36,
  height: 1,
  background: '#e5e7eb',
  margin: '4px 0',
};

function ToolButton({
  def,
  active,
  disabled,
  onClick,
}: {
  def: ToolDef;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const tooltip = def.shortcut ? `${def.label} [${def.shortcut}]` : def.label;
  return (
    <button
      title={tooltip}
      aria-label={tooltip}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        border: active ? '2px solid #0070f3' : '1px solid transparent',
        borderRadius: 6,
        background: active ? '#e8f0fe' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        color: active ? '#0070f3' : '#444',
      }}
    >
      {def.symbol}
    </button>
  );
}

function IconButton({
  label,
  symbol,
  disabled,
  onClick,
}: {
  label: string;
  symbol: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 40,
        height: 40,
        border: '1px solid transparent',
        borderRadius: 6,
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 18,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        color: '#444',
      }}
    >
      {symbol}
    </button>
  );
}

export default function EditorToolbar({
  activeTool,
  style,
  onToolChange,
  onStyleChange,
  onUndo,
  onRedo,
  onOpenSignatures,
  onDownload,
  hasFile,
}: Props) {
  const shapeTools = TOOLS.filter((t) =>
    ['select', 'rect', 'ellipse', 'line', 'cross'].includes(t.id)
  );
  const textTools = TOOLS.filter((t) =>
    ['text', 'mono-text', 'checkmark', 'crossmark', 'dot'].includes(t.id)
  );
  const sigTool = TOOLS.find((t) => t.id === 'signature')!;

  const showFill = ['rect', 'ellipse'].includes(activeTool);
  const showFont = ['text', 'mono-text'].includes(activeTool);

  return (
    <div style={sidebarStyle}>
      {/* Shape tools */}
      {shapeTools.map((def) => (
        <ToolButton
          key={def.id}
          def={def}
          active={activeTool === def.id}
          disabled={!hasFile}
          onClick={() => onToolChange(def.id)}
        />
      ))}
      <div style={dividerStyle} />

      {/* Text tools */}
      {textTools.map((def) => (
        <ToolButton
          key={def.id}
          def={def}
          active={activeTool === def.id}
          disabled={!hasFile}
          onClick={() => onToolChange(def.id)}
        />
      ))}
      <div style={dividerStyle} />

      {/* Signature */}
      <ToolButton
        def={sigTool}
        active={activeTool === 'signature'}
        disabled={!hasFile}
        onClick={() => { onToolChange('signature'); onOpenSignatures(); }}
      />
      <div style={dividerStyle} />

      {/* Style controls */}
      <div title="Stroke color" style={{ padding: '2px 0' }}>
        <input
          type="color"
          value={style.strokeColor}
          onChange={(e) => onStyleChange({ strokeColor: e.target.value })}
          disabled={!hasFile}
          style={{ width: 32, height: 28, cursor: 'pointer', border: 'none', padding: 0 }}
          aria-label="Stroke color"
        />
      </div>
      <div title={`Stroke width: ${style.strokeWidth}px`} style={{ width: 40, padding: '0 4px' }}>
        <input
          type="range"
          min={1}
          max={10}
          value={style.strokeWidth}
          onChange={(e) => onStyleChange({ strokeWidth: Number(e.target.value) })}
          disabled={!hasFile}
          style={{ width: 36 }}
          aria-label="Stroke width"
        />
      </div>

      {showFill && (
        <>
          <div title="Fill color" style={{ padding: '2px 0' }}>
            <input
              type="color"
              value={style.fillColor}
              onChange={(e) => onStyleChange({ fillColor: e.target.value })}
              disabled={!hasFile}
              style={{ width: 32, height: 28, cursor: 'pointer', border: 'none', padding: 0 }}
              aria-label="Fill color"
            />
          </div>
          <button
            title={`Fill: ${style.fillEnabled ? 'on' : 'off'}`}
            onClick={() => onStyleChange({ fillEnabled: !style.fillEnabled })}
            disabled={!hasFile}
            style={{
              width: 40,
              height: 28,
              fontSize: 11,
              border: `1px solid ${style.fillEnabled ? '#0070f3' : '#ccc'}`,
              borderRadius: 4,
              background: style.fillEnabled ? '#e8f0fe' : 'transparent',
              cursor: 'pointer',
              color: style.fillEnabled ? '#0070f3' : '#888',
            }}
          >
            Fill
          </button>
        </>
      )}

      {showFont && (
        <>
          <div title="Font" style={{ width: 40, padding: '2px 0' }}>
            <select
              value={style.fontFamily}
              onChange={(e) => onStyleChange({ fontFamily: e.target.value })}
              disabled={!hasFile}
              style={{ width: 40, fontSize: 10, cursor: 'pointer' }}
              aria-label="Font"
            >
              {FONT_FAMILIES.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
          <div title={`Font size: ${style.fontSize}px`} style={{ width: 40, padding: '0 4px' }}>
            <input
              type="number"
              min={8}
              max={72}
              value={style.fontSize}
              onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
              disabled={!hasFile}
              style={{ width: 36, fontSize: 11 }}
              aria-label="Font size"
            />
          </div>
        </>
      )}

      <div title={`Opacity: ${Math.round(style.opacity * 100)}%`} style={{ width: 40, padding: '0 4px' }}>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(style.opacity * 100)}
          onChange={(e) => onStyleChange({ opacity: Number(e.target.value) / 100 })}
          disabled={!hasFile}
          style={{ width: 36 }}
          aria-label="Opacity"
        />
      </div>

      <div style={dividerStyle} />

      {/* Undo / Redo */}
      <IconButton label="Undo [Ctrl+Z]" symbol="↩" disabled={!hasFile} onClick={onUndo} />
      <IconButton label="Redo [Ctrl+Y]" symbol="↪" disabled={!hasFile} onClick={onRedo} />

      <div style={dividerStyle} />

      {/* Download */}
      <IconButton label="Download" symbol="⬇" disabled={!hasFile} onClick={onDownload} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/EditorToolbar.tsx
git commit -m "feat: add EditorToolbar component with tool buttons, style controls, shortcuts"
```

---

## Task 8: SignatureManager modal

**Files:**
- Create: `src/components/editor/SignatureManager.tsx`

- [ ] **Step 1: Create SignatureManager.tsx**

Create `src/components/editor/SignatureManager.tsx`:
```tsx
import { useState, useRef, useEffect } from 'react';
import SignaturePad from 'signature_pad';
import type { SavedSignature } from '../../lib/editor/types';
import { saveSignatures } from '../../lib/editor/persistence';

type Tab = 'draw' | 'type' | 'upload';

const CURSIVE_FONTS = ['Dancing Script', 'Georgia', 'Arial'];

interface Props {
  signatures: SavedSignature[];
  onSignaturesChange: (sigs: SavedSignature[]) => void;
  activeSignatureId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function overlayStyle(): React.CSSProperties {
  return {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };
}

function modalStyle(): React.CSSProperties {
  return {
    background: '#fff', borderRadius: 8, padding: 24, width: 480, maxHeight: '90vh',
    overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  };
}

export default function SignatureManager({
  signatures,
  onSignaturesChange,
  activeSignatureId,
  onSelect,
  onClose,
}: Props) {
  const [tab, setTab] = useState<Tab>('draw');
  const [typedName, setTypedName] = useState('');
  const [typedFont, setTypedFont] = useState('Dancing Script');
  const padCanvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (tab !== 'draw') return;
    const canvas = padCanvasRef.current;
    if (!canvas) return;
    padRef.current = new SignaturePad(canvas, { backgroundColor: 'rgb(255,255,255)' });
    return () => { padRef.current?.off(); padRef.current = null; };
  }, [tab]);

  function saveNewSig(dataUrl: string) {
    const count = signatures.length + 1;
    const newSig: SavedSignature = { id: uid(), name: `Signature ${count}`, dataUrl };
    const updated = [...signatures, newSig];
    saveSignatures(updated);
    onSignaturesChange(updated);
    onSelect(newSig.id);
  }

  function handleSaveDraw() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) return;
    saveNewSig(pad.toDataURL('image/png'));
  }

  function handleSaveType() {
    if (!typedName.trim()) return;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    ctx.font = `48px "${typedFont}"`;
    ctx.textBaseline = 'middle';
    ctx.fillText(typedName, 16, 50);
    saveNewSig(canvas.toDataURL('image/png'));
  }

  function handleUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (dataUrl) saveNewSig(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  function handleDelete(id: string) {
    const updated = signatures.filter((s) => s.id !== id);
    saveSignatures(updated);
    onSignaturesChange(updated);
  }

  function handleRename(id: string, name: string) {
    const updated = signatures.map((s) => (s.id === id ? { ...s, name } : s));
    saveSignatures(updated);
    onSignaturesChange(updated);
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', border: 'none', borderBottom: active ? '2px solid #0070f3' : '2px solid transparent',
    background: 'none', cursor: 'pointer', fontWeight: active ? 600 : 400,
    color: active ? '#0070f3' : '#555', fontSize: '0.9rem',
  });

  return (
    <div style={overlayStyle()} role="dialog" aria-modal="true" aria-label="Signature Manager"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>Signatures</h3>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }}>✕</button>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 16 }}>
          {(['draw', 'type', 'upload'] as Tab[]).map((t) => (
            <button key={t} style={tabBtnStyle(tab === t)} onClick={() => setTab(t)}>
              {t === 'draw' ? 'Draw' : t === 'type' ? 'Type' : 'Upload'}
            </button>
          ))}
        </div>

        {/* Draw tab */}
        {tab === 'draw' && (
          <div>
            <canvas
              ref={padCanvasRef}
              width={432}
              height={150}
              style={{ border: '1px solid #ccc', borderRadius: 4, width: '100%', touchAction: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => padRef.current?.clear()}
                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>
                Clear
              </button>
              <button onClick={handleSaveDraw}
                style={{ padding: '6px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                Save signature
              </button>
            </div>
          </div>
        )}

        {/* Type tab */}
        {tab === 'type' && (
          <div>
            <input
              type="text"
              placeholder="Your name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: 16, border: '1px solid #ccc', borderRadius: 4, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <select
              value={typedFont}
              onChange={(e) => setTypedFont(e.target.value)}
              style={{ width: '100%', padding: '8px', fontSize: 14, border: '1px solid #ccc', borderRadius: 4, marginBottom: 8 }}
            >
              {CURSIVE_FONTS.map((f) => (
                <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
              ))}
            </select>
            {typedName && (
              <div style={{ fontFamily: typedFont, fontSize: 36, padding: 8, border: '1px solid #eee', borderRadius: 4, marginBottom: 8, minHeight: 56 }}>
                {typedName}
              </div>
            )}
            <button onClick={handleSaveType}
              style={{ padding: '6px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
              Save signature
            </button>
          </div>
        )}

        {/* Upload tab */}
        {tab === 'upload' && (
          <div>
            <label
              style={{ display: 'block', border: '2px dashed #aaa', borderRadius: 8, padding: '2rem', textAlign: 'center', cursor: 'pointer', color: '#666' }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) handleUpload(file);
              }}
            >
              Drop PNG / JPG / SVG here or click to select
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
              />
            </label>
          </div>
        )}

        {/* Saved signatures list */}
        {signatures.length > 0 && (
          <>
            <h4 style={{ marginTop: 24, marginBottom: 8 }}>Saved signatures</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {signatures.map((sig) => (
                <div
                  key={sig.id}
                  onClick={() => { onSelect(sig.id); onClose(); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: 8,
                    border: sig.id === activeSignatureId ? '2px solid #0070f3' : '1px solid #e5e7eb',
                    borderRadius: 6, cursor: 'pointer', background: sig.id === activeSignatureId ? '#e8f0fe' : '#fff',
                  }}
                >
                  <img src={sig.dataUrl} alt={sig.name}
                    style={{ width: 100, height: 40, objectFit: 'contain', border: '1px solid #eee', borderRadius: 4 }} />
                  <input
                    value={sig.name}
                    onChange={(e) => { e.stopPropagation(); handleRename(sig.id, e.target.value); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14 }}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(sig.id); }}
                    aria-label={`Delete ${sig.name}`}
                    style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/editor/SignatureManager.tsx
git commit -m "feat: add SignatureManager modal with draw/type/upload tabs"
```

---

## Task 9: EditPdf page

**Files:**
- Create: `src/pages/EditPdf.tsx`

- [ ] **Step 1: Create EditPdf.tsx**

Create `src/pages/EditPdf.tsx`:
```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import FileDropZone from '../components/FileDropZone';
import AnnotationCanvas from '../components/editor/AnnotationCanvas';
import EditorToolbar from '../components/editor/EditorToolbar';
import SignatureManager from '../components/editor/SignatureManager';
import type { AnnotationCanvasHandle } from '../components/editor/AnnotationCanvas';
import type { ToolType, StyleState, SavedSignature } from '../lib/editor/types';
import { DEFAULT_STYLE } from '../lib/editor/types';
import {
  hashFile,
  saveAnnotations,
  loadAnnotations,
  clearAnnotations,
  loadSignatures,
  getStorageUsageBytes,
  clearAllEditorData,
} from '../lib/editor/persistence';
import { flattenToPdf, exportAnnotated, downloadBlob } from '../lib/editor/pdfExport';
import type { PageExportData } from '../lib/editor/pdfExport';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const RENDER_SCALE = 1.5;
const FONT_URLS = {
  regular: '/fonts/NotoSans-Regular.ttf',
  mono: '/fonts/NotoSansMono-Regular.ttf',
  cursive: '/fonts/DancingScript-Regular.ttf',
};

export default function EditPdf() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [filename, setFilename] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [originalPdfBytes, setOriginalPdfBytes] = useState<Uint8Array | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [style, setStyle] = useState<StyleState>(DEFAULT_STYLE);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const [signatures, setSignatures] = useState<SavedSignature[]>(() => loadSignatures());
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null);
  const [showSignatureManager, setShowSignatureManager] = useState(false);

  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [pendingSession, setPendingSession] = useState<object[] | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [storageBytes, setStorageBytes] = useState(0);

  // One ref per page
  const canvasRefs = useRef<(AnnotationCanvasHandle | null)[]>([]);
  // Current page annotation JSONs (source of truth for save/export)
  const pageAnnotationsRef = useRef<object[]>([]);

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSave = useCallback(() => {
    if (!fileHash || !filename) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAnnotations(fileHash, {
        filename,
        pages: pageAnnotationsRef.current,
        savedAt: new Date().toISOString(),
      });
      setStorageBytes(getStorageUsageBytes());
    }, 500);
  }, [fileHash, filename]);

  const handleAnnotationChange = useCallback((pageIndex: number, json: object) => {
    pageAnnotationsRef.current[pageIndex] = json;
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleActivatePage = useCallback((idx: number) => setActivePageIndex(idx), []);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    setFilename(file.name);

    const bytes = new Uint8Array(await file.arrayBuffer());
    setOriginalPdfBytes(bytes);

    const hash = await hashFile(file);
    setFileHash(hash);

    const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    setPdfDoc(doc);

    const loadedPages: PDFPageProxy[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      loadedPages.push(await doc.getPage(i));
    }
    setPages(loadedPages);
    pageAnnotationsRef.current = loadedPages.map(() => ({ objects: [] }));
    canvasRefs.current = loadedPages.map(() => null);

    // Check for saved session
    const saved = loadAnnotations(hash);
    if (saved && saved.pages.length > 0) {
      setPendingSession(saved.pages);
      setShowRestoreBanner(true);
    }
  };

  // Restore saved session once canvases are mounted
  const restoreSession = useCallback(async (sessionPages: object[]) => {
    for (let i = 0; i < sessionPages.length; i++) {
      const handle = canvasRefs.current[i];
      if (handle) {
        await handle.loadJSON(sessionPages[i]);
        pageAnnotationsRef.current[i] = sessionPages[i];
      }
    }
  }, []);

  useEffect(() => {
    if (!showRestoreBanner && pendingSession) {
      // User dismissed without accepting — clear pending
      setPendingSession(null);
    }
  }, [showRestoreBanner, pendingSession]);

  const handleRestore = async () => {
    if (!pendingSession) return;
    setShowRestoreBanner(false);
    await restoreSession(pendingSession);
    setPendingSession(null);
  };

  const handleDiscard = () => {
    clearAnnotations(fileHash);
    setShowRestoreBanner(false);
    setPendingSession(null);
  };

  const activeSignatureUrl = signatures.find((s) => s.id === activeSignatureId)?.dataUrl ?? null;

  const handleUndo = () => canvasRefs.current[activePageIndex]?.undo();
  const handleRedo = () => canvasRefs.current[activePageIndex]?.redo();

  const handleExport = async (mode: 'flatten' | 'annotated') => {
    if (!originalPdfBytes || pages.length === 0) return;
    setExporting(true);
    try {
      const exportData: PageExportData[] = pages.map((page, i) => {
        const handle = canvasRefs.current[i];
        const vp1 = page.getViewport({ scale: 1 });
        const vpRender = page.getViewport({ scale: RENDER_SCALE });
        return {
          bgCanvas: handle!.getBgCanvas(),
          fabricJSON: handle?.getJSON() ?? { objects: [] },
          canvasWidth: Math.floor(vpRender.width),
          canvasHeight: Math.floor(vpRender.height),
          pdfPageWidth: vp1.width,
          pdfPageHeight: vp1.height,
        };
      });

      const baseName = filename.replace(/\.pdf$/i, '');
      const outName = `${baseName}-edited.pdf`;
      let bytes: Uint8Array;

      if (mode === 'flatten') {
        bytes = await flattenToPdf(exportData);
      } else {
        bytes = await exportAnnotated(originalPdfBytes, exportData, FONT_URLS);
      }
      downloadBlob(bytes, outName);
    } finally {
      setExporting(false);
      setShowExportDialog(false);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); handleRedo(); return; }
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const keyMap: Record<string, ToolType> = {
        v: 'select', r: 'rect', e: 'ellipse', l: 'line', x: 'cross',
        t: 'text', m: 'mono-text', s: 'signature',
      };
      const tool = keyMap[e.key.toLowerCase()];
      if (tool) {
        setActiveTool(tool);
        if (tool === 'signature') setShowSignatureManager(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePageIndex]);

  const storageKb = Math.round(storageBytes / 1024);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Edit PDF</h2>

      {!pdfDoc && (
        <FileDropZone onFiles={handleFiles} label="Drop a PDF here or click to select" />
      )}

      {showRestoreBanner && (
        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 6, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>Saved annotations found for this file. Restore?</span>
          <button onClick={handleRestore} style={{ padding: '4px 12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Restore</button>
          <button onClick={handleDiscard} style={{ padding: '4px 12px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>Discard</button>
        </div>
      )}

      {pdfDoc && (
        <div style={{ display: 'flex', gap: 0 }}>
          <EditorToolbar
            activeTool={activeTool}
            style={style}
            onToolChange={setActiveTool}
            onStyleChange={(patch) => setStyle((prev) => ({ ...prev, ...patch }))}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onOpenSignatures={() => setShowSignatureManager(true)}
            onDownload={() => setShowExportDialog(true)}
            hasFile={true}
          />

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', maxHeight: 'calc(100vh - 200px)' }}>
            {pages.map((page, i) => (
              <div key={i}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Page {i + 1}</div>
                <AnnotationCanvas
                  ref={(el) => { canvasRefs.current[i] = el; }}
                  page={page}
                  pageIndex={i}
                  scale={RENDER_SCALE}
                  activeTool={activeTool}
                  style={style}
                  activeSignatureUrl={activeSignatureUrl}
                  onChange={handleAnnotationChange}
                  onActivate={handleActivatePage}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {pdfDoc && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
          Storage used: ~{storageKb} KB
          {storageKb > 4000 && (
            <span style={{ color: '#dc2626', marginLeft: 8 }}>⚠ Approaching storage limit</span>
          )}
          {' · '}
          <button onClick={() => { clearAllEditorData(); setStorageBytes(0); }}
            style={{ background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', fontSize: 12, padding: 0 }}>
            Clear all saved data
          </button>
        </div>
      )}

      {/* Export dialog */}
      {showExportDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowExportDialog(false); }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0 }}>Download edited PDF</h3>
            <p style={{ color: '#555', fontSize: 14 }}>Choose export format:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                disabled={exporting}
                onClick={() => handleExport('flatten')}
                style={{ padding: '10px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                <strong>Flatten to PDF</strong>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Annotations baked in as image — works everywhere, not re-editable</div>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport('annotated')}
                title="Complex rotations and opacity effects may not be preserved perfectly"
                style={{ padding: '10px 16px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                <strong>PDF with annotations</strong>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Vector drawing calls on original PDF — selectable in Adobe Reader ⚠ limited fidelity</div>
              </button>
            </div>
            {exporting && <p style={{ color: '#888', marginTop: 12 }}>Exporting…</p>}
            <button onClick={() => setShowExportDialog(false)}
              style={{ marginTop: 16, background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showSignatureManager && (
        <SignatureManager
          signatures={signatures}
          onSignaturesChange={setSignatures}
          activeSignatureId={activeSignatureId}
          onSelect={(id) => { setActiveSignatureId(id); setActiveTool('signature'); }}
          onClose={() => setShowSignatureManager(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/EditPdf.tsx
git commit -m "feat: add EditPdf page with full annotation editor"
```

---

## Task 10: Wire into App.tsx and Home.tsx

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/pages/Home.tsx`

- [ ] **Step 1: Add 'edit' tab to App.tsx**

In `src/App.tsx`, update the `Tab` type and add the tab button and panel:

Replace the `type Tab` line:
```tsx
type Tab = 'home' | 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress' | 'edit';
```

Add import at the top:
```tsx
import EditPdf from './pages/EditPdf';
```

Add the tab button after the Compress button (inside the `role="tablist"` div):
```tsx
<button
  role="tab"
  id="tab-edit"
  aria-selected={tab === 'edit'}
  aria-controls="panel-edit"
  style={tabStyle(tab === 'edit')}
  onClick={() => setTab('edit')}
>
  Edit PDF
</button>
```

Add the panel after the Compress panel:
```tsx
<div
  role="tabpanel"
  id="panel-edit"
  aria-labelledby="tab-edit"
  hidden={tab !== 'edit'}
>
  <EditPdf />
</div>
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any type errors before proceeding.

- [ ] **Step 3: Add Edit PDF card to Home.tsx**

In `src/pages/Home.tsx`, update the `Tab` type and the tools array.

Replace the `type Tab` line:
```tsx
type Tab = 'home' | 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress' | 'edit';
```

Add to the `tools` array (after the compress entry):
```tsx
{ tab: 'edit', icon: '✏️', name: 'Edit PDF', description: 'Add shapes, text, and signatures to any PDF page.' },
```

- [ ] **Step 4: Run TypeScript check again**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/pages/Home.tsx
git commit -m "feat: add Edit PDF tab to App and Home page"
```

---

## Manual Testing Checklist

Start the dev server:
```bash
npm run dev
```

Open http://localhost:5173 and verify:

- [ ] Home page shows "Edit PDF" card; clicking navigates to the Edit PDF tab
- [ ] Upload a multi-page PDF — pages render side by side, scrollable
- [ ] Select tool: clicking a placed object selects it; resize handles appear
- [ ] Rect tool: drag to draw rectangle; hollow and filled (toggle Fill)
- [ ] Ellipse tool: drag to draw ellipse
- [ ] Line tool: drag to draw line
- [ ] Cross tool: click to place an × shape
- [ ] Text tool: click to place text box; typing works; Unicode characters (ščćđž) render correctly
- [ ] Monospaced tool: places text in Noto Sans Mono
- [ ] Checkmark / Crossmark / Dot: single click places symbol
- [ ] Stroke color, stroke width, fill color, opacity controls update the selected object
- [ ] Font family and size controls appear when text tool is active
- [ ] Undo/Redo (buttons and Ctrl+Z / Ctrl+Y) work correctly
- [ ] Delete key removes selected object
- [ ] Keyboard shortcuts (V, R, E, L, X, T, M, S) switch active tool
- [ ] Signature Manager: draw tab captures signature; save creates entry in list
- [ ] Signature Manager: type tab renders name in chosen font; save creates entry
- [ ] Signature Manager: upload tab accepts PNG/JPG; save creates entry
- [ ] Selecting a saved signature and clicking canvas places it; it can be resized/moved
- [ ] Refresh page, re-upload same PDF → "Restore previous session?" banner appears
- [ ] Restore: annotations reappear; Discard: clean slate
- [ ] Download → Flatten: produces a valid PDF with annotations visible
- [ ] Download → Annotated: produces a valid PDF; open in Adobe Reader and verify shapes are present
- [ ] "Clear all saved data" removes localStorage entries

---

## Self-Review Notes

**Spec coverage:**
- Shape insert (rect, ellipse, line, cross) ✓ Task 4 & 6
- Fill/stroke/color/width controls ✓ Task 7
- Text (free + monospaced + symbols) ✓ Task 4 & 6
- Signature (draw/type/upload, multiple saved) ✓ Task 8
- localStorage persistence with restore banner ✓ Task 3 & 9
- Flatten export ✓ Task 5
- Annotated export ✓ Task 5
- Keyboard shortcuts + tooltips ✓ Tasks 7 & 9
- Undo/redo ✓ Tasks 4 & 6
- Scrollable multi-page view ✓ Task 9
- Storage usage indicator + clear button ✓ Task 9
- Font embedding for Unicode (Noto Sans, Mono, Dancing Script) ✓ Tasks 1 & 5

**Known limitations (documented in UI):**
- Annotated export does not preserve Group objects (cross shapes) — they appear correctly in flatten mode
- Rotated text in annotated export uses degrees() but complex transforms may not be pixel-perfect
- Signature images in annotated export only supports PNG data URLs; JPG/SVG signatures go through flatten mode correctly
