import { useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import JSZip from 'jszip';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import FileDropZone from '../components/FileDropZone';
import PdfFileCard from '../components/PdfFileCard';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

export interface PdfEntry {
  id: string;
  file: File;
  pageCount: number | null;
  thumbnail: string | null;
  status: 'idle' | 'processing' | 'done' | 'error';
  error: string;
}

type Mode = 'browser' | 'server';
type GroupStatus = 'idle' | 'processing' | 'done' | 'error';

function stemName(file: File): string {
  return file.name.replace(/\.pdf$/i, '');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

async function convertBrowser(file: File, dpi: number, folderName: string): Promise<Blob> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const zip = new JSZip();
  const scale = dpi / 72;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d') as CanvasRenderingContext2D, viewport }).promise;
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    zip.file(`${folderName}/page-${String(i).padStart(3, '0')}.png`, blob);
    page.cleanup();
  }

  return zip.generateAsync({ type: 'blob' });
}

async function convertServer(file: File, dpi: number, folderName: string): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`/api/convert?dpi=${dpi}`, { method: 'POST', body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Server conversion failed');
  }

  // Server returns flat zip (page-001.png, ...); repack into subfolder client-side
  const serverZip = await JSZip.loadAsync(await response.blob());
  const outZip = new JSZip();
  await Promise.all(
    Object.entries(serverZip.files)
      .filter(([, f]) => !f.dir)
      .map(async ([name, f]) => {
        outZip.file(`${folderName}/${name}`, await f.async('blob'));
      })
  );
  return outZip.generateAsync({ type: 'blob' });
}

export default function PdfToPng() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [dpi, setDpi] = useState(150);
  const [mode, setMode] = useState<Mode>('browser');
  const [showPreview, setShowPreview] = useState(true);
  const [groupStatus, setGroupStatus] = useState<GroupStatus>('idle');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFiles = (files: File[]) => {
    const newEntries: PdfEntry[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      pageCount: null,
      thumbnail: null,
      status: 'idle',
      error: '',
    }));
    setEntries((prev) => [...prev, ...newEntries]);
    setGroupStatus('idle');
  };

  const handleMetadata = useCallback((id: string, pageCount: number, thumbnail: string | null) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, pageCount, thumbnail } : e))
    );
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setEntries((prev) => {
        const oldIndex = prev.findIndex((e) => e.id === active.id);
        const newIndex = prev.findIndex((e) => e.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleTogglePreview = () => {
    const next = !showPreview;
    setShowPreview(next);
    if (!next) {
      setEntries((prev) => prev.map((e) => ({ ...e, thumbnail: null })));
    }
  };

  // Converts a single entry and returns its zip blob (or null on error).
  // Updates entry status in state.
  const convertEntry = async (entry: PdfEntry): Promise<Blob | null> => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, status: 'processing', error: '' } : e))
    );
    try {
      const folder = stemName(entry.file);
      const blob =
        mode === 'browser'
          ? await convertBrowser(entry.file, dpi, folder)
          : await convertServer(entry.file, dpi, folder);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: 'done' } : e))
      );
      return blob;
    } catch (err) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? { ...e, status: 'error', error: err instanceof Error ? err.message : 'Unknown error' }
            : e
        )
      );
      return null;
    }
  };

  const handleConvertOne = useCallback(async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const blob = await convertEntry(entry);
    if (blob) triggerDownload(blob, `${stemName(entry.file)}-pages.zip`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, mode, dpi]);

  const handleConvertAll = useCallback(async () => {
    const idleEntries = entries.filter((e) => e.status === 'idle');
    if (idleEntries.length === 0) {
      setGroupStatus('idle');
      return;
    }

    setGroupStatus('processing');
    const blobs: Blob[] = [];

    for (const entry of idleEntries) {
      const blob = await convertEntry(entry);
      if (blob) blobs.push(blob);
    }

    if (blobs.length === 0) {
      setGroupStatus('error');
      return;
    }

    // Merge all per-file zips into one combined zip
    const combined = new JSZip();
    for (const blob of blobs) {
      const z = await JSZip.loadAsync(blob);
      await Promise.all(
        Object.entries(z.files)
          .filter(([, f]) => !f.dir)
          .map(async ([name, f]) => {
            combined.file(name, await f.async('blob'));
          })
      );
    }

    triggerDownload(await combined.generateAsync({ type: 'blob' }), 'converted.zip');
    setGroupStatus('done');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, mode, dpi]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>PDF → PNG</h2>

      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.25rem',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          padding: '0.75rem',
          background: '#f9fafb',
          borderRadius: 8,
          border: '1px solid #f3f4f6',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}>
          DPI:
          <input
            type="number"
            value={dpi}
            min={72}
            max={600}
            onChange={(e) => setDpi(Math.min(600, Math.max(72, Number(e.target.value))))}
            style={{ width: 65, padding: '0.25rem 0.4rem', border: '1px solid #d1d5db', borderRadius: 4, fontSize: '0.875rem' }}
          />
        </label>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {(['browser', 'server'] as Mode[]).map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.875rem' }}>
              <input type="radio" name="pdf-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
              {m === 'browser' ? 'Browser' : 'Server'}
            </label>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.875rem' }}>
          <input type="checkbox" checked={showPreview} onChange={handleTogglePreview} />
          Preview
        </label>

        <button
          onClick={handleConvertAll}
          disabled={entries.length === 0 || groupStatus === 'processing'}
          style={{
            marginLeft: 'auto',
            padding: '0.45rem 1.1rem',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: entries.length === 0 || groupStatus === 'processing' ? 'not-allowed' : 'pointer',
            opacity: entries.length === 0 || groupStatus === 'processing' ? 0.5 : 1,
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {groupStatus === 'processing' ? 'Converting…' : 'Convert All'}
        </button>
      </div>

      {/* Drop zone — compact when files are loaded */}
      <FileDropZone
        multiple
        compact={entries.length > 0}
        onFiles={handleFiles}
      />

      {/* Card grid */}
      {entries.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={entries.map((e) => e.id)} strategy={rectSortingStrategy}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                gap: '0.75rem',
                marginTop: '0.5rem',
              }}
            >
              {entries.map((entry) => (
                <PdfFileCard
                  key={entry.id}
                  entry={entry}
                  showPreview={showPreview}
                  onConvert={() => handleConvertOne(entry.id)}
                  onRemove={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                  onMetadata={handleMetadata}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {groupStatus === 'done' && (
        <p style={{ color: '#16a34a', marginTop: '1rem' }}>All done! Check your downloads.</p>
      )}
      {groupStatus === 'error' && (
        <p style={{ color: '#dc2626', marginTop: '1rem' }}>All conversions failed. Check individual file errors above.</p>
      )}
    </div>
  );
}
