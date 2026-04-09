# Clear All / Clear Button Design

**Date:** 2026-04-09  
**Status:** Approved

## Summary

Add inline "Clear all" / "Clear" text links to all pages that accept file or range input, so the user can reset state in one click instead of removing items one by one.

## Scope

Five pages are affected:

| Page | What is cleared |
|---|---|
| MergePdf | All files (`items → []`) |
| PdfToPng | All files (`entries → []`) |
| PngToPdf | All files (`items → []`) |
| CompressPdf | All files (`entries → []`) |
| SplitPdf (range mode, custom) | Custom ranges → reset to one blank row |
| SplitPdf (pages mode, selected) | Selected pages + page input text → empty |

## Approach

**Inline text link (Approach A).** No bordered button, no action-area placement. Matches the existing `+ Add range` button style throughout the codebase.

Button style (shared):
```ts
{
  background: 'none',
  border: 'none',
  color: '#0070f3',
  fontSize: '0.875rem',
  cursor: 'pointer',
  padding: 0,
}
```

## Per-Page Design

### Multi-file pages (Merge, PdfToPng, PngToPdf, Compress)

- A file count + "Clear all" link row appears above the file list, only when `items.length > 0` / `entries.length > 0`.
- Layout: `"{N} files · Clear all"` — count on the left, link inline to the right.
- Clicking "Clear all" sets the array state to `[]`.

### SplitPdf — Range mode (custom ranges)

- "Clear ranges" link appears on the same row as `+ Add range`, to its right.
- Visible when `customRanges.length > 1` OR the single row has any non-empty `from` or `to` value.
- Clicking resets `customRanges` to `[{ id: '1', from: '', to: '' }]`.

### SplitPdf — Pages mode (selected pages)

- "Clear selection" link appears inline after the text input (same row or immediately below).
- Visible when `pageInputText !== ''` or `selectedPages.length > 0`.
- Clicking resets `selectedPages → []` and `pageInputText → ''`.

## What Is Not Cleared

- The loaded PDF file in SplitPdf is not cleared by any of these buttons.
- Processing status / error messages are not reset (they clear naturally on next operation).
- Settings (DPI, compression level, page size, mode, etc.) are not touched.

## Testing

- Each clear button only renders when there is something to clear.
- After clicking, the relevant list/input returns to its initial empty state.
- Other page state (settings, mode selections) is unaffected.
