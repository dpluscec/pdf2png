import { useRef, useState, DragEvent, ChangeEvent } from 'react';

interface Props {
  multiple?: boolean;
  compact?: boolean;
  onFiles: (files: File[]) => void;
  label?: string;
}

function isPdf(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  );
}

export default function FileDropZone({ multiple = false, compact = false, onFiles, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState('');

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const all = Array.from(e.dataTransfer.files);
    const pdfs = all.filter(isPdf);
    if (pdfs.length === 0) {
      setRejection('No PDF files found in the dropped items.');
      return;
    }
    setRejection('');
    onFiles(pdfs);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      onFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const dragHandlers = {
    onDrop: handleDrop,
    onDragOver: (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
    },
    onClick: () => { setRejection(''); inputRef.current?.click(); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); },
  };

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf,.pdf"
      multiple={multiple}
      onChange={handleChange}
      style={{ display: 'none' }}
    />
  );

  if (compact) {
    return (
      <div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Add more PDF files"
          {...dragHandlers}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.9rem',
            border: `1px dashed ${dragging ? '#0070f3' : '#bbb'}`,
            borderRadius: 6,
            cursor: 'pointer',
            color: dragging ? '#0070f3' : '#777',
            fontSize: '0.85rem',
            marginBottom: '1rem',
            background: dragging ? '#f0f7ff' : 'transparent',
            transition: 'border-color 0.15s, color 0.15s',
            userSelect: 'none',
          }}
        >
          + Add more files
          {hiddenInput}
        </div>
        {rejection && (
          <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: '0 0 0.5rem' }} role="alert">
            {rejection}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-label={label ?? 'Drop PDF file here or click to select'}
        {...dragHandlers}
        style={{
          border: `2px dashed ${dragging ? '#0070f3' : '#aaa'}`,
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
          cursor: 'pointer',
          color: dragging ? '#0070f3' : '#666',
          marginBottom: rejection ? '0.25rem' : '1rem',
          userSelect: 'none',
          transition: 'border-color 0.15s, color 0.15s',
          background: dragging ? '#f0f7ff' : 'transparent',
        }}
      >
        {label ?? 'Drop PDF file here or click to select'}
        {hiddenInput}
      </div>
      {rejection && (
        <p style={{ color: '#c0392b', fontSize: '0.85rem', margin: '0 0 1rem' }} role="alert">
          {rejection}
        </p>
      )}
    </div>
  );
}
