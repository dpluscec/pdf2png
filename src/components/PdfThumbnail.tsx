import { useEffect, useState, memo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

// Worker URL is set by PdfToPng.tsx before any component using pdfjs renders.
// PdfThumbnail relies on that setup.

interface Props {
  file: File;
  showPreview: boolean;
  onMetadata: (pageCount: number, thumbnail: string | null) => void;
}

function PdfIcon() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120, background: '#f9fafb' }}>
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="52" height="52" rx="6" fill="#fee2e2" />
        <path d="M13 7h18l12 12v26H13V7z" fill="#ef4444" />
        <path d="M31 7l12 12H31V7z" fill="#fca5a5" />
        <text x="26" y="38" textAnchor="middle" fontSize="10" fill="white" fontWeight="bold" fontFamily="system-ui, sans-serif">PDF</text>
      </svg>
    </div>
  );
}

// Memoized: only re-runs effect when file identity or showPreview changes.
const PdfThumbnail = memo(
  function PdfThumbnail({ file, showPreview, onMetadata }: Props) {
    const [src, setSrc] = useState<string | null>(null);

    useEffect(() => {
      let cancelled = false;

      (async () => {
        const data = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise;
        const pageCount = pdf.numPages;

        if (!showPreview) {
          if (!cancelled) {
            setSrc(null); // clear any previously rendered thumbnail
            onMetadata(pageCount, null);
          }
          return;
        }

        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 }); // scale 1 = 72 DPI
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({
          canvasContext: canvas.getContext('2d')!,
          viewport,
        }).promise;
        page.cleanup();

        const thumbnailSrc = canvas.toDataURL('image/jpeg', 0.7);
        if (!cancelled) {
          setSrc(thumbnailSrc);
          onMetadata(pageCount, thumbnailSrc);
        }
      })().catch((err) => {
        console.warn('PdfThumbnail: failed to load PDF', err);
        if (!cancelled) onMetadata(0, null);
      });

      return () => {
        cancelled = true;
      };
      // onMetadata intentionally excluded from deps — stable via useCallback in parent
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file, showPreview]);

    if (src) {
      return (
        <img
          src={src}
          alt="PDF first page preview"
          style={{ width: '100%', height: 120, objectFit: 'contain', display: 'block', background: '#f9fafb' }}
        />
      );
    }

    return <PdfIcon />;
  },
  (prev, next) => prev.file === next.file && prev.showPreview === next.showPreview
);

export default PdfThumbnail;
