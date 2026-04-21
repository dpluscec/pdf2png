import { useState, CSSProperties } from 'react';

type Tab = 'home' | 'convert' | 'merge' | 'png-to-pdf' | 'split' | 'compress' | 'edit' | 'rotate';

interface HomeProps {
  onNavigate: (tab: Tab) => void;
}

const tools: { tab: Exclude<Tab, 'home'>; icon: string; name: string; description: string }[] = [
  { tab: 'convert',    icon: '🖼️', name: 'PDF → PNG',     description: 'Export each PDF page as a PNG image at configurable DPI.' },
  { tab: 'merge',      icon: '🔀', name: 'Merge PDFs',    description: 'Combine multiple PDFs into one in any order.' },
  { tab: 'png-to-pdf', icon: '📄', name: 'PNG → PDF',     description: 'Bundle PNG or JPEG images into a single PDF.' },
  { tab: 'split',      icon: '✂️', name: 'Split PDF',     description: 'Extract pages by range, list, or target file size.' },
  { tab: 'compress',   icon: '🗜️', name: 'Compress PDF',  description: 'Reduce PDF file size with adjustable compression.' },
  { tab: 'edit', icon: '✏️', name: 'Edit PDF', description: 'Add shapes, text, and signatures to any PDF page.' },
  { tab: 'rotate', icon: '🔄', name: 'Rotate PDF', description: 'Rotate pages and apply horizontal or vertical mirroring.' },
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
  const [hovered, setHovered] = useState(false);

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
