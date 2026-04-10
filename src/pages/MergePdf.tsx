import { useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
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
import type { PdfEntry } from '../lib/pdfTypes';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

type Status = 'idle' | 'processing' | 'done' | 'error';

export default function MergePdf() {
  const [entries, setEntries] = useState<PdfEntry[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

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
    setStatus('idle');
    setError('');
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

  const handleMerge = async () => {
    setStatus('processing');
    setError('');
    try {
      const formData = new FormData();
      entries.forEach((entry) => formData.append('files', entry.file));

      const response = await fetch('/api/merge', { method: 'POST', body: formData });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Merge failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'merged.pdf';
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
      <h2 style={{ marginTop: 0 }}>Merge PDFs</h2>

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
        <span style={{ fontSize: '0.875rem', color: '#6b7280' }}>
          {entries.length === 0
            ? 'No files added'
            : `${entries.length} file${entries.length === 1 ? '' : 's'} — drag to reorder`}
        </span>
        <button
          onClick={handleMerge}
          disabled={entries.length < 2 || status === 'processing'}
          style={{
            marginLeft: 'auto',
            padding: '0.45rem 1.1rem',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            cursor: entries.length < 2 || status === 'processing' ? 'not-allowed' : 'pointer',
            opacity: entries.length < 2 || status === 'processing' ? 0.5 : 1,
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {status === 'processing' ? 'Merging\u2026' : 'Merge & Download'}
        </button>
      </div>

      <FileDropZone multiple onFiles={handleFiles} label="Drop PDF files here or click to select" />

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
                  showPreview
                  onRemove={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))}
                  onMetadata={handleMetadata}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {status === 'done' && <p style={{ color: '#16a34a', marginTop: '1rem' }}>Done! Check your downloads.</p>}
      {status === 'error' && <p style={{ color: '#dc2626', marginTop: '1rem' }}>Error: {error}</p>}
    </div>
  );
}
