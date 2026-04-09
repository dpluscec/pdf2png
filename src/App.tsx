import { useState } from 'react';
import PdfToPng from './pages/PdfToPng';
import MergePdf from './pages/MergePdf';
import PngToPdf from './pages/PngToPdf';
import SplitPdf from './pages/SplitPdf';

type Tab = 'convert' | 'merge' | 'png-to-pdf' | 'split';

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
        <button
          role="tab"
          id="tab-split"
          aria-selected={tab === 'split'}
          aria-controls="panel-split"
          style={tabStyle(tab === 'split')}
          onClick={() => setTab('split')}
        >
          Split PDF
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
      <div
        role="tabpanel"
        id="panel-split"
        aria-labelledby="tab-split"
        hidden={tab !== 'split'}
      >
        <SplitPdf />
      </div>
    </div>
  );
}
