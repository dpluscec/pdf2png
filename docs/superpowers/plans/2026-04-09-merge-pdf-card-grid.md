# Merge PDF Card Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain vertical list in Merge PDF with the same rich card grid used by PDF → PNG, including thumbnails, page count, and consistent drag-to-reorder.

**Architecture:** Extract `PdfEntry` into a shared type module, make `PdfFileCard`'s Convert button optional, then rewrite `MergePdf.tsx` to use `PdfEntry`, the pdfjs worker, `PdfFileCard`, and a `rectSortingStrategy` grid layout.

**Tech Stack:** React 18, TypeScript, pdfjs-dist, @dnd-kit/core + @dnd-kit/sortable, Vite

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/pdfTypes.ts` | Create | Shared `PdfEntry` interface |
| `src/pages/PdfToPng.tsx` | Modify | Import `PdfEntry` from shared location instead of defining it |
| `src/components/PdfFileCard.tsx` | Modify | Make `onConvert` optional; hide Convert button when absent |
| `src/pages/MergePdf.tsx` | Modify | Full rewrite to card grid using `PdfEntry` + `PdfFileCard` |

---

## Task 1: Create shared `PdfEntry` type

**Files:**
- Create: `src/lib/pdfTypes.ts`

- [ ] **Step 1: Create the file**

Create `src/lib/pdfTypes.ts` with this exact content:

```ts
export interface PdfEntry {
  id: string;
  file: File;
  pageCount: number | null;
  thumbnail: string | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  error: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pdfTypes.ts
git commit -m "feat: extract PdfEntry to shared type module"
```

---

## Task 2: Update `PdfToPng.tsx` and `PdfFileCard.tsx` to import from shared type

**Files:**
- Modify: `src/pages/PdfToPng.tsx`
- Modify: `src/components/PdfFileCard.tsx`

- [ ] **Step 1: Update `PdfToPng.tsx`**

Remove the local `PdfEntry` interface definition (lines 27–34):

```ts
export interface PdfEntry {
  id: string;
  file: File;
  pageCount: number | null;
  thumbnail: string | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  error: string;
}
```

Replace with an import + re-export so any existing consumers of `PdfEntry` from `PdfToPng` keep working:

```ts
export type { PdfEntry } from '../lib/pdfTypes';
```

Add this line near the top of the imports in `PdfToPng.tsx`, alongside the other imports. The file already uses `PdfEntry` internally — that usage is now satisfied by the re-export import.

- [ ] **Step 2: Update `PdfFileCard.tsx`**

Change the import at line 4 from:

```ts
import type { PdfEntry } from '../pages/PdfToPng';
```

to:

```ts
import type { PdfEntry } from '../lib/pdfTypes';
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check:client
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/PdfToPng.tsx src/components/PdfFileCard.tsx
git commit -m "refactor: import PdfEntry from shared pdfTypes module"
```

---

## Task 3: Make `onConvert` optional in `PdfFileCard`

**Files:**
- Modify: `src/components/PdfFileCard.tsx`

- [ ] **Step 1: Make `onConvert` optional in the Props interface**

Change:

```ts
interface Props {
  entry: PdfEntry;
  showPreview: boolean;
  onConvert: () => void;
  onRemove: () => void;
  onMetadata: (id: string, pageCount: number, thumbnail: string | null) => void;
}
```

To:

```ts
interface Props {
  entry: PdfEntry;
  showPreview: boolean;
  onConvert?: () => void;
  onRemove: () => void;
  onMetadata: (id: string, pageCount: number, thumbnail: string | null) => void;
}
```

- [ ] **Step 2: Update the Actions section to conditionally render Convert**

Replace the entire `{/* Actions */}` div (starting at `<div style={{ display: 'flex', gap: '0.25rem'...`) with:

```tsx
{/* Actions */}
<div style={{ display: 'flex', gap: '0.25rem', padding: '0.35rem 0.5rem', borderTop: '1px solid #f3f4f6' }}>
  {onConvert && (
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
  )}
  <button
    onClick={onRemove}
    aria-label={`Remove ${entry.file.name}`}
    title="Remove"
    style={{
      flex: onConvert ? undefined : 1,
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
```

- [ ] **Step 3: Type-check**

```bash
npm run type-check:client
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/PdfFileCard.tsx
git commit -m "feat: make onConvert optional in PdfFileCard"
```

---

## Task 4: Rewrite `MergePdf.tsx` with card grid

**Files:**
- Modify: `src/pages/MergePdf.tsx`

- [ ] **Step 1: Replace the entire contents of `MergePdf.tsx`**

```tsx
import { useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
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
import type { PdfEntry } from '../lib/pdfTypes';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function MergePdf() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

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
    setStatus('idle');
    setError('');
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

  const handleMerge = async () => {
    setStatus('processing');
    setError('');
    try {
      const formData = new FormData();
      entries.forEach((entry) => formData.append('files', entry.file));

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
      setTimeout(() => URL.revokeObjectURL(url), 100);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Merge PDFs</h2>

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
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {entries.length === 0
            ? 'No files added'
            : `${entries.length} file${entries.length === 1 ? '' : 's'} — drag to reorder`}
        </span>
        <button
          onClick={handleMerge}
          disabled={entries.length < 2 || status === 'processing'}
          style={{
            marginLeft: 'auto',
            padding: '0.45rem 1.1rem',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: entries.length < 2 || status === 'processing' ? 'not-allowed' : 'pointer',
            opacity: entries.length < 2 || status === 'processing' ? 0.5 : 1,
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {status === 'processing' ? 'Merging…' : 'Merge & Download'}
        </button>
      </div>

      <FileDropZone multiple onFiles={handleFiles} label="Drop PDF files here or click to select" />

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
                  showPreview={true}
                  onRemove={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                  onMetadata={handleMetadata}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {status === 'done' && <p style={{ color: '#16a34a', marginTop: '1rem' }}>Done! Check your downloads.</p>}
      {status === 'error' && <p style={{ color: '#dc2626', marginTop: '1rem' }}>Error: {error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
npm run type-check:client
```

Expected: no errors.

- [ ] **Step 3: Manual verification**

Run `npm run dev`, open the Merge PDFs tab, drop in 2+ PDFs and confirm:
- Cards appear in a grid
- Each card shows a thumbnail (or PDF icon while loading)
- Page count appears below the filename
- Cards can be dragged to reorder
- Remove (✕) button fills the full action row width (no Convert button)
- "Merge & Download" button in toolbar merges and downloads correctly

- [ ] **Step 4: Commit**

```bash
git add src/pages/MergePdf.tsx
git commit -m "feat: replace MergePdf list with card grid using PdfFileCard"
```
