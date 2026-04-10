import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import JSZip from 'jszip';
import FileDropZone from '../components/FileDropZone';
import { splitPdfBrowser, SplitConfig, SplitResultItem } from '../lib/splitPdfBrowser';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

type Mode = 'range' | 'pages' | 'size';
type RangeType = 'custom' | 'fixed';
type PageSelection = 'all' | 'selected';
type ProcessingMode = 'browser' | 'server';
type Status = 'idle' | 'processing' | 'done' | 'error';

interface RangeRow {
  id: string;
  from: string;
  to: string;
}

function parsePageInput(text: string, total: number): number[] {
  const pages = new Set<number>();
  text
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach(part => {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(s => parseInt(s.trim(), 10));
        if (!isNaN(a) && !isNaN(b)) {
          for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
            if (i >= 1 && i <= total) pages.add(i);
          }
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n) && n >= 1 && n <= total) pages.add(n);
      }
    });
  return [...pages].sort((a, b) => a - b);
}

function pagesToText(pages: number[]): string {
  if (pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      ranges.push(start === end ? `${start}` : `${start}-${end}`);
      start = sorted[i];
      end = sorted[i];
    }
  }
  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return ranges.join(', ');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

const inputStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: '0.95rem',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#444',
};

const clearLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#0070f3',
  fontSize: '0.875rem',
  cursor: 'pointer',
  padding: 0,
};

export default function SplitPdf() {
  const [file, setFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [mode, setMode] = useState<Mode>('range');
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('browser');

  // Range mode
  const [rangeType, setRangeType] = useState<RangeType>('custom');
  const [customRanges, setCustomRanges] = useState<RangeRow[]>([{ id: '1', from: '', to: '' }]);
  const [fixedN, setFixedN] = useState(5);
  const [mergeRanges, setMergeRanges] = useState(false);

  const showClearRanges =
    customRanges.length > 1 ||
    customRanges[0].from !== '' ||
    customRanges[0].to !== '';

  // Pages mode
  const [pageSelection, setPageSelection] = useState<PageSelection>('all');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageInputText, setPageInputText] = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [thumbnailsLoading, setThumbnailsLoading] = useState(false);
  const [mergePages, setMergePages] = useState(false);

  // Size mode
  const [maxSizeMb, setMaxSizeMb] = useState(5);

  // Thumbnail load cancellation
  const currentFileRef = useRef<File | null>(null);

  // Processing state
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  // Load page count when file changes
  useEffect(() => {
    if (!file) { setTotalPages(0); setThumbnails([]); return; }
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const doc = await PDFDocument.load(buf);
        setTotalPages(doc.getPageCount());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read PDF');
        setStatus('error');
      }
    })();
  }, [file]);

  // Load thumbnails when entering pages mode with a file
  useEffect(() => {
    if (!file || mode !== 'pages' || thumbnails.length > 0) return;
    loadThumbnails(file);
  }, [file, mode, thumbnails.length]);

  async function loadThumbnails(f: File) {
    currentFileRef.current = f;
    setThumbnailsLoading(true);
    try {
      const buf = await f.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise;
      try {
        const thumbs: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          if (f !== currentFileRef.current) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.15 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
          page.cleanup();
          thumbs.push(canvas.toDataURL('image/jpeg', 0.7));
        }
        if (f === currentFileRef.current) setThumbnails(thumbs);
      } finally {
        pdf.destroy();
      }
    } catch (err) {
      if (f === currentFileRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to load page previews');
        setStatus('error');
      }
    } finally {
      if (f === currentFileRef.current) setThumbnailsLoading(false);
    }
  }

  function handleFileSelected(files: File[]) {
    const f = files[0];
    setFile(f);
    setThumbnails([]);
    setSelectedPages([]);
    setPageInputText('');
    setStatus('idle');
    setError('');
  }

  function handlePageTextChange(text: string) {
    setPageInputText(text);
    if (totalPages > 0) setSelectedPages(parsePageInput(text, totalPages));
  }

  function toggleThumbnailPage(pageNum: number) {
    const updated = selectedPages.includes(pageNum)
      ? selectedPages.filter(p => p !== pageNum)
      : [...selectedPages, pageNum].sort((a, b) => a - b);
    setSelectedPages(updated);
    setPageInputText(pagesToText(updated));
  }

  function buildConfig(): SplitConfig | null {
    if (mode === 'range') {
      if (rangeType === 'custom') {
        const ranges = customRanges
          .map(r => ({ from: parseInt(r.from, 10), to: parseInt(r.to, 10) }))
          .filter(r => !isNaN(r.from) && !isNaN(r.to) && r.from >= 1 && r.to >= r.from);
        if (ranges.length === 0) return null;
        return { mode: 'range', rangeType: 'custom', ranges, mergeAll: mergeRanges };
      }
      if (fixedN < 1) return null;
      return { mode: 'range', rangeType: 'fixed', everyN: fixedN, mergeAll: mergeRanges };
    }
    if (mode === 'pages') {
      if (pageSelection === 'all') return { mode: 'pages', pageSelection: 'all' };
      if (selectedPages.length === 0) return null;
      return { mode: 'pages', pageSelection: 'selected', pages: selectedPages, mergeSelected: mergePages };
    }
    if (maxSizeMb < 0.1) return null;
    return { mode: 'size', maxSizeMb };
  }

  const canSplit = !!file && buildConfig() !== null && status !== 'processing';

  async function handleSplit() {
    if (!file) return;
    const config = buildConfig();
    if (!config) return;

    setStatus('processing');
    setError('');

    try {
      const useBrowser = processingMode === 'browser' && mode !== 'size';

      if (useBrowser) {
        const results: SplitResultItem[] = await splitPdfBrowser(file, config);
        if (results.length === 0) throw new Error('No output produced — check your configuration');
        if (results.length === 1) {
          triggerDownload(new Blob([results[0].data.buffer as ArrayBuffer], { type: 'application/pdf' }), 'split.pdf');
        } else {
          const zip = new JSZip();
          results.forEach(r => zip.file(r.name, r.data));
          const blob = await zip.generateAsync({ type: 'blob' });
          triggerDownload(blob, 'split.zip');
        }
      } else {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('config', JSON.stringify(config));
        const response = await fetch('/api/split', { method: 'POST', body: formData });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? 'Split failed');
        }
        const contentType = response.headers.get('content-type') ?? '';
        const blob = await response.blob();
        triggerDownload(blob, contentType.includes('zip') ? 'split.zip' : 'split.pdf');
      }

      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Split PDF</h2>

      <FileDropZone
        onFiles={handleFileSelected}
        label="Drop a PDF here or click to select"
        rejectionMessage="Only PDF files are accepted"
      />

      {file && (
        <p style={{ ...labelStyle, marginTop: '-0.5rem', marginBottom: '1.25rem' }}>
          {file.name}{totalPages > 0 ? ` — ${totalPages} pages` : ''}
        </p>
      )}

      {file && (
        <>
          {/* Mode selector */}
          <div style={{ marginBottom: '1.25rem' }}>
            <strong style={labelStyle}>Mode</strong>
            <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.4rem' }}>
              {(['range', 'pages', 'size'] as Mode[]).map(m => (
                <label key={m} style={{ cursor: 'pointer', ...labelStyle }}>
                  <input
                    type="radio"
                    name="mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => setMode(m)}
                    style={{ marginRight: '0.4rem' }}
                  />
                  {m === 'range' ? 'Range' : m === 'pages' ? 'Pages' : 'Size'}
                </label>
              ))}
            </div>
          </div>

          {/* Processing toggle */}
          <div style={{ marginBottom: '1.25rem' }}>
            <strong style={labelStyle}>Processing</strong>
            {mode === 'size' ? (
              <p style={{ ...labelStyle, color: '#888', marginTop: '0.25rem', marginBottom: 0 }}>Server only</p>
            ) : (
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.4rem' }}>
                {(['browser', 'server'] as ProcessingMode[]).map(pm => (
                  <label key={pm} style={{ cursor: 'pointer', ...labelStyle }}>
                    <input
                      type="radio"
                      name="processingMode"
                      value={pm}
                      checked={processingMode === pm}
                      onChange={() => setProcessingMode(pm)}
                      style={{ marginRight: '0.4rem' }}
                    />
                    {pm === 'browser' ? 'Browser' : 'Server'}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Range mode panel */}
          {mode === 'range' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
                {(['custom', 'fixed'] as RangeType[]).map(rt => (
                  <label key={rt} style={{ cursor: 'pointer', ...labelStyle }}>
                    <input
                      type="radio"
                      name="rangeType"
                      value={rt}
                      checked={rangeType === rt}
                      onChange={() => setRangeType(rt)}
                      style={{ marginRight: '0.4rem' }}
                    />
                    {rt === 'custom' ? 'Custom ranges' : 'Fixed (every N pages)'}
                  </label>
                ))}
              </div>

              {rangeType === 'custom' && (
                <>
                  {customRanges.map((row, i) => (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
                      <span style={labelStyle}>Pages</span>
                      <input
                        type="number"
                        min={1}
                        value={row.from}
                        onChange={e => setCustomRanges(prev => prev.map((r, j) => j === i ? { ...r, from: e.target.value } : r))}
                        placeholder="From"
                        style={{ ...inputStyle, width: 70 }}
                      />
                      <span style={labelStyle}>–</span>
                      <input
                        type="number"
                        min={1}
                        value={row.to}
                        onChange={e => setCustomRanges(prev => prev.map((r, j) => j === i ? { ...r, to: e.target.value } : r))}
                        placeholder="To"
                        style={{ ...inputStyle, width: 70 }}
                      />
                      {customRanges.length > 1 && (
                        <button
                          onClick={() => setCustomRanges(prev => prev.filter((_, j) => j !== i))}
                          aria-label="Remove range"
                          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: '1rem' }}
                        >✕</button>
                      )}
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => setCustomRanges(prev => [...prev, { id: String(Date.now()), from: '', to: '' }])}
                      style={{ fontSize: '0.875rem', color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      + Add range
                    </button>
                    {showClearRanges && (
                      <button
                        type="button"
                        style={clearLinkStyle}
                        onClick={() => setCustomRanges([{ id: '1', from: '', to: '' }])}
                        aria-label="Clear all custom ranges"
                      >
                        Clear ranges
                      </button>
                    )}
                  </div>
                </>
              )}

              {rangeType === 'fixed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={labelStyle}>Every</span>
                  <input
                    type="number"
                    min={1}
                    value={fixedN}
                    onChange={e => setFixedN(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={{ ...inputStyle, width: 70 }}
                  />
                  <span style={labelStyle}>pages</span>
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={mergeRanges} onChange={e => setMergeRanges(e.target.checked)} />
                <span style={labelStyle}>Merge all ranges into one PDF</span>
              </label>
            </div>
          )}

          {/* Pages mode panel */}
          {mode === 'pages' && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '0.75rem' }}>
                {(['all', 'selected'] as PageSelection[]).map(ps => (
                  <label key={ps} style={{ cursor: 'pointer', ...labelStyle }}>
                    <input
                      type="radio"
                      name="pageSelection"
                      value={ps}
                      checked={pageSelection === ps}
                      onChange={() => setPageSelection(ps)}
                      style={{ marginRight: '0.4rem' }}
                    />
                    {ps === 'all' ? 'All pages (one PDF per page)' : 'Selected pages'}
                  </label>
                ))}
              </div>

              {pageSelection === 'selected' && (
                <>
                  <input
                    type="text"
                    value={pageInputText}
                    onChange={e => handlePageTextChange(e.target.value)}
                    placeholder="e.g. 1, 3, 5-8"
                    style={{ ...inputStyle, width: '100%', marginBottom: '0.75rem', boxSizing: 'border-box' }}
                  />

                  {thumbnailsLoading && (
                    <p style={{ ...labelStyle, color: '#888' }}>Loading page previews…</p>
                  )}

                  {!thumbnailsLoading && thumbnails.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
                      {thumbnails.map((src, i) => {
                        const pageNum = i + 1;
                        const isSelected = selectedPages.includes(pageNum);
                        return (
                          <button
                            key={i}
                            onClick={() => toggleThumbnailPage(pageNum)}
                            title={`Page ${pageNum}`}
                            style={{
                              padding: 3,
                              border: `2px solid ${isSelected ? '#0070f3' : '#ddd'}`,
                              borderRadius: 4,
                              background: isSelected ? '#e8f0fe' : '#fff',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 2,
                            }}
                          >
                            <img src={src} alt={`Page ${pageNum}`} style={{ display: 'block', maxWidth: 60, maxHeight: 80 }} />
                            <span style={{ fontSize: '0.7rem', color: '#555' }}>{pageNum}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={mergePages} onChange={e => setMergePages(e.target.checked)} />
                    <span style={labelStyle}>Merge selected pages into one PDF</span>
                  </label>
                </>
              )}
            </div>
          )}

          {/* Size mode panel */}
          {mode === 'size' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <span style={labelStyle}>Max size per chunk</span>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={maxSizeMb}
                onChange={e => setMaxSizeMb(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                style={{ ...inputStyle, width: 80 }}
              />
              <span style={labelStyle}>MB</span>
            </div>
          )}

          {/* Split button */}
          <button
            onClick={handleSplit}
            disabled={!canSplit}
            style={{
              marginTop: '0.5rem',
              padding: '0.6rem 1.5rem',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: canSplit ? 'pointer' : 'not-allowed',
              opacity: canSplit ? 1 : 0.5,
              fontSize: '1rem',
            }}
          >
            {status === 'processing' ? 'Splitting…' : 'Split & Download'}
          </button>

          {status === 'done' && (
            <p style={{ color: 'green', marginTop: '1rem' }}>Done! Check your downloads.</p>
          )}
          {status === 'error' && (
            <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>
          )}
        </>
      )}
    </div>
  );
}
