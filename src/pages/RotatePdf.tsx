// src/pages/RotatePdf.tsx
import { useState, useEffect } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, degrees } from 'pdf-lib';
import FileDropZone from '../components/FileDropZone';
import { accumulateRotation } from '../lib/rotateUtils';
import type { Rotation } from '../lib/rotateUtils';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface PageEntry {
  id: string;
  index: number;
  rotation: Rotation;
  mirrorH: boolean;
  mirrorV: boolean;
}

type Status = 'idle' | 'processing' | 'done' | 'error';

const btnStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  borderRadius: 4,
  background: '#fff',
  cursor: 'pointer',
  fontSize: '0.8rem',
  padding: '2px 6px',
  color: '#333',
  lineHeight: 1.2,
};

function pageImgTransform(entry: PageEntry): string {
  const parts: string[] = [];
  if (entry.rotation !== 0) parts.push(`rotate(${entry.rotation}deg)`);
  if (entry.mirrorH) parts.push('scaleX(-1)');
  if (entry.mirrorV) parts.push('scaleY(-1)');
  return parts.join(' ');
}

export default function RotatePdf() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageEntry[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!pdfFile) return;
    let cancelled = false;

    (async () => {
      const data = new Uint8Array(await pdfFile.arrayBuffer());
      const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
      const count = pdf.numPages;

      const newPages: PageEntry[] = Array.from({ length: count }, (_, i) => ({
        id: String(i),
        index: i,
        rotation: 0,
        mirrorH: false,
        mirrorV: false,
      }));

      const thumbs: string[] = [];
      for (let i = 0; i < count; i++) {
        const page = await pdf.getPage(i + 1);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
        page.cleanup();
        thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
      }
      await pdf.destroy();

      if (!cancelled) {
        setPages(newPages);
        setThumbnails(thumbs);
        setSelected(new Set());
        setStatus('idle');
        setError('');
      }
    })().catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to read PDF');
    });

    return () => { cancelled = true; };
  }, [pdfFile]);

  const updatePages = (ids: string[], updater: (e: PageEntry) => PageEntry) => {
    setPages(prev => prev.map(e => ids.includes(e.id) ? updater(e) : e));
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectedIds = [...selected];
  const bulkActive = selectedIds.length > 0;

  const handleDownload = async () => {
    if (!pdfFile) return;
    setStatus('processing');
    setError('');
    try {
      const doc = await PDFDocument.load(await pdfFile.arrayBuffer());
      for (const entry of pages) {
        if (entry.rotation === 0 && !entry.mirrorH && !entry.mirrorV) continue;
        const page = doc.getPage(entry.index);
        if (entry.rotation !== 0) {
          page.setRotation(degrees(entry.rotation));
        }
        if (entry.mirrorH || entry.mirrorV) {
          const { width, height } = page.getSize();
          const swap = entry.rotation === 90 || entry.rotation === 270;
          const logicalW = swap ? height : width;
          const logicalH = swap ? width : height;
          page.translateContent(
            entry.mirrorH ? logicalW : 0,
            entry.mirrorV ? logicalH : 0,
          );
          page.scaleContent(
            entry.mirrorH ? -1 : 1,
            entry.mirrorV ? -1 : 1,
          );
        }
      }
      const bytes = await doc.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = pdfFile.name.replace(/\.pdf$/i, '') + '-rotated.pdf';
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
      <h2 style={{ marginTop: 0 }}>Rotate & Mirror PDF</h2>
      <FileDropZone
        onFiles={(files) => setPdfFile(files[0])}
        label="Drop a PDF file here or click to select"
        validate={(f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')}
        accept="application/pdf,.pdf"
        rejectionMessage="Only PDF files are accepted."
      />
      {error && !pages.length && (
        <p style={{ color: '#dc2626', marginTop: '0.5rem' }}>{error}</p>
      )}
      {pages.length > 0 && (
        <>
          {bulkActive && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', margin: '0.75rem 0', padding: '0.5rem 0.75rem', background: '#f0f4ff', borderRadius: 6, border: '1px solid #c7d2fe', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem', color: '#4338ca', fontWeight: 500 }}>
                {selectedIds.length} selected
              </span>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, rotation: accumulateRotation(e.rotation, -90) }))}>↺ CCW</button>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, rotation: accumulateRotation(e.rotation, 90) }))}>↻ CW</button>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, mirrorH: !e.mirrorH }))}>⇔ Flip H</button>
              <button style={btnStyle} onClick={() => updatePages(selectedIds, e => ({ ...e, mirrorV: !e.mirrorV }))}>⇕ Flip V</button>
              <button
                style={{ ...btnStyle, marginLeft: 'auto', color: '#6b7280' }}
                onClick={() => setSelected(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {pages.map((entry, i) => {
              const transform = pageImgTransform(entry);
              return (
                <div
                  key={entry.id}
                  style={{
                    position: 'relative',
                    width: 140,
                    border: `2px solid ${selected.has(entry.id) ? '#6366f1' : '#ddd'}`,
                    borderRadius: 8,
                    overflow: 'hidden',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(entry.id)}
                    onChange={() => toggleSelect(entry.id)}
                    style={{ position: 'absolute', top: 6, left: 6, zIndex: 1 }}
                  />
                  <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', overflow: 'hidden' }}>
                    {thumbnails[i] && (
                      <img
                        src={thumbnails[i]}
                        alt={`Page ${i + 1}`}
                        draggable={false}
                        style={{ maxWidth: '100%', maxHeight: '100%', transform: transform || undefined }}
                      />
                    )}
                  </div>
                  <div style={{ padding: '0.3rem 0.4rem', borderTop: '1px solid #eee' }}>
                    <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.3rem', textAlign: 'center' }}>
                      Page {i + 1}
                    </div>
                    <div style={{ display: 'flex', gap: '0.2rem', justifyContent: 'center' }}>
                      <button style={btnStyle} title="Rotate CCW" onClick={() => updatePages([entry.id], e => ({ ...e, rotation: accumulateRotation(e.rotation, -90) }))}>↺</button>
                      <button style={btnStyle} title="Rotate CW" onClick={() => updatePages([entry.id], e => ({ ...e, rotation: accumulateRotation(e.rotation, 90) }))}>↻</button>
                      <button
                        style={{ ...btnStyle, ...(entry.mirrorH ? { background: '#e0e7ff', borderColor: '#6366f1' } : {}) }}
                        title="Flip H"
                        onClick={() => updatePages([entry.id], e => ({ ...e, mirrorH: !e.mirrorH }))}
                      >
                        ⇔
                      </button>
                      <button
                        style={{ ...btnStyle, ...(entry.mirrorV ? { background: '#e0e7ff', borderColor: '#6366f1' } : {}) }}
                        title="Flip V"
                        onClick={() => updatePages([entry.id], e => ({ ...e, mirrorV: !e.mirrorV }))}
                      >
                        ⇕
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button
            onClick={handleDownload}
            disabled={status === 'processing'}
            style={{
              padding: '0.6rem 1.5rem',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: status === 'processing' ? 'not-allowed' : 'pointer',
              opacity: status === 'processing' ? 0.5 : 1,
              fontSize: '1rem',
            }}
          >
            {status === 'processing' ? 'Processing…' : 'Apply & Download'}
          </button>
          {status === 'done' && <p style={{ color: '#16a34a', marginTop: '1rem' }}>Done! Check your downloads.</p>}
          {status === 'error' && <p style={{ color: '#dc2626', marginTop: '1rem' }}>Error: {error}</p>}
        </>
      )}
    </div>
  );
}
