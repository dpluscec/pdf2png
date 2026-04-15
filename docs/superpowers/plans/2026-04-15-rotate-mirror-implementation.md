# Rotate & Mirror PDF + PNG Card Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Rotate & Mirror PDF tab (lossless, browser-only via pdf-lib) and per-card rotation buttons to the PNG → PDF tab.

**Architecture:** A shared `Rotation` type + `accumulateRotation` utility lives in `src/lib/rotateUtils.ts`. `RotatePdf.tsx` renders all pages via pdfjs-dist, applies CSS transforms for live preview, and writes pdf-lib content stream transforms on download. `PngToPdf.tsx` gains a `rotation` field on each image item, rotate CW/CCW buttons on each card, and an `applyRotation` canvas helper that pre-rotates images before embedding.

**Tech Stack:** React (hooks, inline styles), pdf-lib, pdfjs-dist, vitest

---

### Task 1: rotateUtils.ts — shared type and accumulation helper

**Files:**
- Create: `src/lib/rotateUtils.ts`
- Create: `tests/rotateUtils.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/rotateUtils.test.ts
import { describe, it, expect } from 'vitest';
import { accumulateRotation } from '../src/lib/rotateUtils';

describe('accumulateRotation', () => {
  it('adds 90 degrees', () => {
    expect(accumulateRotation(0, 90)).toBe(90);
    expect(accumulateRotation(90, 90)).toBe(180);
    expect(accumulateRotation(180, 90)).toBe(270);
  });

  it('wraps from 270 to 0 when adding 90', () => {
    expect(accumulateRotation(270, 90)).toBe(0);
  });

  it('subtracts 90 degrees', () => {
    expect(accumulateRotation(90, -90)).toBe(0);
    expect(accumulateRotation(180, -90)).toBe(90);
    expect(accumulateRotation(270, -90)).toBe(180);
  });

  it('wraps from 0 to 270 when subtracting 90', () => {
    expect(accumulateRotation(0, -90)).toBe(270);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```
npm test -- --reporter=verbose tests/rotateUtils.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/rotateUtils'`

- [ ] **Step 3: Create rotateUtils.ts**

```ts
// src/lib/rotateUtils.ts
export type Rotation = 0 | 90 | 180 | 270;

export function accumulateRotation(current: Rotation, delta: 90 | -90): Rotation {
  return (((current + delta) % 360 + 360) % 360) as Rotation;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```
npm test -- --reporter=verbose tests/rotateUtils.test.ts
```

Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/rotateUtils.ts tests/rotateUtils.test.ts
git commit -m "feat: add Rotation type and accumulateRotation utility"
```

---

### Task 2: PNG → PDF — per-card rotation

**Files:**
- Modify: `src/pages/PngToPdf.tsx`

- [ ] **Step 1: Add import and extend ImageItem**

At the top of `src/pages/PngToPdf.tsx`, add the import after the existing imports:

```ts
import { accumulateRotation } from '../lib/rotateUtils';
import type { Rotation } from '../lib/rotateUtils';
```

Change the `ImageItem` interface from:

```ts
interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}
```

To:

```ts
interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
  rotation: Rotation;
}
```

- [ ] **Step 2: Add the applyRotation helper**

Add this function after the `triggerDownload` function and before `outputFilename`:

```ts
async function applyRotation(file: File, rotation: Rotation): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const swap = rotation === 90 || rotation === 270;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? img.naturalHeight : img.naturalWidth;
      canvas.height = swap ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('canvas.toBlob failed')); return; }
        blob.arrayBuffer().then(resolve).catch(reject);
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}
```

- [ ] **Step 3: Update convertBrowser to apply rotation**

Replace the inner loop body in `convertBrowser` from:

```ts
  for (const item of items) {
    const buffer = await item.file.arrayBuffer();
    const pdfImage = isJpeg(item.file)
      ? await doc.embedJpg(buffer)
      : await doc.embedPng(buffer);
```

To:

```ts
  for (const item of items) {
    const buffer = item.rotation !== 0
      ? await applyRotation(item.file, item.rotation)
      : await item.file.arrayBuffer();
    const pdfImage = (item.rotation === 0 && isJpeg(item.file))
      ? await doc.embedJpg(buffer)
      : await doc.embedPng(buffer);
```

- [ ] **Step 4: Update convertServer to pre-rotate before upload**

Replace the body of `convertServer` from:

```ts
async function convertServer(items: ImageItem[], pageSize: PageSize): Promise<void> {
  const formData = new FormData();
  items.forEach((item) => formData.append('files', item.file));
```

To:

```ts
async function convertServer(items: ImageItem[], pageSize: PageSize): Promise<void> {
  const formData = new FormData();
  for (const item of items) {
    if (item.rotation !== 0) {
      const buffer = await applyRotation(item.file, item.rotation);
      const blob = new Blob([buffer], { type: 'image/png' });
      formData.append('files', blob, item.file.name.replace(/\.[^.]+$/, '.png'));
    } else {
      formData.append('files', item.file);
    }
  }
```

- [ ] **Step 5: Update SortableImageCard to support rotation**

Replace the `SortableImageCard` function signature and its full body with the version below. Key changes: `rotation` and `onRotate` props added; CSS transform on the `<img>`; rotate buttons in the footer.

```tsx
function SortableImageCard({
  item,
  cardSize,
  onRemove,
  onRotate,
}: {
  item: ImageItem;
  cardSize: number;
  onRemove: () => void;
  onRotate: (delta: 90 | -90) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        width: cardSize,
        border: '1px solid #ddd',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
        cursor: 'grab',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
      {...attributes}
      {...listeners}
    >
      <img
        src={item.previewUrl}
        alt={item.file.name}
        style={{
          width: '100%',
          height: cardSize,
          objectFit: 'contain',
          display: 'block',
          background: '#f5f5f5',
          transform: item.rotation !== 0 ? `rotate(${item.rotation}deg)` : undefined,
        }}
        draggable={false}
      />
      <div
        style={{
          padding: '0.4rem 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          borderTop: '1px solid #eee',
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '0.75rem',
            color: '#555',
          }}
          title={item.file.name}
        >
          {item.file.name}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRotate(-90); }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#666', fontSize: '0.9rem', flexShrink: 0, lineHeight: 1, padding: 0 }}
          aria-label="Rotate counter-clockwise"
          title="Rotate CCW"
        >
          ↺
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRotate(90); }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#666', fontSize: '0.9rem', flexShrink: 0, lineHeight: 1, padding: 0 }}
          aria-label="Rotate clockwise"
          title="Rotate CW"
        >
          ↻
        </button>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: '1rem', flexShrink: 0, lineHeight: 1, padding: 0 }}
          aria-label={`Remove ${item.file.name}`}
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Update handleFiles to set rotation: 0**

In the `PngToPdf` component, replace `handleFiles`:

```ts
  const handleFiles = (files: File[]) => {
    const newItems: ImageItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      rotation: 0,
    }));
    setItems((prev) => [...prev, ...newItems]);
    setStatus('idle');
    setError('');
  };
```

- [ ] **Step 7: Add rotateItem handler and pass onRotate to cards**

In the `PngToPdf` component, add `rotateItem` after `removeItem`:

```ts
  const rotateItem = (id: string, delta: 90 | -90) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, rotation: accumulateRotation(i.rotation, delta) } : i
      )
    );
  };
```

In the JSX, update the `<SortableImageCard>` usage to pass `onRotate`:

```tsx
                <SortableImageCard
                  key={item.id}
                  item={item}
                  cardSize={cardSize}
                  onRemove={() => removeItem(item.id)}
                  onRotate={(delta) => rotateItem(item.id, delta)}
                />
```

- [ ] **Step 8: Type-check**

```
npm run type-check:client
```

Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/pages/PngToPdf.tsx src/lib/rotateUtils.ts
git commit -m "feat: add per-card rotation to PNG → PDF"
```

---

### Task 3: RotatePdf page

**Files:**
- Create: `src/pages/RotatePdf.tsx`

- [ ] **Step 1: Create RotatePdf.tsx**

```tsx
// src/pages/RotatePdf.tsx
import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';
import FileDropZone from '../components/FileDropZone';
import { accumulateRotation } from '../lib/rotateUtils';
import type { Rotation } from '../lib/rotateUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PageEntry {
  id: string;
  index: number;
  rotation: Rotation;
  mirrorH: boolean;
  mirrorV: boolean;
}

type Status = 'idle' | 'processing' | 'done' | 'error';

const btnStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: '0.8rem',
  padding: '2px 6px',
  color: '#333',
  lineHeight: 1.2,
};

function pageImgTransform(entry: PageEntry): string {
  const parts: string[] = [];
  if (entry.rotation !== 0) parts.push(`rotate(${entry.rotation}deg)`);
  if (entry.mirrorH) parts.push('scaleX(-1)');
  if (entry.mirrorV) parts.push('scaleY(-1)');
  return parts.join(' ');
}

export default function RotatePdf() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pdfFile) return;
    let cancelled = false;

    (async () => {
      const data = new Uint8Array(await pdfFile.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
      const count = pdf.numPages;

      const newPages: PageEntry[] = Array.from({ length: count }, (_, i) => ({
        id: String(i),
        index: i,
        rotation: 0,
        mirrorH: false,
        mirrorV: false,
      }));

      const thumbs: string[] = [];
      for (let i = 0; i < count; i++) {
        const page = await pdf.getPage(i + 1);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        page.cleanup();
        thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
      }

      if (!cancelled) {
        setPages(newPages);
        setThumbnails(thumbs);
        setSelected(new Set());
        setStatus('idle');
        setError('');
      }
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to read PDF');
    });

    return () => { cancelled = true; };
  }, [pdfFile]);

  const updatePages = (ids: string[], updater: (e: PageEntry) => PageEntry) => {
    setPages(prev => prev.map(e => ids.includes(e.id) ? updater(e) : e));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedIds = [...selected];
  const bulkActive = selectedIds.length > 0;

  const handleDownload = async () => {
    if (!pdfFile) return;
    setStatus('processing');
    setError('');
    try {
      const doc = await PDFDocument.load(await pdfFile.arrayBuffer());
      for (const entry of pages) {
        if (entry.rotation === 0 && !entry.mirrorH && !entry.mirrorV) continue;
        const page = doc.getPage(entry.index);
        if (entry.rotation !== 0) {
          page.setRotation(degrees(entry.rotation));
        }
        if (entry.mirrorH) {
          const { width } = page.getSize();
          page.translateContent(width, 0);
          page.scaleContent(-1, 1);
        }
        if (entry.mirrorV) {
          const { height } = page.getSize();
          page.translateContent(0, height);
          page.scaleContent(1, -1);
        }
      }
      const bytes = await doc.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFile.name.replace(/\.pdf$/i, '') + '-rotated.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Rotate & Mirror PDF</h2>
      <FileDropZone
        onFiles={(files) => setPdfFile(files[0])}
        label="Drop a PDF file here or click to select"
        validate={(f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')}
        accept="application/pdf,.pdf"
        rejectionMessage="Only PDF files are accepted."
      />
      {error && !pages.length && (
        <p style={{ color: '#dc2626', marginTop: '0.5rem' }}>{error}</p>
      )}
      {pages.length > 0 && (
        <>
          {bulkActive && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.75rem 0', padding: '0.5rem 0.75rem', background: '#f0f4ff', borderRadius: 6, border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#4338ca', fontWeight: 500 }}>
                {selectedIds.length} selected
              </span>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, rotation: accumulateRotation(e.rotation, -90) }))}>↺ CCW</button>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, rotation: accumulateRotation(e.rotation, 90) }))}>↻ CW</button>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, mirrorH: !e.mirrorH }))}>⇔ Flip H</button>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, mirrorV: !e.mirrorV }))}>⇕ Flip V</button>
              <button
                style={{ ...btnStyle, marginLeft: 'auto', color: '#6b7280' }}
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {pages.map((entry, i) => {
              const transform = pageImgTransform(entry);
              return (
                <div
                  key={entry.id}
                  style={{
                    position: 'relative',
                    width: 140,
                    border: `2px solid ${selected.has(entry.id) ? '#6366f1' : '#ddd'}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    style={{ position: 'absolute', top: 6, left: 6, zIndex: 1 }}
                  />
                  <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', overflow: 'hidden' }}>
                    {thumbnails[i] && (
                      <img
                        src={thumbnails[i]}
                        alt={`Page ${i + 1}`}
                        draggable={false}
                        style={{ maxWidth: '100%', maxHeight: '100%', transform: transform || undefined }}
                      />
                    )}
                  </div>
                  <div style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid #eee' }}>
                    <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.3rem', textAlign: 'center' }}>
                      Page {i + 1}
                    </div>
                    <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                      <button style={btnStyle} title="Rotate CCW" onClick={() => updatePages([entry.id], e => ({ ...e, rotation: accumulateRotation(e.rotation, -90) }))}>↺</button>
                      <button style={btnStyle} title="Rotate CW" onClick={() => updatePages([entry.id], e => ({ ...e, rotation: accumulateRotation(e.rotation, 90) }))}>↻</button>
                      <button
                        style={{ ...btnStyle, ...(entry.mirrorH ? { background: '#e0e7ff', borderColor: '#6366f1' } : {}) }}
                        title="Flip H"
                        onClick={() => updatePages([entry.id], e => ({ ...e, mirrorH: !e.mirrorH }))}
                      >
                        ⇔
                      </button>
                      <button
                        style={{ ...btnStyle, ...(entry.mirrorV ? { background: '#e0e7ff', borderColor: '#6366f1' } : {}) }}
                        title="Flip V"
                        onClick={() => updatePages([entry.id], e => ({ ...e, mirrorV: !e.mirrorV }))}
                      >
                        ⇕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={handleDownload}
            disabled={status === 'processing'}
            style={{
              padding: '0.6rem 1.5rem',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: status === 'processing' ? 'not-allowed' : 'pointer',
              opacity: status === 'processing' ? 0.5 : 1,
              fontSize: '1rem',
            }}
          >
            {status === 'processing' ? 'Processing…' : 'Apply & Download'}
          </button>
          {status === 'done' && <p style={{ color: '#16a34a', marginTop: '1rem' }}>Done! Check your downloads.</p>}
          {status === 'error' && <p style={{ color: '#dc2626', marginTop: '1rem' }}>Error: {error}</p>}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
npm run type-check:client
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/pages/RotatePdf.tsx
git commit -m "feat: add Rotate & Mirror PDF page"
```

---

### Task 4: Wire up the Rotate PDF tab in App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add import and tab type**

Add the import after the existing page imports in `src/App.tsx`:

```ts
import RotatePdf from './pages/RotatePdf';
```

Change the `Tab` type from:

```ts
type Tab = 'home' | 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress';
```

To:

```ts
type Tab = 'home' | 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress' | 'rotate';
```

- [ ] **Step 2: Add the tab button**

In the `<div role="tablist">`, add the Rotate PDF button after the Compress PDF button:

```tsx
        <button
          role="tab"
          id="tab-rotate"
          aria-selected={tab === 'rotate'}
          aria-controls="panel-rotate"
          style={tabStyle(tab === 'rotate')}
          onClick={() => setTab('rotate')}
        >
          Rotate PDF
        </button>
```

- [ ] **Step 3: Add the tab panel**

After the Compress PDF `<div role="tabpanel">` block, add:

```tsx
      <div
        role="tabpanel"
        id="panel-rotate"
        aria-labelledby="tab-rotate"
        hidden={tab !== 'rotate'}
      >
        <RotatePdf />
      </div>
```

- [ ] **Step 4: Type-check**

```
npm run type-check:client
```

Expected: no errors

- [ ] **Step 5: Run all tests**

```
npm test
```

Expected: all tests pass (rotateUtils tests + existing tests unchanged)

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Rotate PDF tab to app navigation"
```
