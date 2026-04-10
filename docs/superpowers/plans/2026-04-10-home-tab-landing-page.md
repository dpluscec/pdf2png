# Home Tab Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Home" tab as the first tab in PDF Manager, showing a tagline and a grid of clickable tool cards that navigate to the corresponding tool tab.

**Architecture:** Create `src/pages/Home.tsx` as a pure presentational component that receives an `onNavigate` callback prop. Modify `src/App.tsx` to add `'home'` to the `Tab` union type, make it the default tab, and wire the callback. No new dependencies required.

**Tech Stack:** React 18, TypeScript, Vite, inline CSS (no component library or CSS framework)

---

### Task 1: Create `Home.tsx`

**Files:**
- Create: `src/pages/Home.tsx`

- [ ] **Step 1: Create `src/pages/Home.tsx`** with the following content:

```tsx
import { CSSProperties } from 'react';

type Tab = 'home' | 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress';

interface HomeProps {
  onNavigate: (tab: Tab) => void;
}

const tools: { tab: Exclude<Tab, 'home'>; icon: string; name: string; description: string }[] = [
  { tab: 'convert',    icon: '🖼️', name: 'PDF → PNG',     description: 'Export each PDF page as a PNG image at configurable DPI.' },
  { tab: 'merge',      icon: '🔀', name: 'Merge PDFs',    description: 'Combine multiple PDFs into one in any order.' },
  { tab: 'png-to-pdf', icon: '📄', name: 'PNG → PDF',     description: 'Bundle PNG or JPEG images into a single PDF.' },
  { tab: 'split',      icon: '✂️', name: 'Split PDF',     description: 'Extract pages by range, list, or target file size.' },
  { tab: 'compress',   icon: '🗜️', name: 'Compress PDF',  description: 'Reduce PDF file size with adjustable compression.' },
];

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
  gap: '1rem',
  marginTop: '2rem',
};

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '1.25rem',
  cursor: 'pointer',
  textAlign: 'left',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};

const cardHoverStyle: CSSProperties = {
  ...cardStyle,
  borderColor: '#0070f3',
  boxShadow: '0 0 0 3px rgba(0,112,243,0.1)',
};

const iconStyle: CSSProperties = {
  fontSize: '2rem',
  marginBottom: '0.5rem',
};

const cardNameStyle: CSSProperties = {
  fontWeight: 600,
  marginBottom: '0.25rem',
  color: '#111',
};

const cardDescStyle: CSSProperties = {
  fontSize: '0.85rem',
  color: '#555',
  lineHeight: 1.4,
};

export default function Home({ onNavigate }: HomeProps) {
  return (
    <div>
      <p style={{ color: '#555', fontSize: '1.05rem', margin: 0 }}>
        Convert, merge, split, compress — all in your browser.
      </p>
      <div style={gridStyle}>
        {tools.map(({ tab, icon, name, description }) => (
          <ToolCard
            key={tab}
            icon={icon}
            name={name}
            description={description}
            onClick={() => onNavigate(tab)}
          />
        ))}
      </div>
    </div>
  );
}

function ToolCard({
  icon,
  name,
  description,
  onClick,
}: {
  icon: string;
  name: string;
  description: string;
  onClick: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={hovered ? cardHoverStyle : cardStyle}
    >
      <div style={iconStyle}>{icon}</div>
      <div style={cardNameStyle}>{name}</div>
      <div style={cardDescStyle}>{description}</div>
    </button>
  );
}
```

> Note: `React` is used for `React.useState` in `ToolCard`. Add the import at the top of the file:

```tsx
import React, { CSSProperties } from 'react';
```

Replace the first line of the file with this import.

- [ ] **Step 2: Commit**

```bash
git add src/pages/Home.tsx
git commit -m "feat: add Home page component with tool card grid"
```

---

### Task 2: Wire `Home` into `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update the `Tab` type and default tab**

In `src/App.tsx`, replace:
```ts
type Tab = 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress';
```
with:
```ts
type Tab = 'home' | 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress';
```

And replace:
```ts
const [tab, setTab] = useState<Tab>('convert');
```
with:
```ts
const [tab, setTab] = useState<Tab>('home');
```

- [ ] **Step 2: Add the Home import**

Add this import at the top of `src/App.tsx` alongside the other page imports:
```ts
import Home from './pages/Home';
```

- [ ] **Step 3: Add the Home tab button**

In the `<div role="tablist">`, add this button as the **first child** (before the PDF → PNG button):
```tsx
<button
  role="tab"
  id="tab-home"
  aria-selected={tab === 'home'}
  aria-controls="panel-home"
  style={tabStyle(tab === 'home')}
  onClick={() => setTab('home')}
>
  Home
</button>
```

- [ ] **Step 4: Add the Home tab panel**

Add this panel as the **first** `<div role="tabpanel">` (before the convert panel):
```tsx
<div
  role="tabpanel"
  id="panel-home"
  aria-labelledby="tab-home"
  hidden={tab !== 'home'}
>
  <Home onNavigate={setTab} />
</div>
```

- [ ] **Step 5: Verify in browser**

Run the dev server:
```bash
npm run dev
```

Open the app and confirm:
- "Home" tab appears first in the tab bar
- App opens on the Home tab by default
- Tagline text is visible
- Five tool cards are displayed in a grid
- Clicking each card switches to the correct tool tab
- Closing and reopening the app starts on Home

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Home tab as default landing page"
```
