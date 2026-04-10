# Home Tab Landing Page — Design Spec

**Date:** 2026-04-10  
**Status:** Approved

---

## Overview

Add a "Home" tab as the first tab in the PDF Manager app. It serves as both a branding introduction and a navigation hub, letting users quickly jump to any tool from a single overview screen.

---

## Architecture

### New file
- `src/pages/Home.tsx` — the Home page component

### Modified file
- `src/App.tsx` — add `'home'` to the `Tab` union type; set initial `tab` state to `'home'`; add the Home tab button (first in the tab list); add the Home tab panel; pass `onNavigate` callback to `<Home>`

### No other files change.

---

## Component: `Home.tsx`

**Props:**
```ts
interface HomeProps {
  onNavigate: (tab: Tab) => void;
}
```

**Sections:**

### 1. Branding header
- Tagline: `"Convert, merge, split, compress — all in your browser"` (rendered as a `<p>`, centered)
- Bottom margin separating it from the tool grid

### 2. Tool cards grid
Five cards, one per tool, in a responsive CSS grid (`repeat(auto-fill, minmax(200px, 1fr))`).

Each card contains:
- An emoji icon representing the tool
- Tool name
- One-sentence description
- Full card is clickable, calls `onNavigate(tabId)`

| Tab ID | Icon | Name | Description |
|--------|------|------|-------------|
| `convert` | 🖼️ | PDF → PNG | Export each PDF page as a PNG image at configurable DPI |
| `merge` | 🔀 | Merge PDFs | Combine multiple PDFs into one in any order |
| `png-to-pdf` | 📄 | PNG → PDF | Bundle PNG or JPEG images into a single PDF |
| `split` | ✂️ | Split PDF | Extract pages by range, list, or target file size |
| `compress` | 🗜️ | Compress PDF | Reduce PDF file size with adjustable compression |

**Card styling** (inline CSS, matching existing patterns):
- Background: `#fff`
- Border: `1px solid #e5e7eb`
- Border-radius: `8px`
- Padding: `1.25rem`
- Cursor: `pointer`
- On hover: border-color `#0070f3`, box-shadow subtle blue tint
- Transition: `border-color 0.15s, box-shadow 0.15s`

---

## App.tsx changes

1. Add `'home'` to the `Tab` union type
2. Change initial state: `useState<Tab>('home')`
3. Remove the standalone `<h1>PDF Manager</h1>` (Home tab owns the title; other tabs don't need it at the layout level — or keep it and Home just doesn't repeat it; simpler is to keep the h1 in App.tsx and not duplicate it in Home)
4. Add Home tab button as the first tab: label "Home"
5. Add Home tab panel rendering `<Home onNavigate={setTab} />`

> **Note on h1:** Keep the existing `<h1>PDF Manager</h1>` in App.tsx as the persistent page title above the tabs. The Home component renders only the tagline (in a `<p>`) and the tool cards grid — it does not repeat the app name.

---

## Styling constraints

- All styles are inline CSS (no CSS files, no Tailwind)
- Font: `system-ui, sans-serif` (inherited from App.tsx wrapper)
- Colors: match existing palette (`#0070f3` blue, `#555` text, `#e5e7eb` borders, `#f9fafb` hover backgrounds)

---

## Out of scope

- No animations beyond CSS transitions on hover
- No "recently used" tracking
- No per-tool status indicators on the Home tab
- No dark mode
