import { useState, useEffect, useRef } from 'react';
import { PDFDocument } from 'pdf-lib';
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
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FileDropZone from '../components/FileDropZone';

type PageSize = 'original' | 'a4' | 'letter' | 'a3';
type Mode = 'browser' | 'server';
type Status = 'idle' | 'processing' | 'done' | 'error';

interface ImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'original'>, [number, number]> = {
  a4: [595, 842],
  letter: [612, 792],
  a3: [842, 1191],
};

const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  original: 'Original (image dimensions)',
  a4: 'A4 (595 × 842 pt)',
  letter: 'Letter (612 × 792 pt)',
  a3: 'A3 (842 × 1191 pt)',
};

function isImage(file: File): boolean {
  return (
    file.type === 'image/png' ||
    file.type === 'image/jpeg' ||
    file.name.toLowerCase().endsWith('.png') ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg')
  );
}

function isJpeg(file: File): boolean {
  return (
    file.type === 'image/jpeg' ||
    file.name.toLowerCase().endsWith('.jpg') ||
    file.name.toLowerCase().endsWith('.jpeg')
  );
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function outputFilename(items: ImageItem[]): string {
  if (items.length === 1) {
    return items[0].file.name.replace(/\.[^.]+$/, '') + '.pdf';
  }
  return 'images.pdf';
}

async function convertBrowser(items: ImageItem[], pageSize: PageSize): Promise<void> {
  const doc = await PDFDocument.create();

  for (const item of items) {
    const buffer = await item.file.arrayBuffer();
    const pdfImage = isJpeg(item.file)
      ? await doc.embedJpg(buffer)
      : await doc.embedPng(buffer);

    let pageW: number;
    let pageH: number;

    if (pageSize === 'original') {
      pageW = pdfImage.width;
      pageH = pdfImage.height;
    } else {
      [pageW, pageH] = PAGE_DIMENSIONS[pageSize];
    }

    const page = doc.addPage([pageW, pageH]);

    if (pageSize === 'original') {
      page.drawImage(pdfImage, { x: 0, y: 0, width: pageW, height: pageH });
    } else {
      const scale = Math.min(pageW / pdfImage.width, pageH / pdfImage.height);
      const width = pdfImage.width * scale;
      const height = pdfImage.height * scale;
      const x = (pageW - width) / 2;
      const y = (pageH - height) / 2;
      page.drawImage(pdfImage, { x, y, width, height });
    }
  }

  const bytes = await doc.save();
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  triggerDownload(blob, outputFilename(items));
}

async function convertServer(items: ImageItem[], pageSize: PageSize): Promise<void> {
  const formData = new FormData();
  items.forEach((item) => formData.append('files', item.file));
  const response = await fetch(`/api/png-to-pdf?pageSize=${pageSize}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Server conversion failed');
  }
  const blob = await response.blob();
  triggerDownload(blob, outputFilename(items));
}

function SortableImageCard({
  item,
  cardSize,
  onRemove,
}: {
  item: ImageItem;
  cardSize: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        width: cardSize,
        border: '1px solid #ddd',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
        cursor: 'grab',
        userSelect: 'none',
        boxSizing: 'border-box',
      }}
      {...attributes}
      {...listeners}
    >
      <img
        src={item.previewUrl}
        alt={item.file.name}
        style={{
          width: '100%',
          height: cardSize,
          objectFit: 'contain',
          display: 'block',
          background: '#f5f5f5',
        }}
        draggable={false}
      />
      <div
        style={{
          padding: '0.4rem 0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          borderTop: '1px solid #eee',
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: '0.75rem',
            color: '#555',
          }}
          title={item.file.name}
        >
          {item.file.name}
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          style={{
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            color: '#999',
            fontSize: '1rem',
            flexShrink: 0,
            lineHeight: 1,
            padding: 0,
          }}
          aria-label={`Remove ${item.file.name}`}
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function PngToPdf() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [cardSize, setCardSize] = useState(150);
  const [pageSize, setPageSize] = useState<PageSize>('original');
  const [mode, setMode] = useState<Mode>('browser');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Revoke all object URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFiles = (files: File[]) => {
    const newItems: ImageItem[] = files.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...newItems]);
    setStatus('idle');
    setError('');
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
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

  const handleConvert = async () => {
    if (items.length === 0) return;
    setStatus('processing');
    setError('');
    try {
      if (mode === 'browser') {
        await convertBrowser(items, pageSize);
      } else {
        await convertServer(items, pageSize);
      }
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  };

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>PNG / JPEG → PDF</h2>

      <FileDropZone
        multiple
        onFiles={handleFiles}
        label="Drop PNG or JPEG files here or click to select"
        validate={isImage}
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        rejectionMessage="No PNG or JPEG files found in the dropped items."
      />

      {items.length > 0 && (
        <>
          {/* Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.5rem',
              marginBottom: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Card size:
              <input
                type="range"
                min={100}
                max={300}
                value={cardSize}
                onChange={(e) => setCardSize(Number(e.target.value))}
                style={{ width: 100 }}
              />
              <span style={{ fontSize: '0.85rem', color: '#666', width: 36 }}>{cardSize}px</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              Page size:
              <select
                value={pageSize}
                onChange={(e) => setPageSize(e.target.value as PageSize)}
                style={{ padding: '0.3rem', border: '1px solid #ccc', borderRadius: 4 }}
              >
                {(Object.entries(PAGE_SIZE_LABELS) as [PageSize, string][]).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend style={{ fontWeight: 500, marginBottom: '0.25rem' }}>Processing mode</legend>
              <div style={{ display: 'flex', gap: '1rem' }}>
                {(['browser', 'server'] as Mode[]).map((m) => (
                  <label
                    key={m}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="png-to-pdf-mode"
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

          {/* Card grid */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                }}
              >
                {items.map((item) => (
                  <SortableImageCard
                    key={item.id}
                    item={item}
                    cardSize={cardSize}
                    onRemove={() => removeItem(item.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Convert button */}
          <button
            onClick={handleConvert}
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
            {status === 'processing' ? 'Converting…' : 'Convert & Download'}
          </button>
        </>
      )}

      {status === 'done' && (
        <p style={{ color: 'green', marginTop: '1rem' }}>Done! Check your downloads.</p>
      )}
      {status === 'error' && (
        <p style={{ color: 'red', marginTop: '1rem' }}>Error: {error}</p>
      )}
    </div>
  );
}
