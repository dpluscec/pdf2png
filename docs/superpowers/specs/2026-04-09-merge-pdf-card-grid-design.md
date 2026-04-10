# Design: Merge PDF — Card Grid Display

**Date:** 2026-04-09  
**Status:** Approved

## Goal

Replace the plain vertical list in Merge PDF with the same rich card grid used by PDF → PNG: thumbnail previews, page count, drag-to-reorder, and consistent visual style.

## Approach

Reuse `PdfFileCard` and `PdfThumbnail` directly. Make `onConvert` optional in `PdfFileCard` so the Convert button is hidden when not needed. Share the `PdfEntry` type via a new shared module.

## Changes

### 1. New file: `src/lib/pdfTypes.ts`

Move the `PdfEntry` interface here from `PdfToPng.tsx`:

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

`PdfToPng.tsx` imports `PdfEntry` from this new location instead of defining it locally.

### 2. `src/components/PdfFileCard.tsx`

- Make `onConvert` optional (`onConvert?: () => void`)
- When `onConvert` is not provided, hide the Convert button; the Remove button takes full width in the action row

### 3. `src/pages/MergePdf.tsx`

- Remove the local `FileItem` type and `SortableFile` component
- Import `PdfEntry` from `src/lib/pdfTypes.ts`
- Initialize the pdfjs worker (same one-liner as `PdfToPng.tsx`)
- Add `handleMetadata` callback (via `useCallback`) to update `pageCount` and `thumbnail` on entries
- Replace `verticalListSortingStrategy` with `rectSortingStrategy`
- Replace the vertical list with a CSS grid: `repeat(auto-fill, minmax(175px, 1fr))`, gap `0.75rem`
- Render `PdfFileCard` per entry (without `onConvert`)
- Move the "Merge & Download" button into a toolbar bar above the drop zone (same style as PDF → PNG toolbar: `background: #f9fafb`, `border: 1px solid #f3f4f6`, `borderRadius: 8`, `padding: 0.75rem`)
- Entries start with `status: 'idle'`, `pageCount: null`, `thumbnail: null`, `error: ''`

## Data flow

```
User drops files
  → MergePdf creates PdfEntry[] with status='idle'
  → PdfFileCard renders PdfThumbnail
  → PdfThumbnail loads PDF via pdfjs, calls onMetadata
  → MergePdf.handleMetadata updates pageCount + thumbnail in state
  → Card displays thumbnail and page count
User reorders cards via drag → arrayMove updates entries order
User clicks Merge & Download → existing merge logic unchanged
```

## Out of scope

- Per-card status tracking (merge is a single atomic operation)
- Preview toggle (not needed for merge)
- DPI or mode controls (merge has no conversion settings)
