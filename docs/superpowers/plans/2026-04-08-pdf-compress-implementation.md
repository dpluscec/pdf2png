# PDF Compress Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Compress PDF" tab that lets users upload multiple PDFs, choose a compression level, and download each compressed file individually or all together as a zip.

**Architecture:** Server-only feature using the `compress-pdf` npm package (Ghostscript wrapper). The lib function `compressPdf` accepts a Buffer + level, writes a temp file, calls compress-pdf, returns a compressed Buffer, and cleans up. The route accepts a single file per request; the client assembles the zip when compressing multiple files, identical to the PDF→PNG flow.

**Tech Stack:** React + TypeScript (UI), Express + multer (route), compress-pdf + Ghostscript (compression), pdf-lib (test fixtures), JSZip (client-side multi-file zip), dnd-kit (drag-to-reorder), Vitest (tests)

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `server/lib/compressPdf.ts` | Create | Pure compression logic — Buffer in, Buffer out |
| `server/routes/compress.ts` | Create | POST /api/compress?level= |
| `server/index.ts` | Modify | Register compress route |
| `src/pages/CompressPdf.tsx` | Create | Compress PDF tab UI |
| `src/App.tsx` | Modify | Add "Compress PDF" tab |
| `tests/compressPdf.test.ts` | Create | Unit tests for compressPdf lib |

---

## Task 1: Install compress-pdf

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install the package**

```bash
npm install compress-pdf
```

Expected output: package added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify Ghostscript is available**

```bash
gs --version
```

Expected: a version number (e.g. `10.03.1`). If `gs` is not found, install Ghostscript from https://ghostscript.com/releases/gsdnld.html — this is a required system dependency.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install compress-pdf dependency"
```

---

## Task 2: Implement `server/lib/compressPdf.ts` (TDD)

**Files:**
- Create: `tests/compressPdf.test.ts`
- Create: `server/lib/compressPdf.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/compressPdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { compressPdf } from '../server/lib/compressPdf';

async function makePdf(pageCount = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]);
  }
  return Buffer.from(await doc.save());
}

describe('compressPdf', () => {
  it('returns a valid PDF buffer for balanced level', async () => {
    const input = await makePdf(1);
    const result = await compressPdf(input, 'balanced');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    // Verify output is a valid PDF
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  }, 30000);

  it('returns a valid PDF buffer for maximum level', async () => {
    const input = await makePdf(1);
    const result = await compressPdf(input, 'maximum');
    expect(result).toBeInstanceOf(Buffer);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  }, 30000);

  it('returns a valid PDF buffer for quality level', async () => {
    const input = await makePdf(1);
    const result = await compressPdf(input, 'quality');
    expect(result).toBeInstanceOf(Buffer);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  }, 30000);

  it('throws on invalid level', async () => {
    const input = await makePdf(1);
    await expect(
      compressPdf(input, 'invalid' as 'balanced')
    ).rejects.toThrow('Invalid compression level');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- compressPdf
```

Expected: FAIL — `compressPdf` not found.

- [ ] **Step 3: Implement `server/lib/compressPdf.ts`**

Create `server/lib/compressPdf.ts`:

```ts
import compressPDFPackage from 'compress-pdf';
import { tmpdir } from 'os';
import { writeFile, readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';

export type CompressionLevel = 'maximum' | 'balanced' | 'quality';

const RESOLUTION: Record<CompressionLevel, number> = {
  maximum: 72,
  balanced: 150,
  quality: 300,
};

export async function compressPdf(
  inputBuffer: Buffer,
  level: CompressionLevel
): Promise<Buffer> {
  if (!(level in RESOLUTION)) {
    throw new Error(`Invalid compression level: ${level}`);
  }

  const id = randomUUID();
  const inputPath = `${tmpdir()}/${id}-input.pdf`;

  await writeFile(inputPath, inputBuffer);

  try {
    const result = await compressPDFPackage(inputPath, {
      resolution: RESOLUTION[level],
    });
    return result;
  } finally {
    await unlink(inputPath).catch(() => undefined);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- compressPdf
```

Expected: all 4 tests PASS. (These tests call real Ghostscript — they will be slow, ~5–10s each, which is expected.)

- [ ] **Step 5: Commit**

```bash
git add server/lib/compressPdf.ts tests/compressPdf.test.ts
git commit -m "feat: add compressPdf lib with Ghostscript compression"
```

---

## Task 3: Add compress route

**Files:**
- Create: `server/routes/compress.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Create `server/routes/compress.ts`**

```ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { compressPdf, CompressionLevel } from '../lib/compressPdf.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const VALID_LEVELS = new Set<CompressionLevel>(['maximum', 'balanced', 'quality']);

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
    res.status(400).json({ error: 'Only PDF files are accepted' });
    return;
  }

  const rawLevel = (req.query['level'] as string) ?? 'balanced';
  if (!VALID_LEVELS.has(rawLevel as CompressionLevel)) {
    res.status(400).json({ error: `Invalid level. Must be one of: ${[...VALID_LEVELS].join(', ')}` });
    return;
  }
  const level = rawLevel as CompressionLevel;

  let compressed: Buffer;
  try {
    compressed = await compressPdf(req.file.buffer, level);
  } catch (err) {
    console.error('PDF compression error:', err);
    res.status(500).json({ error: 'Compression failed' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="compressed.pdf"');
  res.send(compressed);
});

export default router;
```

- [ ] **Step 2: Register route in `server/index.ts`**

Open `server/index.ts` and add the compress router. The file currently reads:

```ts
import express from 'express';
import convertRouter from './routes/convert.js';
import mergeRouter from './routes/merge.js';
import pngToPdfRouter from './routes/pngToPdf.js';

const app = express();
const PORT = 3001;

app.use('/api/convert', convertRouter);
app.use('/api/merge', mergeRouter);
app.use('/api/png-to-pdf', pngToPdfRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

Replace with:

```ts
import express from 'express';
import convertRouter from './routes/convert.js';
import mergeRouter from './routes/merge.js';
import pngToPdfRouter from './routes/pngToPdf.js';
import compressRouter from './routes/compress.js';

const app = express();
const PORT = 3001;

app.use('/api/convert', convertRouter);
app.use('/api/merge', mergeRouter);
app.use('/api/png-to-pdf', pngToPdfRouter);
app.use('/api/compress', compressRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run type-check:server
```

Expected: no errors.

- [ ] **Step 4: Smoke-test the route manually**

Start the server:
```bash
npm run dev:server
```

In a second terminal (replace `sample.pdf` with any PDF file on your machine):
```bash
curl -X POST "http://localhost:3001/api/compress?level=balanced" \
  -F "file=@sample.pdf" \
  --output compressed.pdf
ls -lh sample.pdf compressed.pdf
```

Expected: `compressed.pdf` exists and is a valid PDF (open it to verify). Size may or may not be smaller depending on the input PDF's existing compression state.

- [ ] **Step 5: Commit**

```bash
git add server/routes/compress.ts server/index.ts
git commit -m "feat: add POST /api/compress route"
```

---

## Task 4: Build `src/pages/CompressPdf.tsx`

**Files:**
- Create: `src/pages/CompressPdf.tsx`

This page mirrors `PdfToPng.tsx`. It reuses `FileDropZone` and `PdfFileCard` unchanged, and follows the same `PdfEntry` / `groupStatus` patterns.

- [ ] **Step 1: Create `src/pages/CompressPdf.tsx`**

```tsx
import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import FileDropZone from '../components/FileDropZone';
import PdfFileCard from '../components/PdfFileCard';
import type { PdfEntry } from './PdfToPng';

type CompressionLevel = 'maximum' | 'balanced' | 'quality';
type GroupStatus = 'idle' | 'processing' | 'done' | 'error';

const LEVEL_LABELS: Record<CompressionLevel, string> = {
  maximum: 'Maximum',
  balanced: 'Balanced',
  quality: 'High Quality',
};

const LEVEL_DESCRIPTIONS: Record<CompressionLevel, string> = {
  maximum: 'Smallest file, lower quality',
  balanced: 'Good compression, good quality',
  quality: 'Minimal quality loss, less compression',
};

function stemName(file: File): string {
  return file.name.replace(/\.pdf$/i, '');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

async function compressServer(file: File, level: CompressionLevel): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`/api/compress?level=${level}`, { method: 'POST', body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Compression failed');
  }
  return response.blob();
}

export default function CompressPdf() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [level, setLevel] = useState<CompressionLevel>('balanced');
  const [showPreview, setShowPreview] = useState(true);
  const [groupStatus, setGroupStatus] = useState<GroupStatus>('idle');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFiles = (files: File[]) => {
    const newEntries: PdfEntry[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      pageCount: null,
      thumbnail: null,
      status: 'idle',
      error: '',
    }));
    setEntries((prev) => [...prev, ...newEntries]);
    setGroupStatus('idle');
  };

  const handleMetadata = useCallback((id: string, pageCount: number, thumbnail: string | null) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, pageCount, thumbnail } : e))
    );
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEntries((prev) => {
        const oldIndex = prev.findIndex((e) => e.id === active.id);
        const newIndex = prev.findIndex((e) => e.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleTogglePreview = () => {
    const next = !showPreview;
    setShowPreview(next);
    if (!next) {
      setEntries((prev) => prev.map((e) => ({ ...e, thumbnail: null })));
    }
  };

  const compressEntry = async (entry: PdfEntry): Promise<Blob | null> => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, status: 'processing', error: '' } : e))
    );
    try {
      const blob = await compressServer(entry.file, level);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: 'done' } : e))
      );
      return blob;
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
            : e
        )
      );
      return null;
    }
  };

  const handleCompressOne = useCallback(async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const blob = await compressEntry(entry);
    if (blob) triggerDownload(blob, `${stemName(entry.file)}-compressed.pdf`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, level]);

  const handleCompressAll = useCallback(async () => {
    const idleEntries = entries.filter((e) => e.status === 'idle');
    if (idleEntries.length === 0) {
      setGroupStatus('idle');
      return;
    }

    setGroupStatus('processing');
    const results: Array<{ blob: Blob; name: string }> = [];

    for (const entry of idleEntries) {
      const blob = await compressEntry(entry);
      if (blob) results.push({ blob, name: `${stemName(entry.file)}-compressed.pdf` });
    }

    if (results.length === 0) {
      setGroupStatus('error');
      return;
    }

    if (results.length === 1) {
      triggerDownload(results[0].blob, results[0].name);
    } else {
      const zip = new JSZip();
      for (const { blob, name } of results) {
        zip.file(name, blob);
      }
      triggerDownload(await zip.generateAsync({ type: 'blob' }), 'compressed.zip');
    }

    setGroupStatus('done');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, level]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Compress PDF</h2>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          padding: '0.75rem',
          background: '#f9fafb',
          borderRadius: 8,
          border: '1px solid #f3f4f6',
        }}
      >
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', gap: '1rem' }}>
          {(Object.keys(LEVEL_LABELS) as CompressionLevel[]).map((l) => (
            <label
              key={l}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.875rem' }}
              title={LEVEL_DESCRIPTIONS[l]}
            >
              <input
                type="radio"
                name="compress-level"
                value={l}
                checked={level === l}
                onChange={() => setLevel(l)}
              />
              {LEVEL_LABELS[l]}
            </label>
          ))}
        </fieldset>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.875rem' }}>
          <input type="checkbox" checked={showPreview} onChange={handleTogglePreview} />
          Preview
        </label>

        <button
          onClick={handleCompressAll}
          disabled={entries.length === 0 || groupStatus === 'processing'}
          style={{
            marginLeft: 'auto',
            padding: '0.45rem 1.1rem',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: entries.length === 0 || groupStatus === 'processing' ? 'not-allowed' : 'pointer',
            opacity: entries.length === 0 || groupStatus === 'processing' ? 0.5 : 1,
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {groupStatus === 'processing' ? 'Compressing…' : 'Compress All'}
        </button>
      </div>

      {/* Drop zone */}
      <FileDropZone multiple onFiles={handleFiles} />

      {/* Card grid */}
      {entries.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={entries.map((e) => e.id)} strategy={rectSortingStrategy}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              {entries.map((entry) => (
                <PdfFileCard
                  key={entry.id}
                  entry={entry}
                  showPreview={showPreview}
                  onConvert={() => handleCompressOne(entry.id)}
                  onRemove={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                  onMetadata={handleMetadata}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {groupStatus === 'done' && (
        <p style={{ color: '#16a34a', marginTop: '1rem' }}>All done! Check your downloads.</p>
      )}
      {groupStatus === 'error' && (
        <p style={{ color: '#dc2626', marginTop: '1rem' }}>All compressions failed. Check individual file errors above.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run type-check:client
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/CompressPdf.tsx
git commit -m "feat: add CompressPdf page component"
```

---

## Task 5: Wire up the tab in `src/App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add the Compress PDF tab to `src/App.tsx`**

The current `App.tsx` has three tabs. Add a fourth. Replace the file contents with:

```tsx
import { useState } from 'react';
import PdfToPng from './pages/PdfToPng';
import MergePdf from './pages/MergePdf';
import PngToPdf from './pages/PngToPdf';
import CompressPdf from './pages/CompressPdf';

type Tab = 'convert' | 'merge' | 'png-to-pdf' | 'compress';

const tabStyle = (active: boolean): React.CSSProperties => ({
  padding: '0.5rem 1.25rem',
  border: 'none',
  borderBottom: active ? '2px solid #0070f3' : '2px solid transparent',
  background: 'none',
  cursor: 'pointer',
  fontWeight: active ? 600 : 400,
  fontSize: '1rem',
  color: active ? '#0070f3' : '#555',
});

export default function App() {
  const [tab, setTab] = useState<Tab>('convert');

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ marginBottom: '1.5rem' }}>PDF Manager</h1>
      <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '2rem' }}>
        <button
          role="tab"
          id="tab-convert"
          aria-selected={tab === 'convert'}
          aria-controls="panel-convert"
          style={tabStyle(tab === 'convert')}
          onClick={() => setTab('convert')}
        >
          PDF → PNG
        </button>
        <button
          role="tab"
          id="tab-merge"
          aria-selected={tab === 'merge'}
          aria-controls="panel-merge"
          style={tabStyle(tab === 'merge')}
          onClick={() => setTab('merge')}
        >
          Merge PDFs
        </button>
        <button
          role="tab"
          id="tab-png-to-pdf"
          aria-selected={tab === 'png-to-pdf'}
          aria-controls="panel-png-to-pdf"
          style={tabStyle(tab === 'png-to-pdf')}
          onClick={() => setTab('png-to-pdf')}
        >
          PNG → PDF
        </button>
        <button
          role="tab"
          id="tab-compress"
          aria-selected={tab === 'compress'}
          aria-controls="panel-compress"
          style={tabStyle(tab === 'compress')}
          onClick={() => setTab('compress')}
        >
          Compress PDF
        </button>
      </div>
      <div role="tabpanel" id="panel-convert" aria-labelledby="tab-convert" hidden={tab !== 'convert'}>
        <PdfToPng />
      </div>
      <div role="tabpanel" id="panel-merge" aria-labelledby="tab-merge" hidden={tab !== 'merge'}>
        <MergePdf />
      </div>
      <div role="tabpanel" id="panel-png-to-pdf" aria-labelledby="tab-png-to-pdf" hidden={tab !== 'png-to-pdf'}>
        <PngToPdf />
      </div>
      <div role="tabpanel" id="panel-compress" aria-labelledby="tab-compress" hidden={tab !== 'compress'}>
        <CompressPdf />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run full type-check**

```bash
npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Start the app and manually verify**

```bash
npm run dev
```

Open http://localhost:5173, click "Compress PDF" tab. Upload a PDF, select a compression level, click "Compress" on a card — expect a `<filename>-compressed.pdf` download. Upload two PDFs, click "Compress All" — expect a `compressed.zip` containing both compressed PDFs.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Compress PDF tab to App"
```

---

## Self-Review

**Spec coverage:**
- ✅ Three compression levels (Maximum/Balanced/High Quality → 72/150/300 dpi)
- ✅ Multiple file upload with simultaneous compression
- ✅ Per-card individual download as `<name>-compressed.pdf`
- ✅ "Compress All": single file → `.pdf`, multiple → `.zip`
- ✅ Mirrors PDF→PNG card grid UI with dnd-kit reorder
- ✅ Server-only (no browser mode toggle)
- ✅ compress-pdf package with Ghostscript

**Placeholder scan:** none found.

**Type consistency:**
- `CompressionLevel` type defined in both `server/lib/compressPdf.ts` (exported) and `src/pages/CompressPdf.tsx` (local) — these are independent and consistent.
- `PdfEntry` imported from `PdfToPng` in `CompressPdf.tsx` — matches exactly.
- `compressPdf(inputBuffer: Buffer, level: CompressionLevel): Promise<Buffer>` — used consistently across lib, route, and tests.
- `compressEntry` returns `Blob | null`, used correctly in both `handleCompressOne` and `handleCompressAll`.
