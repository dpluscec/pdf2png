import { useState, useCallback } from 'react';
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
import type { PdfEntry } from './PdfToPng';

const clearLinkStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#0070f3',
  fontSize: '0.875rem',
  cursor: 'pointer',
  padding: 0,
};

type CompressionLevel = 'maximum' | 'balanced' | 'quality';
type GroupStatus = 'idle' | 'processing' | 'done' | 'error';

const LEVEL_LABELS: Record<CompressionLevel, string> = {
  maximum: 'Maximum',
  balanced: 'Balanced',
  quality: 'High Quality',
};

const LEVEL_DESCRIPTIONS: Record<CompressionLevel, string> = {
  maximum: 'Smallest file, lower quality',
  balanced: 'Good compression, good quality',
  quality: 'Minimal quality loss, less compression',
};

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

function deduplicateOutputNames(entries: PdfEntry[]): string[] {
  const names = entries.map((e) => `${stemName(e.file)}-compressed.pdf`);
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  const seen = new Map<string, number>();
  return names.map((n) => {
    if (counts.get(n)! <= 1) return n;
    const i = (seen.get(n) ?? 0) + 1;
    seen.set(n, i);
    return n.replace(/\.pdf$/, `_${i}.pdf`);
  });
}

async function compressServer(file: File, level: CompressionLevel): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`/api/compress?level=${level}`, { method: 'POST', body: formData });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Compression failed');
  }
  return response.blob();
}

export default function CompressPdf() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [level, setLevel] = useState<CompressionLevel>('balanced');
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

  const compressEntry = async (entry: PdfEntry, compressionLevel: CompressionLevel): Promise<Blob | null> => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, status: 'processing', error: '' } : e))
    );
    try {
      const blob = await compressServer(entry.file, compressionLevel);
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

  const handleCompressOne = useCallback(async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const blob = await compressEntry(entry, level);
    if (blob) triggerDownload(blob, `${stemName(entry.file)}-compressed.pdf`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, level]);

  const handleCompressAll = useCallback(async () => {
    const idleEntries = entries.filter((e) => e.status === 'idle');
    if (idleEntries.length === 0) {
      setGroupStatus('idle');
      return;
    }

    setGroupStatus('processing');
    const outputNames = deduplicateOutputNames(idleEntries);
    const results: Array<{ blob: Blob; name: string }> = [];

    for (let i = 0; i < idleEntries.length; i++) {
      const blob = await compressEntry(idleEntries[i], level);
      if (blob) results.push({ blob, name: outputNames[i] });
    }

    if (results.length === 0) {
      setGroupStatus('error');
      return;
    }

    if (results.length === 1) {
      triggerDownload(results[0].blob, results[0].name);
    } else {
      const zip = new JSZip();
      for (const { blob, name } of results) {
        zip.file(name, blob);
      }
      triggerDownload(await zip.generateAsync({ type: 'blob' }), 'compressed.zip');
    }

    setGroupStatus('done');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, level]);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Compress PDF</h2>

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
        <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', gap: '1rem' }}>
          <legend style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
            Compression level
          </legend>
          {(Object.keys(LEVEL_LABELS) as CompressionLevel[]).map((l) => (
            <label
              key={l}
              style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', fontSize: '0.875rem' }}
              title={LEVEL_DESCRIPTIONS[l]}
            >
              <input
                type="radio"
                name="compress-level"
                value={l}
                checked={level === l}
                onChange={() => setLevel(l)}
              />
              {LEVEL_LABELS[l]}
            </label>
          ))}
        </fieldset>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', cursor: 'pointer', fontSize: '0.875rem' }}>
          <input type="checkbox" checked={showPreview} onChange={handleTogglePreview} />
          Preview
        </label>

        <button
          onClick={handleCompressAll}
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
          {groupStatus === 'processing' ? 'Compressing…' : 'Compress All'}
        </button>
      </div>

      {/* Drop zone */}
      <FileDropZone multiple onFiles={handleFiles} />

      {/* Card grid */}
      {entries.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontSize: '0.875rem', color: '#555' }}>
            <span>{entries.length} {entries.length === 1 ? 'file' : 'files'}</span>
            <span>·</span>
            <button
              type="button"
              style={clearLinkStyle}
              onClick={() => setEntries([])}
              aria-label={`Clear all ${entries.length} ${entries.length === 1 ? 'file' : 'files'}`}
            >
              Clear all
            </button>
          </div>
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
                    onConvert={() => handleCompressOne(entry.id)}
                    onRemove={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                    onMetadata={handleMetadata}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}

      {groupStatus === 'done' && (
        <p style={{ color: '#16a34a', marginTop: '1rem' }}>All done! Check your downloads.</p>
      )}
      {groupStatus === 'error' && (
        <p style={{ color: '#dc2626', marginTop: '1rem' }}>All compressions failed. Check individual file errors above.</p>
      )}
    </div>
  );
}
