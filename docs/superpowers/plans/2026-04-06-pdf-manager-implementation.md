# PDF Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app with two features: PDF→PNG (per-page, zip download, browser or server processing) and PDF merge (drag-to-reorder, single PDF download).

**Architecture:** React (Vite) frontend at `src/`, Express backend at `server/`, both started with `npm run dev` via `concurrently`. Vite proxies `/api/*` to Express on port 3001. Server lib functions (`pdfToImages.ts`, `mergePdfs.ts`) are pure and unit-tested with Vitest.

**Tech Stack:** React 18, Vite 5, Express 4, TypeScript 5, pdfjs-dist 4 + canvas (server), pdf-lib (merge + test fixtures), JSZip + pdfjs-dist (browser), dnd-kit (drag-and-drop), multer, archiver, Vitest.

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | All deps + scripts (dev, test, build) |
| `tsconfig.json` | TypeScript config for server + tests (Node, ESNext) |
| `vite.config.ts` | Vite config + `/api` proxy to port 3001 |
| `vitest.config.ts` | Vitest config scoped to `tests/` |
| `index.html` | Vite HTML entry point |
| `src/main.tsx` | React root mount |
| `src/App.tsx` | Tab navigation between the two pages |
| `src/components/FileDropZone.tsx` | Reusable drag-and-drop / click-to-select file input |
| `src/pages/PdfToPng.tsx` | PDF→PNG UI: file, DPI, mode toggle, convert button |
| `src/pages/MergePdf.tsx` | Merge UI: file list, dnd-kit reorder, merge button |
| `server/index.ts` | Express app setup + route mounting |
| `server/routes/convert.ts` | `POST /api/convert` — receives PDF, returns zip |
| `server/routes/merge.ts` | `POST /api/merge` — receives PDFs, returns merged PDF |
| `server/lib/pdfToImages.ts` | `convertPdfToImages(buffer, dpi): Promise<Buffer[]>` |
| `server/lib/mergePdfs.ts` | `mergePdfBuffers(buffers): Promise<Buffer>` |
| `tests/pdfToImages.test.ts` | Unit tests for `convertPdfToImages` |
| `tests/mergePdfs.test.ts` | Unit tests for `mergePdfBuffers` |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `index.html`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "pdf2png",
  "version": "1.0.0",
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "tsx watch server/index.ts",
    "dev:client": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "archiver": "^7.0.0",
    "canvas": "^2.11.2",
    "express": "^4.18.2",
    "multer": "^1.4.5-lts.1",
    "pdf-lib": "^1.17.1",
    "pdfjs-dist": "^4.4.168"
  },
  "devDependencies": {
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@types/archiver": "^6.0.2",
    "@types/express": "^4.17.21",
    "@types/multer": "^1.4.11",
    "@types/node": "^20.14.0",
    "@vitejs/plugin-react": "^4.3.1",
    "concurrently": "^8.2.2",
    "jszip": "^3.10.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "tsx": "^4.16.2",
    "typescript": "^5.5.3",
    "vite": "^5.3.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`** (used by the server and tests via tsx/vitest)

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist/server"
  },
  "include": ["server/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PDF Manager</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Install dependencies**

Run:
```bash
npm install
```

Expected: `node_modules/` created, no errors. The `canvas` package downloads prebuilt binaries for your platform — this may take a minute.

- [ ] **Step 7: Commit**

```bash
git init
git add package.json tsconfig.json vite.config.ts vitest.config.ts index.html
git commit -m "chore: project scaffolding"
```

---

## Task 2: `mergePdfs` lib (TDD)

**Files:**
- Create: `tests/mergePdfs.test.ts`
- Create: `server/lib/mergePdfs.ts`

- [ ] **Step 1: Create `tests/mergePdfs.test.ts` with failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergePdfBuffers } from '../server/lib/mergePdfs';

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]);
  }
  return Buffer.from(await doc.save());
}

async function makePdfWithPageSize(width: number, height: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return Buffer.from(await doc.save());
}

describe('mergePdfBuffers', () => {
  it('combines page counts from all input PDFs', async () => {
    const pdf1 = await makePdf(2);
    const pdf2 = await makePdf(3);
    const merged = await mergePdfBuffers([pdf1, pdf2]);
    const result = await PDFDocument.load(merged);
    expect(result.getPageCount()).toBe(5);
  });

  it('preserves order of input documents', async () => {
    const pdf1 = await makePdfWithPageSize(100, 200);
    const pdf2 = await makePdfWithPageSize(300, 400);
    const merged = await mergePdfBuffers([pdf1, pdf2]);
    const result = await PDFDocument.load(merged);
    const pages = result.getPages();
    expect(pages[0].getSize()).toEqual({ width: 100, height: 200 });
    expect(pages[1].getSize()).toEqual({ width: 300, height: 400 });
  });

  it('works with a single PDF', async () => {
    const pdf = await makePdf(1);
    const merged = await mergePdfBuffers([pdf]);
    const result = await PDFDocument.load(merged);
    expect(result.getPageCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
npm test -- tests/mergePdfs.test.ts
```

Expected: FAIL — `Cannot find module '../server/lib/mergePdfs'`

- [ ] **Step 3: Create `server/lib/mergePdfs.ts`**

```typescript
import { PDFDocument } from 'pdf-lib';

export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  const merged = await PDFDocument.create();

  for (const buffer of buffers) {
    const doc = await PDFDocument.load(buffer);
    const copiedPages = await merged.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach((page) => merged.addPage(page));
  }

  return Buffer.from(await merged.save());
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run:
```bash
npm test -- tests/mergePdfs.test.ts
```

Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/mergePdfs.test.ts server/lib/mergePdfs.ts
git commit -m "feat: mergePdfBuffers lib with tests"
```

---

## Task 3: `pdfToImages` lib (TDD)

**Files:**
- Create: `tests/pdfToImages.test.ts`
- Create: `server/lib/pdfToImages.ts`

- [ ] **Step 1: Create `tests/pdfToImages.test.ts` with failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { convertPdfToImages } from '../server/lib/pdfToImages';

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]);
  }
  return Buffer.from(await doc.save());
}

describe('convertPdfToImages', () => {
  it('returns one buffer per page', async () => {
    const pdfBuffer = await makePdf(3);
    const images = await convertPdfToImages(pdfBuffer, 72);
    expect(images).toHaveLength(3);
  });

  it('returns Buffer instances', async () => {
    const pdfBuffer = await makePdf(1);
    const images = await convertPdfToImages(pdfBuffer, 72);
    expect(images[0]).toBeInstanceOf(Buffer);
  });

  it('returns non-empty buffers', async () => {
    const pdfBuffer = await makePdf(1);
    const images = await convertPdfToImages(pdfBuffer, 72);
    expect(images[0].length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run:
```bash
npm test -- tests/pdfToImages.test.ts
```

Expected: FAIL — `Cannot find module '../server/lib/pdfToImages'`

- [ ] **Step 3: Create `server/lib/pdfToImages.ts`**

Note: Uses `pdfjs-dist` for PDF parsing and `canvas` (npm package, prebuilt binaries) for rasterisation. No system-level GraphicsMagick/Ghostscript needed.

```typescript
import { createCanvas } from 'canvas';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';

// Disable the web worker — not available in Node.js
(GlobalWorkerOptions as { workerSrc: string }).workerSrc = '';

export async function convertPdfToImages(pdfBuffer: Buffer, dpi: number): Promise<Buffer[]> {
  const data = new Uint8Array(pdfBuffer);
  const pdf = await getDocument({ data, isEvalSupported: false }).promise;
  const scale = dpi / 72;
  const images: Buffer[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    // pdfjs expects a browser CanvasRenderingContext2D; node-canvas is compatible
    const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toBuffer('image/png'));
  }

  return images;
}
```

- [ ] **Step 4: Run tests — verify they pass**

Run:
```bash
npm test -- tests/pdfToImages.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add tests/pdfToImages.test.ts server/lib/pdfToImages.ts
git commit -m "feat: convertPdfToImages lib with tests"
```

---

## Task 4: Express Server + API Routes

**Files:**
- Create: `server/index.ts`
- Create: `server/routes/convert.ts`
- Create: `server/routes/merge.ts`

- [ ] **Step 1: Create `server/routes/merge.ts`**

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { mergePdfBuffers } from '../lib/mergePdfs.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.array('files'), async (req: Request, res: Response): Promise<void> => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length < 2) {
    res.status(400).json({ error: 'At least 2 files required' });
    return;
  }

  try {
    const merged = await mergePdfBuffers(files.map((f) => f.buffer));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    res.send(merged);
  } catch {
    res.status(500).json({ error: 'Merge failed' });
  }
});

export default router;
```

- [ ] **Step 2: Create `server/routes/convert.ts`**

```typescript
import { Router, Request, Response } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { convertPdfToImages } from '../lib/pdfToImages.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const dpi = Math.min(600, Math.max(72, parseInt(req.query['dpi'] as string) || 150));

  try {
    const images = await convertPdfToImages(req.file.buffer, dpi);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="pages.zip"');

    const archive = archiver('zip');
    archive.pipe(res);

    images.forEach((buffer, i) => {
      const name = `page-${String(i + 1).padStart(3, '0')}.png`;
      archive.append(buffer, { name });
    });

    await archive.finalize();
  } catch {
    res.status(500).json({ error: 'Conversion failed' });
  }
});

export default router;
```

- [ ] **Step 3: Create `server/index.ts`**

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

- [ ] **Step 4: Verify the server starts**

Run:
```bash
npx tsx server/index.ts
```

Expected output:
```
Server running on http://localhost:3001
```

Press Ctrl+C to stop.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/routes/convert.ts server/routes/merge.ts
git commit -m "feat: express server with convert and merge routes"
```

---

## Task 5: React App Shell

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`

- [ ] **Step 1: Create `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 2: Create `src/App.tsx`**

```tsx
import { useState } from 'react';
import PdfToPng from './pages/PdfToPng';
import MergePdf from './pages/MergePdf';

type Tab = 'convert' | 'merge';

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
      <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '2rem' }}>
        <button style={tabStyle(tab === 'convert')} onClick={() => setTab('convert')}>
          PDF → PNG
        </button>
        <button style={tabStyle(tab === 'merge')} onClick={() => setTab('merge')}>
          Merge PDFs
        </button>
      </div>
      {tab === 'convert' ? <PdfToPng /> : <MergePdf />}
    </div>
  );
}
```

- [ ] **Step 3: Create placeholder pages so Vite builds without errors**

Create `src/pages/PdfToPng.tsx`:
```tsx
export default function PdfToPng() {
  return <p>PDF → PNG (coming soon)</p>;
}
```

Create `src/pages/MergePdf.tsx`:
```tsx
export default function MergePdf() {
  return <p>Merge PDFs (coming soon)</p>;
}
```

- [ ] **Step 4: Verify Vite compiles**

Run:
```bash
npx vite build
```

Expected: build succeeds with output in `dist/`.

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx src/App.tsx src/pages/PdfToPng.tsx src/pages/MergePdf.tsx
git commit -m "feat: react app shell with tab navigation"
```

---

## Task 6: FileDropZone Component

**Files:**
- Create: `src/components/FileDropZone.tsx`

- [ ] **Step 1: Create `src/components/FileDropZone.tsx`**

```tsx
import { useRef, DragEvent, ChangeEvent } from 'react';

interface Props {
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
}

export default function FileDropZone({ multiple = false, onFiles, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type === 'application/pdf');
    if (files.length) onFiles(files);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(Array.from(e.target.files));
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      style={{
        border: '2px dashed #aaa',
        borderRadius: 8,
        padding: '2rem',
        textAlign: 'center',
        cursor: 'pointer',
        color: '#666',
        marginBottom: '1rem',
        userSelect: 'none',
      }}
    >
      {label ?? 'Drop PDF file here or click to select'}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple={multiple}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FileDropZone.tsx
git commit -m "feat: FileDropZone component"
```

---

## Task 7: MergePdf Page

**Files:**
- Modify: `src/pages/MergePdf.tsx`

- [ ] **Step 1: Replace the placeholder with the full implementation**

```tsx
import { useState } from 'react';
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
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FileDropZone from '../components/FileDropZone';

type Status = 'idle' | 'processing' | 'done' | 'error';

interface FileItem {
  id: string;
  file: File;
}

function SortableFile({ item, onRemove }: { item: FileItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 0.75rem',
        border: '1px solid #ddd',
        borderRadius: 6,
        marginBottom: '0.5rem',
        background: '#fafafa',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', fontSize: '1.1rem', color: '#aaa', lineHeight: 1 }}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.file.name}
      </span>
      <button
        onClick={onRemove}
        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: '1rem' }}
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}

export default function MergePdf() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFiles = (files: File[]) => {
    const newItems: FileItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
    }));
    setItems((prev) => [...prev, ...newItems]);
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

  const handleMerge = async () => {
    setStatus('processing');
    setError('');
    try {
      const formData = new FormData();
      items.forEach((item) => formData.append('files', item.file));

      const response = await fetch('/api/merge', { method: 'POST', body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Merge failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'merged.pdf';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Merge PDFs</h2>
      <FileDropZone multiple onFiles={handleFiles} label="Drop PDF files here or click to select" />

      {items.length > 0 && (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortableFile
                  key={item.id}
                  item={item}
                  onRemove={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                />
              ))}
            </SortableContext>
          </DndContext>

          <button
            onClick={handleMerge}
            disabled={items.length < 2 || status === 'processing'}
            style={{
              marginTop: '1rem',
              padding: '0.6rem 1.5rem',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: items.length < 2 || status === 'processing' ? 'not-allowed' : 'pointer',
              opacity: items.length < 2 ? 0.5 : 1,
              fontSize: '1rem',
            }}
          >
            {status === 'processing' ? 'Merging…' : 'Merge & Download'}
          </button>
        </>
      )}

      {status === 'done' && <p style={{ color: 'green', marginTop: '1rem' }}>Done! Check your downloads.</p>}
      {status === 'error' && <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify Vite compiles**

Run:
```bash
npx vite build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MergePdf.tsx
git commit -m "feat: MergePdf page with dnd-kit reordering"
```

---

## Task 8: PdfToPng Page

**Files:**
- Modify: `src/pages/PdfToPng.tsx`

- [ ] **Step 1: Replace the placeholder with the full implementation**

```tsx
import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import FileDropZone from '../components/FileDropZone';

// Point pdfjs at the bundled worker — Vite resolves the URL at build time
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

type Mode = 'browser' | 'server';
type Status = 'idle' | 'processing' | 'done' | 'error';

async function convertBrowser(file: File, dpi: number): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const zip = new JSZip();
  const scale = dpi / 72;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    zip.file(`page-${String(i).padStart(3, '0')}.png`, blob);
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `${file.name.replace(/\.pdf$/i, '')}-pages.zip`);
}

async function convertServer(file: File, dpi: number): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`/api/convert?dpi=${dpi}`, { method: 'POST', body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Server conversion failed');
  }
  const blob = await response.blob();
  triggerDownload(blob, `${file.name.replace(/\.pdf$/i, '')}-pages.zip`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PdfToPng() {
  const [file, setFile] = useState<File | null>(null);
  const [dpi, setDpi] = useState(150);
  const [mode, setMode] = useState<Mode>('browser');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const handleConvert = async () => {
    if (!file) return;
    setStatus('processing');
    setError('');
    try {
      if (mode === 'browser') {
        await convertBrowser(file, dpi);
      } else {
        await convertServer(file, dpi);
      }
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>PDF → PNG</h2>
      <FileDropZone onFiles={(files) => setFile(files[0])} />
      {file && <p style={{ margin: '0 0 1rem', color: '#555' }}>Selected: {file.name}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          DPI:
          <input
            type="number"
            value={dpi}
            min={72}
            max={600}
            onChange={(e) => setDpi(Math.min(600, Math.max(72, Number(e.target.value))))}
            style={{ width: 70, padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4 }}
          />
        </label>

        <div style={{ display: 'flex', gap: '1rem' }}>
          {(['browser', 'server'] as Mode[]).map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => setMode(m)}
              />
              {m === 'browser' ? 'Browser (no upload)' : 'Server'}
            </label>
          ))}
        </div>
      </div>

      <button
        onClick={handleConvert}
        disabled={!file || status === 'processing'}
        style={{
          padding: '0.6rem 1.5rem',
          background: '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: !file || status === 'processing' ? 'not-allowed' : 'pointer',
          opacity: !file ? 0.5 : 1,
          fontSize: '1rem',
        }}
      >
        {status === 'processing' ? 'Converting…' : 'Convert & Download'}
      </button>

      {status === 'done' && <p style={{ color: 'green', marginTop: '1rem' }}>Done! Check your downloads.</p>}
      {status === 'error' && <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify Vite compiles**

Run:
```bash
npx vite build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/pages/PdfToPng.tsx
git commit -m "feat: PdfToPng page with browser and server modes"
```

---

## Task 9: Run All Tests + Smoke Test

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

Run:
```bash
npm test
```

Expected: 6 tests pass across both test files.

- [ ] **Step 2: Start the dev server**

Run:
```bash
npm run dev
```

Expected output (two lines, order may vary):
```
Server running on http://localhost:3001
  VITE v5.x.x  ready in ...ms
  ➜  Local:   http://localhost:5173/
```

- [ ] **Step 3: Smoke test PDF → PNG (browser mode)**

1. Open http://localhost:5173 in your browser
2. Click the **PDF → PNG** tab
3. Drop or select any PDF file
4. Leave DPI at 150, mode at **Browser**
5. Click **Convert & Download**

Expected: a `.zip` file downloads containing one `.png` per PDF page, named `page-001.png`, `page-002.png`, etc.

- [ ] **Step 4: Smoke test PDF → PNG (server mode)**

1. Same PDF, switch mode to **Server**
2. Click **Convert & Download**

Expected: same zip downloads via the `/api/convert` route.

- [ ] **Step 5: Smoke test Merge PDFs**

1. Click the **Merge PDFs** tab
2. Drop or select two or more PDF files
3. Drag the items to change their order
4. Click **Merge & Download**

Expected: `merged.pdf` downloads with pages from all input PDFs in the order shown.

- [ ] **Step 6: Final commit**

```bash
git add .
git commit -m "chore: all features complete and verified"
```
