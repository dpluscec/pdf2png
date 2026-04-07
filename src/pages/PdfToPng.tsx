import { useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import FileDropZone from '../components/FileDropZone';

// Point pdfjs at the bundled worker — Vite resolves the URL at build time
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

type Mode = 'browser' | 'server';
type Status = 'idle' | 'processing' | 'done' | 'error';

async function convertBrowser(file: File, dpi: number): Promise<void> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const zip = new JSZip();
  const scale = dpi / 72;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));
    zip.file(`page-${String(i).padStart(3, '0')}.png`, blob);
    page.cleanup();
  }

  const content = await zip.generateAsync({ type: 'blob' });
  triggerDownload(content, `${file.name.replace(/\.pdf$/i, '')}-pages.zip`);
}

async function convertServer(file: File, dpi: number): Promise<void> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`/api/convert?dpi=${dpi}`, { method: 'POST', body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Server conversion failed');
  }
  const blob = await response.blob();
  triggerDownload(blob, `${file.name.replace(/\.pdf$/i, '')}-pages.zip`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export default function PdfToPng() {
  const [file, setFile] = useState<File | null>(null);
  const [dpi, setDpi] = useState(150);
  const [mode, setMode] = useState<Mode>('browser');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const handleFile = (files: File[]) => {
    setFile(files[0]);
    setStatus('idle');
    setError('');
  };

  const handleConvert = async () => {
    if (!file) return;
    setStatus('processing');
    setError('');
    try {
      if (mode === 'browser') {
        await convertBrowser(file, dpi);
      } else {
        await convertServer(file, dpi);
      }
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>PDF → PNG</h2>
      <FileDropZone onFiles={handleFile} />
      {file && <p style={{ margin: '0 0 1rem', color: '#555' }}>Selected: {file.name}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          DPI:
          <input
            type="number"
            value={dpi}
            min={72}
            max={600}
            onChange={(e) => setDpi(Math.min(600, Math.max(72, Number(e.target.value))))}
            style={{ width: 70, padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4 }}
          />
        </label>

        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Processing mode</legend>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {(['browser', 'server'] as Mode[]).map((m) => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                />
                {m === 'browser' ? 'Browser (no upload)' : 'Server'}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <button
        onClick={handleConvert}
        disabled={!file || status === 'processing'}
        style={{
          padding: '0.6rem 1.5rem',
          background: '#0070f3',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          cursor: !file || status === 'processing' ? 'not-allowed' : 'pointer',
          opacity: !file || status === 'processing' ? 0.5 : 1,
          fontSize: '1rem',
        }}
      >
        {status === 'processing' ? 'Converting…' : 'Convert & Download'}
      </button>

      {status === 'done' && <p style={{ color: 'green', marginTop: '1rem' }}>Done! Check your downloads.</p>}
      {status === 'error' && <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>}
    </div>
  );
}
