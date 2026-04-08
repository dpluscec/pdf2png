# PNG/JPEG → PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "PNG → PDF" tab that lets users upload PNG/JPEG images, reorder them via drag-and-drop preview cards, select a page size, and download a single PDF — in both browser and server modes.

**Architecture:** Server-side conversion uses a pure `imagesToPdf` lib function (pdf-lib) exposed via a new `POST /api/png-to-pdf` route. Browser-side conversion calls pdf-lib directly in the client bundle. `FileDropZone` gains configurable `validate`/`accept`/`rejectionMessage` props so it can be reused for images. A new `PngToPdf.tsx` page handles the full UI.

**Tech Stack:** pdf-lib (already installed), dnd-kit (already installed), React + Vite (frontend), Express + multer (backend), Vitest + canvas (tests).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `server/lib/pngToPdf.ts` | Create | Pure image-to-PDF conversion (shared logic for server mode) |
| `tests/pngToPdf.test.ts` | Create | Unit tests for `imagesToPdf` |
| `server/routes/pngToPdf.ts` | Create | `POST /api/png-to-pdf` endpoint |
| `server/index.ts` | Modify | Register the new route |
| `src/components/FileDropZone.tsx` | Modify | Add `validate`, `accept`, `rejectionMessage` props |
| `src/pages/PngToPdf.tsx` | Create | Full page UI: drop zone, card grid, controls, conversion |
| `src/App.tsx` | Modify | Add "PNG → PDF" as a third tab |

---

## Task 1: Server lib — `server/lib/pngToPdf.ts` (TDD)

**Files:**
- Create: `tests/pngToPdf.test.ts`
- Create: `server/lib/pngToPdf.ts`

---

- [ ] **Step 1: Write the failing tests**

Create `tests/pngToPdf.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from 'canvas';
import { imagesToPdf } from '../server/lib/pngToPdf';
import type { ImageInput, PageSize } from '../server/lib/pngToPdf';

function makePng(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

function makeJpeg(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/jpeg');
}

describe('imagesToPdf', () => {
  it('single PNG produces a one-page PDF', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'original'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('single JPEG produces a one-page PDF', async () => {
    const result = await imagesToPdf(
      [{ buffer: makeJpeg(100, 100), mimetype: 'image/jpeg' }],
      'original'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('multiple images produce correct page count in order', async () => {
    const images: ImageInput[] = [
      { buffer: makePng(100, 100), mimetype: 'image/png' },
      { buffer: makeJpeg(100, 100), mimetype: 'image/jpeg' },
      { buffer: makePng(100, 100), mimetype: 'image/png' },
    ];
    const result = await imagesToPdf(images, 'original');
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(3);
  });

  it('original page size uses image pixel dimensions as points', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(200, 150), mimetype: 'image/png' }],
      'original'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 200, height: 150 });
  });

  it('a4 page size produces 595×842 pt pages', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'a4'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 595, height: 842 });
  });

  it('letter page size produces 612×792 pt pages', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'letter'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
  });

  it('a3 page size produces 842×1191 pt pages', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'a3'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 842, height: 1191 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/pngToPdf.test.ts
```

Expected: FAIL — `Cannot find module '../server/lib/pngToPdf'`

- [ ] **Step 3: Implement `server/lib/pngToPdf.ts`**

Create `server/lib/pngToPdf.ts`:

```typescript
import { PDFDocument } from 'pdf-lib';

export type PageSize = 'original' | 'a4' | 'letter' | 'a3';

export interface ImageInput {
  buffer: Buffer;
  mimetype: 'image/png' | 'image/jpeg';
}

const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'original'>, [number, number]> = {
  a4: [595, 842],
  letter: [612, 792],
  a3: [842, 1191],
};

function fitRect(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(pageW / imgW, pageH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height };
}

export async function imagesToPdf(images: ImageInput[], pageSize: PageSize): Promise<Buffer> {
  const doc = await PDFDocument.create();

  for (const { buffer, mimetype } of images) {
    const pdfImage =
      mimetype === 'image/png'
        ? await doc.embedPng(buffer)
        : await doc.embedJpg(buffer);

    let pageW: number;
    let pageH: number;

    if (pageSize === 'original') {
      pageW = pdfImage.width;
      pageH = pdfImage.height;
    } else {
      [pageW, pageH] = PAGE_DIMENSIONS[pageSize];
    }

    const page = doc.addPage([pageW, pageH]);

    if (pageSize === 'original') {
      page.drawImage(pdfImage, { x: 0, y: 0, width: pageW, height: pageH });
    } else {
      page.drawImage(pdfImage, fitRect(pdfImage.width, pdfImage.height, pageW, pageH));
    }
  }

  return Buffer.from(await doc.save());
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/pngToPdf.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/pngToPdf.ts tests/pngToPdf.test.ts
git commit -m "feat: add imagesToPdf server lib with tests"
```

---

## Task 2: Server route — `server/routes/pngToPdf.ts`

**Files:**
- Create: `server/routes/pngToPdf.ts`
- Modify: `server/index.ts`

---

- [ ] **Step 1: Create the route**

Create `server/routes/pngToPdf.ts`:

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { imagesToPdf, PageSize, ImageInput } from '../lib/pngToPdf.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const VALID_PAGE_SIZES = new Set<string>(['original', 'a4', 'letter', 'a3']);
const VALID_MIMETYPES = new Set(['image/png', 'image/jpeg']);

router.post('/', upload.array('files'), async (req: Request, res: Response): Promise<void> => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const invalidFile = files.find((f) => !VALID_MIMETYPES.has(f.mimetype));
  if (invalidFile) {
    res.status(400).json({
      error: `Only PNG and JPEG files are accepted: "${invalidFile.originalname}" is not valid`,
    });
    return;
  }

  const pageSizeParam = ((req.query['pageSize'] as string) ?? 'original').toLowerCase();
  if (!VALID_PAGE_SIZES.has(pageSizeParam)) {
    res.status(400).json({ error: 'Invalid pageSize. Must be one of: original, a4, letter, a3' });
    return;
  }

  try {
    const images: ImageInput[] = files.map((f) => ({
      buffer: f.buffer,
      mimetype: f.mimetype as 'image/png' | 'image/jpeg',
    }));
    const pdf = await imagesToPdf(images, pageSizeParam as PageSize);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error('PNG to PDF error:', err);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

export default router;
```

- [ ] **Step 2: Register the route in `server/index.ts`**

Open `server/index.ts`. It currently reads:

```typescript
import express from 'express';
import convertRouter from './routes/convert.js';
import mergeRouter from './routes/merge.js';

const app = express();
const PORT = 3001;

app.use('/api/convert', convertRouter);
app.use('/api/merge', mergeRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

Replace with:

```typescript
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

- [ ] **Step 3: Type-check the server**

```bash
npm run type-check:server
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add server/routes/pngToPdf.ts server/index.ts
git commit -m "feat: add POST /api/png-to-pdf route"
```

---

## Task 3: Update `FileDropZone` to support image file types

**Files:**
- Modify: `src/components/FileDropZone.tsx`

The current component hardcodes PDF validation. Add three optional props — `validate`, `accept`, `rejectionMessage` — with backwards-compatible defaults so existing usages in `PdfToPng.tsx` and `MergePdf.tsx` require no changes.

---

- [ ] **Step 1: Replace `src/components/FileDropZone.tsx`**

```typescript
import { useRef, useState, DragEvent, ChangeEvent } from 'react';

function isPdf(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

interface Props {
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
  validate?: (file: File) => boolean;
  accept?: string;
  rejectionMessage?: string;
}

export default function FileDropZone({
  multiple = false,
  onFiles,
  label,
  validate = isPdf,
  accept = 'application/pdf,.pdf',
  rejectionMessage = 'No valid files found in the dropped items.',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState('');

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const all = Array.from(e.dataTransfer.files);
    const valid = all.filter(validate);
    if (valid.length === 0) {
      setRejection(rejectionMessage);
      return;
    }
    setRejection('');
    onFiles(valid);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={label ?? 'Drop PDF file here or click to select'}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDragging(false);
          }
        }}
        onClick={() => { setRejection(''); inputRef.current?.click(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        style={{
          border: `2px dashed ${dragging ? '#0070f3' : '#aaa'}`,
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
          cursor: 'pointer',
          color: dragging ? '#0070f3' : '#666',
          marginBottom: rejection ? '0.25rem' : '1rem',
          userSelect: 'none',
          transition: 'border-color 0.15s, color 0.15s',
          background: dragging ? '#f0f7ff' : 'transparent',
        }}
      >
        {label ?? 'Drop PDF file here or click to select'}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleChange}
          style={{ display: 'none' }}
        />
      </div>
      {rejection && (
        <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: '0 0 1rem' }} role="alert">
          {rejection}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check the client**

```bash
npm run type-check:client
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/FileDropZone.tsx
git commit -m "feat: make FileDropZone configurable for any file type"
```

---

## Task 4: Write `src/pages/PngToPdf.tsx`

**Files:**
- Create: `src/pages/PngToPdf.tsx`

---

- [ ] **Step 1: Create `src/pages/PngToPdf.tsx`**

```typescript
import { useState, useEffect, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
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
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FileDropZone from '../components/FileDropZone';

type PageSize = 'original' | 'a4' | 'letter' | 'a3';
type Mode = 'browser' | 'server';
type Status = 'idle' | 'processing' | 'done' | 'error';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'original'>, [number, number]> = {
  a4: [595, 842],
  letter: [612, 792],
  a3: [842, 1191],
};

const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  original: 'Original (image dimensions)',
  a4: 'A4 (595 × 842 pt)',
  letter: 'Letter (612 × 792 pt)',
  a3: 'A3 (842 × 1191 pt)',
};

function isImage(file: File): boolean {
  return (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.name.toLowerCase().endsWith('.png') ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg')
  );
}

function isJpeg(file: File): boolean {
  return (
    file.type === 'image/jpeg' ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg')
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function outputFilename(items: ImageItem[]): string {
  if (items.length === 1) {
    return items[0].file.name.replace(/\.[^.]+$/, '') + '.pdf';
  }
  return 'images.pdf';
}

async function convertBrowser(items: ImageItem[], pageSize: PageSize): Promise<void> {
  const doc = await PDFDocument.create();

  for (const item of items) {
    const buffer = await item.file.arrayBuffer();
    const pdfImage = isJpeg(item.file)
      ? await doc.embedJpg(buffer)
      : await doc.embedPng(buffer);

    let pageW: number;
    let pageH: number;

    if (pageSize === 'original') {
      pageW = pdfImage.width;
      pageH = pdfImage.height;
    } else {
      [pageW, pageH] = PAGE_DIMENSIONS[pageSize];
    }

    const page = doc.addPage([pageW, pageH]);

    if (pageSize === 'original') {
      page.drawImage(pdfImage, { x: 0, y: 0, width: pageW, height: pageH });
    } else {
      const scale = Math.min(pageW / pdfImage.width, pageH / pdfImage.height);
      const width = pdfImage.width * scale;
      const height = pdfImage.height * scale;
      const x = (pageW - width) / 2;
      const y = (pageH - height) / 2;
      page.drawImage(pdfImage, { x, y, width, height });
    }
  }

  const bytes = await doc.save();
  triggerDownload(new Blob([bytes], { type: 'application/pdf' }), outputFilename(items));
}

async function convertServer(items: ImageItem[], pageSize: PageSize): Promise<void> {
  const formData = new FormData();
  items.forEach((item) => formData.append('files', item.file));
  const response = await fetch(`/api/png-to-pdf?pageSize=${pageSize}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Server conversion failed');
  }
  const blob = await response.blob();
  triggerDownload(blob, outputFilename(items));
}

function SortableImageCard({
  item,
  cardSize,
  onRemove,
}: {
  item: ImageItem;
  cardSize: number;
  onRemove: () => void;
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
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#999',
            fontSize: '1rem',
            flexShrink: 0,
            lineHeight: 1,
            padding: 0,
          }}
          aria-label={`Remove ${item.file.name}`}
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function PngToPdf() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [cardSize, setCardSize] = useState(150);
  const [pageSize, setPageSize] = useState<PageSize>('original');
  const [mode, setMode] = useState<Mode>('browser');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFiles = (files: File[]) => {
    const newItems: ImageItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...newItems]);
    setStatus('idle');
    setError('');
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleConvert = async () => {
    if (items.length === 0) return;
    setStatus('processing');
    setError('');
    try {
      if (mode === 'browser') {
        await convertBrowser(items, pageSize);
      } else {
        await convertServer(items, pageSize);
      }
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>PNG / JPEG → PDF</h2>

      <FileDropZone
        multiple
        onFiles={handleFiles}
        label="Drop PNG or JPEG files here or click to select"
        validate={isImage}
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        rejectionMessage="No PNG or JPEG files found in the dropped items."
      />

      {items.length > 0 && (
        <>
          {/* Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Card size:
              <input
                type="range"
                min={100}
                max={300}
                value={cardSize}
                onChange={(e) => setCardSize(Number(e.target.value))}
                style={{ width: 100 }}
              />
              <span style={{ fontSize: '0.85rem', color: '#666', width: 36 }}>{cardSize}px</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Page size:
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as PageSize)}
                style={{ padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4 }}
              >
                {(Object.entries(PAGE_SIZE_LABELS) as [PageSize, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Processing mode</legend>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {(['browser', 'server'] as Mode[]).map((m) => (
                  <label
                    key={m}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="png-to-pdf-mode"
                      value={m}
                      checked={mode === m}
                      onChange={() => setMode(m)}
                    />
                    {m === 'browser' ? 'Browser (no upload)' : 'Server'}
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {/* Card grid */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                }}
              >
                {items.map((item) => (
                  <SortableImageCard
                    key={item.id}
                    item={item}
                    cardSize={cardSize}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Convert button */}
          <button
            onClick={handleConvert}
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
            {status === 'processing' ? 'Converting…' : 'Convert & Download'}
          </button>
        </>
      )}

      {status === 'done' && (
        <p style={{ color: 'green', marginTop: '1rem' }}>Done! Check your downloads.</p>
      )}
      {status === 'error' && (
        <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check the client**

```bash
npm run type-check:client
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PngToPdf.tsx
git commit -m "feat: add PngToPdf page component"
```

---

## Task 5: Add "PNG → PDF" tab in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

---

- [ ] **Step 1: Update `src/App.tsx`**

Replace the full content of `src/App.tsx` with:

```typescript
import { useState } from 'react';
import PdfToPng from './pages/PdfToPng';
import MergePdf from './pages/MergePdf';
import PngToPdf from './pages/PngToPdf';

type Tab = 'convert' | 'merge' | 'png-to-pdf';

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
      </div>
      <div
        role="tabpanel"
        id="panel-convert"
        aria-labelledby="tab-convert"
        hidden={tab !== 'convert'}
      >
        <PdfToPng />
      </div>
      <div
        role="tabpanel"
        id="panel-merge"
        aria-labelledby="tab-merge"
        hidden={tab !== 'merge'}
      >
        <MergePdf />
      </div>
      <div
        role="tabpanel"
        id="panel-png-to-pdf"
        aria-labelledby="tab-png-to-pdf"
        hidden={tab !== 'png-to-pdf'}
      >
        <PngToPdf />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run all type checks and tests**

```bash
npm run type-check && npm run test
```

Expected: No type errors. All tests pass (including the 7 new `pngToPdf` tests).

- [ ] **Step 3: Smoke test in the browser**

```bash
npm run dev
```

Open `http://localhost:5173`. Verify:
- Three tabs visible: "PDF → PNG", "Merge PDFs", "PNG → PDF"
- PNG → PDF tab: drop zone accepts PNG/JPEG, rejects other formats
- Cards appear with image previews; card size slider resizes them
- Drag-and-drop reordering works
- Page size dropdown shows all four options
- Browser mode: "Convert & Download" produces a downloadable PDF without a network request
- Server mode: "Convert & Download" posts to `/api/png-to-pdf` and produces a downloadable PDF
- Remove button (✕) on each card removes the image

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add PNG to PDF tab to App"
```
