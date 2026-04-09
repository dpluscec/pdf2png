# Clear All / Clear Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline "Clear all" / "Clear" text links to every page that accepts file or range input so the user can reset state in one click.

**Architecture:** Each page gets a minimal inline link rendered conditionally (only when there is something to clear), defined with a shared local style constant. No new components or shared utilities — each change is self-contained in the page file it affects.

**Tech Stack:** React, TypeScript, inline styles (existing pattern throughout the codebase)

---

## File Map

| File | Change |
|---|---|
| `src/pages/MergePdf.tsx` | Add file count + "Clear all" row above the sortable list |
| `src/pages/PdfToPng.tsx` | Add file count + "Clear all" row above the card grid |
| `src/pages/PngToPdf.tsx` | Add file count + "Clear all" row above the controls section |
| `src/pages/CompressPdf.tsx` | Add file count + "Clear all" row above the card grid |
| `src/pages/SplitPdf.tsx` | Add "Clear ranges" next to `+ Add range`; add "Clear selection" next to page text input |

---

## Shared style

Every "Clear all" / "Clear ranges" / "Clear selection" link uses this style object (defined as a local `const` in each file, not a shared utility):

```ts
const clearLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#0070f3',
  fontSize: '0.875rem',
  cursor: 'pointer',
  padding: 0,
};
```

---

## Task 1: MergePdf — "Clear all"

**File:** `src/pages/MergePdf.tsx`

- [ ] **Step 1: Add `clearLinkStyle` constant**

  After the `FileItem` interface (around line 27), add:

  ```ts
  const clearLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#0070f3',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
  };
  ```

- [ ] **Step 2: Add count row above the sortable list**

  Inside the `{items.length > 0 && (...)}` block, add a count + clear row as the first child of the fragment, before the `<DndContext>`:

  Replace:
  ```tsx
  {items.length > 0 && (
    <>
      <DndContext
  ```

  With:
  ```tsx
  {items.length > 0 && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
        <span>{items.length} {items.length === 1 ? 'file' : 'files'}</span>
        <span>·</span>
        <button style={clearLinkStyle} onClick={() => setItems([])}>Clear all</button>
      </div>
      <DndContext
  ```

- [ ] **Step 3: Verify in browser**

  - Drop 2+ PDF files → count row appears, "Clear all" is visible
  - Click "Clear all" → list empties, count row disappears
  - Drop a single file → count reads "1 file" (singular)

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/MergePdf.tsx
  git commit -m "feat: add Clear all button to MergePdf"
  ```

---

## Task 2: PdfToPng — "Clear all"

**File:** `src/pages/PdfToPng.tsx`

- [ ] **Step 1: Add `clearLinkStyle` constant**

  Add after the last `import` statement (before the type/interface definitions at the top of the file):

  ```ts
  const clearLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#0070f3',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
  };
  ```

- [ ] **Step 2: Add count row above the card grid**

  Locate the `{/* Card grid */}` comment. Add a count + clear row immediately before the `<DndContext>` inside that block:

  Replace:
  ```tsx
  {/* Card grid */}
  {entries.length > 0 && (
    <DndContext
  ```

  With:
  ```tsx
  {/* Card grid */}
  {entries.length > 0 && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
        <span>{entries.length} {entries.length === 1 ? 'file' : 'files'}</span>
        <span>·</span>
        <button style={clearLinkStyle} onClick={() => setEntries([])}>Clear all</button>
      </div>
      <DndContext
  ```

  And close the new fragment after the closing `</DndContext>` tag and before the `{groupStatus === 'done' && ...}` checks:

  ```tsx
      </DndContext>
    </>
  )}
  ```

- [ ] **Step 3: Verify in browser**

  - Drop 2+ PDFs on PdfToPng → count row appears above cards
  - Click "Clear all" → all cards removed, count row gone
  - Drop 1 file → count reads "1 file"

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/PdfToPng.tsx
  git commit -m "feat: add Clear all button to PdfToPng"
  ```

---

## Task 3: PngToPdf — "Clear all"

**File:** `src/pages/PngToPdf.tsx`

- [ ] **Step 1: Add `clearLinkStyle` constant**

  Add after the last `import` statement, before the type definitions:

  ```ts
  const clearLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#0070f3',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
  };
  ```

- [ ] **Step 2: Add count row at the top of the `items.length > 0` block**

  Locate the `{items.length > 0 && (...)}` block. Add the count row as the first element inside the fragment, before `{/* Controls */}`:

  Replace:
  ```tsx
  {items.length > 0 && (
    <>
      {/* Controls */}
  ```

  With:
  ```tsx
  {items.length > 0 && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
        <span>{items.length} {items.length === 1 ? 'file' : 'files'}</span>
        <span>·</span>
        <button style={clearLinkStyle} onClick={() => setItems([])}>Clear all</button>
      </div>
      {/* Controls */}
  ```

- [ ] **Step 3: Verify in browser**

  - Drop 2+ images → count row appears above controls
  - Click "Clear all" → all image cards cleared
  - Drop 1 image → count reads "1 file"

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/PngToPdf.tsx
  git commit -m "feat: add Clear all button to PngToPdf"
  ```

---

## Task 4: CompressPdf — "Clear all"

**File:** `src/pages/CompressPdf.tsx`

- [ ] **Step 1: Add `clearLinkStyle` constant**

  Add after the last `import` statement, before the type definitions:

  ```ts
  const clearLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#0070f3',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
  };
  ```

- [ ] **Step 2: Add count row above the card grid**

  Locate the `{/* Card grid */}` comment. Add a count + clear row immediately before the `<DndContext>` inside that block:

  Replace:
  ```tsx
  {/* Card grid */}
  {entries.length > 0 && (
    <DndContext
  ```

  With:
  ```tsx
  {/* Card grid */}
  {entries.length > 0 && (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
        <span>{entries.length} {entries.length === 1 ? 'file' : 'files'}</span>
        <span>·</span>
        <button style={clearLinkStyle} onClick={() => setEntries([])}>Clear all</button>
      </div>
      <DndContext
  ```

  Close the new fragment after the closing `</DndContext>`:

  ```tsx
      </DndContext>
    </>
  )}
  ```

- [ ] **Step 3: Verify in browser**

  - Drop 2+ PDFs → count row appears above cards
  - Click "Clear all" → all cards removed
  - Drop 1 PDF → count reads "1 file"

- [ ] **Step 4: Commit**

  ```bash
  git add src/pages/CompressPdf.tsx
  git commit -m "feat: add Clear all button to CompressPdf"
  ```

---

## Task 5: SplitPdf — "Clear ranges"

**File:** `src/pages/SplitPdf.tsx`

- [ ] **Step 1: Add `clearLinkStyle` constant**

  `SplitPdf.tsx` already defines `inputStyle` and `labelStyle` as `const` objects near the top (around line 75). Add `clearLinkStyle` after them:

  ```ts
  const clearLinkStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: '#0070f3',
    fontSize: '0.875rem',
    cursor: 'pointer',
    padding: 0,
  };
  ```

- [ ] **Step 2: Compute `showClearRanges` derived value**

  In the component body (after state declarations), add:

  ```ts
  const showClearRanges =
    customRanges.length > 1 ||
    customRanges[0].from !== '' ||
    customRanges[0].to !== '';
  ```

- [ ] **Step 3: Add "Clear ranges" link next to `+ Add range`**

  Locate the `+ Add range` button (the `<button>` with text `+ Add range`). Add the "Clear ranges" button on the same row by wrapping both in a flex div:

  Replace:
  ```tsx
  <button
    onClick={() => setCustomRanges(prev => [...prev, { id: String(Date.now()), from: '', to: '' }])}
    style={{ fontSize: '0.875rem', color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: '0.25rem' }}
  >
    + Add range
  </button>
  ```

  With:
  ```tsx
  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
    <button
      onClick={() => setCustomRanges(prev => [...prev, { id: String(Date.now()), from: '', to: '' }])}
      style={{ fontSize: '0.875rem', color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
    >
      + Add range
    </button>
    {showClearRanges && (
      <button
        style={clearLinkStyle}
        onClick={() => setCustomRanges([{ id: '1', from: '', to: '' }])}
      >
        Clear ranges
      </button>
    )}
  </div>
  ```

- [ ] **Step 4: Verify in browser**

  - Load a PDF, switch to Range mode → "Clear ranges" is hidden (single blank row)
  - Fill in the From/To fields → "Clear ranges" appears
  - Click "+ Add range" → "Clear ranges" appears (more than one row)
  - Click "Clear ranges" → resets to a single blank row, button hides again

- [ ] **Step 5: Commit**

  ```bash
  git add src/pages/SplitPdf.tsx
  git commit -m "feat: add Clear ranges button to SplitPdf"
  ```

---

## Task 6: SplitPdf — "Clear selection"

**File:** `src/pages/SplitPdf.tsx`

(`clearLinkStyle` is already defined from Task 5.)

- [ ] **Step 1: Add "Clear selection" button next to the page text input**

  Locate the `<input type="text" ... placeholder="e.g. 1, 3, 5-8" ...>` in the `pageSelection === 'selected'` block. It currently renders alone. Wrap it in a flex row with the "Clear selection" button:

  Replace:
  ```tsx
  <input
    type="text"
    value={pageInputText}
    onChange={e => handlePageTextChange(e.target.value)}
    placeholder="e.g. 1, 3, 5-8"
    style={{ ...inputStyle, width: '100%', marginBottom: '0.75rem', boxSizing: 'border-box' }}
  />
  ```

  With:
  ```tsx
  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
    <input
      type="text"
      value={pageInputText}
      onChange={e => handlePageTextChange(e.target.value)}
      placeholder="e.g. 1, 3, 5-8"
      style={{ ...inputStyle, flex: 1, boxSizing: 'border-box' }}
    />
    {(pageInputText !== '' || selectedPages.length > 0) && (
      <button
        style={clearLinkStyle}
        onClick={() => { setSelectedPages([]); setPageInputText(''); }}
      >
        Clear selection
      </button>
    )}
  </div>
  ```

- [ ] **Step 2: Verify in browser**

  - Load a PDF, switch to Pages mode → select "Selected pages"
  - Type in the text input → "Clear selection" appears inline
  - Click a thumbnail to select a page → "Clear selection" appears
  - Click "Clear selection" → input empties, all thumbnails deselect, button hides

- [ ] **Step 3: Commit**

  ```bash
  git add src/pages/SplitPdf.tsx
  git commit -m "feat: add Clear selection button to SplitPdf"
  ```
