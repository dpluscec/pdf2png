import { useState } from 'react';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FileDropZone from '../components/FileDropZone';

type Status = 'idle' | 'processing' | 'done' | 'error';

interface FileItem {
  id: string;
  file: File;
}

function SortableFile({ item, onRemove }: { item: FileItem; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.6rem 0.75rem',
        border: '1px solid #ddd',
        borderRadius: 6,
        marginBottom: '0.5rem',
        background: '#fafafa',
      }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', fontSize: '1.1rem', color: '#aaa', lineHeight: 1 }}
        title="Drag to reorder"
      >
        ⠿
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.file.name}
      </span>
      <button
        onClick={onRemove}
        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: '1rem' }}
        aria-label={`Remove ${item.file.name}`}
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}

export default function MergePdf() {
  const [items, setItems] = useState<FileItem[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFiles = (files: File[]) => {
    const newItems: FileItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
    }));
    setItems((prev) => [...prev, ...newItems]);
    setStatus('idle');
    setError('');
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === active.id);
        const newIndex = prev.findIndex((i) => i.id === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleMerge = async () => {
    setStatus('processing');
    setError('');
    try {
      const formData = new FormData();
      items.forEach((item) => formData.append('files', item.file));

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
      <FileDropZone multiple onFiles={handleFiles} label="Drop PDF files here or click to select" />

      {items.length > 0 && (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item) => (
                <SortableFile
                  key={item.id}
                  item={item}
                  onRemove={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                />
              ))}
            </SortableContext>
          </DndContext>

          <button
            onClick={handleMerge}
            disabled={items.length < 2 || status === 'processing'}
            style={{
              marginTop: '1rem',
              padding: '0.6rem 1.5rem',
              background: '#0070f3',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              cursor: items.length < 2 || status === 'processing' ? 'not-allowed' : 'pointer',
              opacity: items.length < 2 || status === 'processing' ? 0.5 : 1,
              fontSize: '1rem',
            }}
          >
            {status === 'processing' ? 'Merging…' : 'Merge & Download'}
          </button>
        </>
      )}

      {status === 'done' && <p style={{ color: 'green', marginTop: '1rem' }}>Done! Check your downloads.</p>}
      {status === 'error' && <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>}
    </div>
  );
}
