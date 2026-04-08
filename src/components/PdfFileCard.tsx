import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import PdfThumbnail from './PdfThumbnail';
import type { PdfEntry } from '../pages/PdfToPng';

interface Props {
  entry: PdfEntry;
  showPreview: boolean;
  onConvert: () => void;
  onRemove: () => void;
  onMetadata: (id: string, pageCount: number, thumbnail: string | null) => void;
}

const STATUS_COLOR: Record<PdfEntry['status'], string> = {
  idle: '#9ca3af',
  processing: '#0070f3',
  done: '#16a34a',
  error: '#dc2626',
};

const STATUS_LABEL: Record<PdfEntry['status'], string> = {
  idle: 'Ready',
  processing: 'Converting…',
  done: 'Done',
  error: 'Error',
};

export default function PdfFileCard({ entry, showPreview, onConvert, onRemove, onMetadata }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        background: '#fff',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
      }}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        style={{
          padding: '0.25rem',
          textAlign: 'center',
          cursor: 'grab',
          color: '#d1d5db',
          fontSize: '0.7rem',
          background: '#f9fafb',
          borderBottom: '1px solid #f3f4f6',
          lineHeight: 1.2,
          userSelect: 'none',
        }}
        title="Drag to reorder"
      >
        ⠿⠿⠿
      </div>

      {/* Thumbnail or icon */}
      <PdfThumbnail
        file={entry.file}
        showPreview={showPreview}
        onMetadata={(pageCount, thumbnail) => onMetadata(entry.id, pageCount, thumbnail)}
      />

      {/* Info */}
      <div style={{ padding: '0.5rem 0.6rem', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <p
          title={entry.file.name}
          style={{
            margin: 0,
            fontSize: '0.8rem',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: '#111',
          }}
        >
          {entry.file.name}
        </p>
        <p style={{ margin: 0, fontSize: '0.72rem', color: '#9ca3af' }}>
          {entry.pageCount === null ? '— pages' : `${entry.pageCount} ${entry.pageCount === 1 ? 'page' : 'pages'}`}
        </p>
        <span style={{ fontSize: '0.72rem', color: STATUS_COLOR[entry.status], fontWeight: 500 }}>
          {STATUS_LABEL[entry.status]}
          {entry.status === 'error' && entry.error ? `: ${entry.error}` : ''}
        </span>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.25rem', padding: '0.35rem 0.5rem', borderTop: '1px solid #f3f4f6' }}>
        <button
          onClick={onConvert}
          disabled={entry.status === 'processing'}
          style={{
            flex: 1,
            padding: '0.3rem 0',
            background: entry.status === 'processing' ? '#e5e7eb' : '#0070f3',
            color: entry.status === 'processing' ? '#9ca3af' : '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: entry.status === 'processing' ? 'not-allowed' : 'pointer',
            fontSize: '0.75rem',
            fontWeight: 500,
          }}
        >
          Convert
        </button>
        <button
          onClick={onRemove}
          aria-label={`Remove ${entry.file.name}`}
          title="Remove"
          style={{
            padding: '0.3rem 0.5rem',
            background: 'none',
            border: '1px solid #e5e7eb',
            borderRadius: 4,
            cursor: 'pointer',
            color: '#9ca3af',
            fontSize: '0.75rem',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
