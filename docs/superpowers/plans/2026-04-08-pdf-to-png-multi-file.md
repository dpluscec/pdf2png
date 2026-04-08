# PDF→PNG Multi-File Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the PDF→PNG page to support multiple files shown as a draggable card grid with optional thumbnails, per-file conversion, and group conversion downloading a combined zip.

**Architecture:** Client-only change. New components `PdfThumbnail` and `PdfFileCard` are extracted to keep `PdfToPng.tsx` manageable. `FileDropZone` gains a `compact` prop. All conversion logic stays in `PdfToPng.tsx`. No server changes.

**Tech Stack:** React 18, pdfjs-dist (browser thumbnail rendering), JSZip, dnd-kit (drag-to-reorder grid), TypeScript.

---

## File Map

| File | Change |
|------|--------|
| `src/components/FileDropZone.tsx` | Add `compact?: boolean` prop — renders a small strip when true |
| `src/components/PdfThumbnail.tsx` | New — renders page 1 at 72 DPI, calls back with `(pageCount, thumbnailSrc)` |
| `src/components/PdfFileCard.tsx` | New — single card: drag handle, thumbnail/icon, filename, page count, status, convert + remove |
| `src/pages/PdfToPng.tsx` | Full rewrite — multi-file state, toolbar, card grid, convert logic |

---

## Task 1: FileDropZone compact prop

**Files:**
- Modify: `src/components/FileDropZone.tsx`

- [ ] **Step 1: Read the current file**

Read `src/components/FileDropZone.tsx` to understand the current interface.

- [ ] **Step 2: Add `compact` prop and render a strip when true**

Replace the full file content with:

```tsx
import { useRef, useState, DragEvent, ChangeEvent } from 'react';

interface Props {
  multiple?: boolean;
  compact?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
}

function isPdf(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

export default function FileDropZone({ multiple = false, compact = false, onFiles, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState('');

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const all = Array.from(e.dataTransfer.files);
    const pdfs = all.filter(isPdf);
    if (pdfs.length === 0) {
      setRejection('No PDF files found in the dropped items.');
      return;
    }
    setRejection('');
    onFiles(pdfs);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const dragHandlers = {
    onDrop: handleDrop,
    onDragOver: (e: DragEvent) => { e.preventDefault(); setDragging(true); },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
    },
    onClick: () => { setRejection(''); inputRef.current?.click(); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); },
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      multiple={multiple}
      onChange={handleChange}
      style={{ display: 'none' }}
    />
  );

  if (compact) {
    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Add more PDF files"
          {...dragHandlers}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.9rem',
            border: `1px dashed ${dragging ? '#0070f3' : '#bbb'}`,
            borderRadius: 6,
            cursor: 'pointer',
            color: dragging ? '#0070f3' : '#777',
            fontSize: '0.85rem',
            marginBottom: '1rem',
            background: dragging ? '#f0f7ff' : 'transparent',
            transition: 'border-color 0.15s, color 0.15s',
            userSelect: 'none',
          }}
        >
          + Add more files
          {hiddenInput}
        </div>
        {rejection && (
          <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: '0 0 0.5rem' }} role="alert">
            {rejection}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={label ?? 'Drop PDF file here or click to select'}
        {...dragHandlers}
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
        {hiddenInput}
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

- [ ] **Step 3: Verify build passes**

Run:
```bash
cd c:/vso/pdf2png && npx vite build 2>&1
```

Expected: build succeeds (chunk size warnings are fine).

- [ ] **Step 4: Commit**

```bash
cd c:/vso/pdf2png
git add src/components/FileDropZone.tsx
git commit -m "feat: add compact prop to FileDropZone"
```

---

## Task 2: PdfThumbnail component

**Files:**
- Create: `src/components/PdfThumbnail.tsx`

This component loads a PDF file, extracts page count, optionally renders page 1 to a JPEG data URL, and reports both via an `onMetadata` callback. It renders either the thumbnail image or a PDF icon SVG.

- [ ] **Step 1: Create `src/components/PdfThumbnail.tsx`**

```tsx
import { useEffect, useState, memo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Worker URL is set by PdfToPng.tsx before any component using pdfjs renders.
// PdfThumbnail relies on that setup.

interface Props {
  file: File;
  showPreview: boolean;
  onMetadata: (pageCount: number, thumbnail: string | null) => void;
}

function PdfIcon() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120, background: '#f9fafb' }}>
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="52" height="52" rx="6" fill="#fee2e2" />
        <path d="M13 7h18l12 12v26H13V7z" fill="#ef4444" />
        <path d="M31 7l12 12H31V7z" fill="#fca5a5" />
        <text x="26" y="38" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="system-ui, sans-serif">PDF</text>
      </svg>
    </div>
  );
}

// Memoized: only re-runs effect when file identity or showPreview changes.
const PdfThumbnail = memo(
  function PdfThumbnail({ file, showPreview, onMetadata }: Props) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;

      (async () => {
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
        const pageCount = pdf.numPages;

        if (!showPreview) {
          if (!cancelled) {
            setSrc(null); // clear any previously rendered thumbnail
            onMetadata(pageCount, null);
          }
          return;
        }

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 }); // scale 1 = 72 DPI
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({
          canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D,
          viewport,
        }).promise;
        page.cleanup();

        const thumbnailSrc = canvas.toDataURL('image/jpeg', 0.7);
        if (!cancelled) {
          setSrc(thumbnailSrc);
          onMetadata(pageCount, thumbnailSrc);
        }
      })().catch(() => {
        if (!cancelled) onMetadata(0, null);
      });

      return () => {
        cancelled = true;
      };
      // onMetadata intentionally excluded from deps — stable via useCallback in parent
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file, showPreview]);

    if (src) {
      return (
        <img
          src={src}
          alt="PDF first page preview"
          style={{ width: '100%', height: 120, objectFit: 'contain', display: 'block', background: '#f9fafb' }}
        />
      );
    }

    return <PdfIcon />;
  },
  (prev, next) => prev.file === next.file && prev.showPreview === next.showPreview
);

export default PdfThumbnail;
```

- [ ] **Step 2: Verify build passes**

Run:
```bash
cd c:/vso/pdf2png && npx vite build 2>&1
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
cd c:/vso/pdf2png
git add src/components/PdfThumbnail.tsx
git commit -m "feat: PdfThumbnail component with lazy page count and preview"
```

---

## Task 3: PdfFileCard component

**Files:**
- Create: `src/components/PdfFileCard.tsx`

This component renders one card in the grid. It uses `useSortable` from dnd-kit for drag-to-reorder. It imports `PdfEntry` type from `PdfToPng.tsx` (exported there).

- [ ] **Step 1: Create `src/components/PdfFileCard.tsx`**

```tsx
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PdfThumbnail from './PdfThumbnail';
import type { PdfEntry } from '../pages/PdfToPng';

interface Props {
  entry: PdfEntry;
  showPreview: boolean;
  onConvert: () => void;
  onRemove: () => void;
  onMetadata: (id: string, pageCount: number, thumbnail: string | null) => void;
}

const STATUS_COLOR: Record<PdfEntry['status'], string> = {
  idle: '#9ca3af',
  processing: '#0070f3',
  done: '#16a34a',
  error: '#dc2626',
};

const STATUS_LABEL: Record<PdfEntry['status'], string> = {
  idle: 'Ready',
  processing: 'Converting…',
  done: 'Done',
  error: 'Error',
};

export default function PdfFileCard({ entry, showPreview, onConvert, onRemove, onMetadata }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
      }}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        style={{
          padding: '0.25rem',
          textAlign: 'center',
          cursor: 'grab',
          color: '#d1d5db',
          fontSize: '0.7rem',
          background: '#f9fafb',
          borderBottom: '1px solid #f3f4f6',
          lineHeight: 1.2,
          userSelect: 'none',
        }}
        title="Drag to reorder"
      >
        ⠿⠿⠿
      </div>

      {/* Thumbnail or icon */}
      <PdfThumbnail
        file={entry.file}
        showPreview={showPreview}
        onMetadata={(pageCount, thumbnail) => onMetadata(entry.id, pageCount, thumbnail)}
      />

      {/* Info */}
      <div style={{ padding: '0.5rem 0.6rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <p
          title={entry.file.name}
          style={{
            margin: 0,
            fontSize: '0.8rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#111',
          }}
        >
          {entry.file.name}
        </p>
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>
          {entry.pageCount === null ? '— pages' : `${entry.pageCount} ${entry.pageCount === 1 ? 'page' : 'pages'}`}
        </p>
        <span style={{ fontSize: '0.72rem', color: STATUS_COLOR[entry.status], fontWeight: 500 }}>
          {STATUS_LABEL[entry.status]}
          {entry.status === 'error' && entry.error ? `: ${entry.error}` : ''}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.25rem', padding: '0.35rem 0.5rem', borderTop: '1px solid #f3f4f6' }}>
        <button
          onClick={onConvert}
          disabled={entry.status === 'processing'}
          style={{
            flex: 1,
            padding: '0.3rem 0',
            background: entry.status === 'processing' ? '#e5e7eb' : '#0070f3',
            color: entry.status === 'processing' ? '#9ca3af' : '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: entry.status === 'processing' ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          Convert
        </button>
        <button
          onClick={onRemove}
          aria-label={`Remove ${entry.file.name}`}
          title="Remove"
          style={{
            padding: '0.3rem 0.5rem',
            background: 'none',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            cursor: 'pointer',
            color: '#9ca3af',
            fontSize: '0.75rem',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run:
```bash
cd c:/vso/pdf2png && npx vite build 2>&1
```

Note: This will fail until `PdfToPng.tsx` exports `PdfEntry`. That's fine — the next task fixes it. If you want a clean build before Task 4, add a temporary stub export to `PdfToPng.tsx`:

```typescript
// Temporary — add near the top of src/pages/PdfToPng.tsx
export interface PdfEntry {
  id: string; file: File; pageCount: number | null;
  thumbnail: string | null; status: 'idle' | 'processing' | 'done' | 'error'; error: string;
}
```

- [ ] **Step 3: Commit**

```bash
cd c:/vso/pdf2png
git add src/components/PdfFileCard.tsx src/pages/PdfToPng.tsx
git commit -m "feat: PdfFileCard component with drag handle, thumbnail, and actions"
```

---

## Task 4: PdfToPng full rewrite

**Files:**
- Modify: `src/pages/PdfToPng.tsx` (full replacement)

This is the main orchestrator: state management, toolbar, card grid, conversion logic.

Key design points:
- `PdfEntry` is exported so `PdfFileCard` can import the type
- `convertBrowser` and `convertServer` both return `Promise<Blob>` (a zip blob with pages in a subfolder)
- For server mode, the server returns a flat zip; we repack it into a subfolder client-side using JSZip
- `handleConvertAll` processes only `idle` entries sequentially, accumulates blobs, merges into `converted.zip`
- `handleMetadata` is wrapped in `useCallback` so `PdfThumbnail`'s memoization is effective
- Preview toggle clears `thumbnail` from all entries when turned off

- [ ] **Step 1: Replace the entire content of `src/pages/PdfToPng.tsx`**

```tsx
import { useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
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

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface PdfEntry {
  id: string;
  file: File;
  pageCount: number | null;
  thumbnail: string | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  error: string;
}

type Mode = 'browser' | 'server';
type GroupStatus = 'idle' | 'processing' | 'done' | 'error';

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

async function convertBrowser(file: File, dpi: number, folderName: string): Promise<Blob> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const zip = new JSZip();
  const scale = dpi / 72;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    zip.file(`${folderName}/page-${String(i).padStart(3, '0')}.png`, blob);
    page.cleanup();
  }

  return zip.generateAsync({ type: 'blob' });
}

async function convertServer(file: File, dpi: number, folderName: string): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`/api/convert?dpi=${dpi}`, { method: 'POST', body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Server conversion failed');
  }

  // Server returns flat zip (page-001.png, ...); repack into subfolder client-side
  const serverZip = await JSZip.loadAsync(await response.blob());
  const outZip = new JSZip();
  await Promise.all(
    Object.entries(serverZip.files)
      .filter(([, f]) => !f.dir)
      .map(async ([name, f]) => {
        outZip.file(`${folderName}/${name}`, await f.async('blob'));
      })
  );
  return outZip.generateAsync({ type: 'blob' });
}

export default function PdfToPng() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [dpi, setDpi] = useState(150);
  const [mode, setMode] = useState<Mode>('browser');
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

  // Converts a single entry and returns its zip blob (or null on error).
  // Updates entry status in state.
  const convertEntry = async (entry: PdfEntry): Promise<Blob | null> => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, status: 'processing', error: '' } : e))
    );
    try {
      const folder = stemName(entry.file);
      const blob =
        mode === 'browser'
          ? await convertBrowser(entry.file, dpi, folder)
          : await convertServer(entry.file, dpi, folder);
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

  const handleConvertOne = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const blob = await convertEntry(entry);
    if (blob) triggerDownload(blob, `${stemName(entry.file)}-pages.zip`);
  };

  const handleConvertAll = async () => {
    const idleEntries = entries.filter((e) => e.status === 'idle');
    if (idleEntries.length === 0) return;

    setGroupStatus('processing');
    const blobs: Blob[] = [];

    for (const entry of idleEntries) {
      const blob = await convertEntry(entry);
      if (blob) blobs.push(blob);
    }

    if (blobs.length === 0) {
      setGroupStatus('error');
      return;
    }

    // Merge all per-file zips into one combined zip
    const combined = new JSZip();
    for (const blob of blobs) {
      const z = await JSZip.loadAsync(blob);
      await Promise.all(
        Object.entries(z.files)
          .filter(([, f]) => !f.dir)
          .map(async ([name, f]) => {
            combined.file(name, await f.async('blob'));
          })
      );
    }

    triggerDownload(await combined.generateAsync({ type: 'blob' }), 'converted.zip');
    setGroupStatus('done');
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>PDF → PNG</h2>

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
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
          DPI:
          <input
            type="number"
            value={dpi}
            min={72}
            max={600}
            onChange={(e) => setDpi(Math.min(600, Math.max(72, Number(e.target.value))))}
            style={{ width: 65, padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem' }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {(['browser', 'server'] as Mode[]).map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input type="radio" name="pdf-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {m === 'browser' ? 'Browser' : 'Server'}
            </label>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.875rem' }}>
          <input type="checkbox" checked={showPreview} onChange={handleTogglePreview} />
          Preview
        </label>

        <button
          onClick={handleConvertAll}
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
          {groupStatus === 'processing' ? 'Converting…' : 'Convert All'}
        </button>
      </div>

      {/* Drop zone — compact when files are loaded */}
      <FileDropZone
        multiple
        compact={entries.length > 0}
        onFiles={handleFiles}
      />

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
                  onConvert={() => handleConvertOne(entry.id)}
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
        <p style={{ color: '#dc2626', marginTop: '1rem' }}>All conversions failed. Check individual file errors above.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run:
```bash
cd c:/vso/pdf2png && npx vite build 2>&1
```

Expected: build succeeds. If you see TypeScript errors, common causes:
- `rectSortingStrategy` not found → import it from `@dnd-kit/sortable` (already a dependency)
- `canvas.getContext('2d')!` type mismatch → `canvas.getContext('2d') as CanvasRenderingContext2D`

- [ ] **Step 3: Run existing tests — confirm server lib tests still pass**

Run:
```bash
cd c:/vso/pdf2png && npx vitest run 2>&1
```

Expected: 8/8 tests pass (these test server lib only; client changes don't affect them).

- [ ] **Step 4: Commit**

```bash
cd c:/vso/pdf2png
git add src/pages/PdfToPng.tsx
git commit -m "feat: PDF→PNG multi-file card grid with thumbnails and drag-to-reorder"
```

---

## Task 5: Smoke Test

**Files:** none (verification only)

- [ ] **Step 1: Start dev server**

```bash
cd c:/vso/pdf2png && npm run dev
```

Expected: Vite on port 5173, Express on port 3001 (or next available).

- [ ] **Step 2: Verify empty state**

Open http://localhost:5173, click PDF → PNG tab.

Expected:
- Full-height drop zone visible
- Toolbar shows DPI=150, Browser mode selected, Preview checkbox checked, Convert All button (disabled)

- [ ] **Step 3: Add files and verify card grid**

Drop or select 2–3 PDF files.

Expected:
- Drop zone shrinks to compact "+ Add more files" strip
- Card grid appears with one card per file
- Each card shows PDF icon initially, then thumbnail replaces it (if Preview is on)
- Page count shows "— pages" then updates to the actual count
- Cards can be dragged to reorder

- [ ] **Step 4: Test individual conversion**

Click "Convert" on one card.

Expected:
- Card status shows "Converting…" (blue)
- A zip downloads named `<filename>-pages.zip`
- Zip contains `<stem>/page-001.png`, `<stem>/page-002.png`, …
- Card status shows "Done" (green) after download

- [ ] **Step 5: Test Convert All**

Reset (reload page), drop 2+ files, click "Convert All".

Expected:
- All cards show "Converting…" sequentially
- A single `converted.zip` downloads when all complete
- Zip contains subfolders: one per file, each with `page-001.png`, …
- Cards show "Done"

- [ ] **Step 6: Test preview toggle**

With cards loaded, uncheck Preview.

Expected: Thumbnail images replaced with PDF icon SVGs. Re-check Preview: thumbnails reload.

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
cd c:/vso/pdf2png
git add -A
git commit -m "chore: PDF→PNG multi-file complete and verified" 2>/dev/null || echo "nothing extra to commit"
```
