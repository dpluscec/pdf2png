import { useState, useRef, useEffect, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import FileDropZone from '../components/FileDropZone';
import AnnotationCanvas from '../components/editor/AnnotationCanvas';
import EditorToolbar from '../components/editor/EditorToolbar';
import SignatureManager from '../components/editor/SignatureManager';
import type { AnnotationCanvasHandle } from '../components/editor/AnnotationCanvas';
import type { ToolType, StyleState, SavedSignature } from '../lib/editor/types';
import { DEFAULT_STYLE } from '../lib/editor/types';
import {
  hashFile,
  saveAnnotations,
  loadAnnotations,
  clearAnnotations,
  loadSignatures,
  getStorageUsageBytes,
  clearAllEditorData,
} from '../lib/editor/persistence';
import { flattenToPdf, exportAnnotated, downloadBlob } from '../lib/editor/pdfExport';
import type { PageExportData } from '../lib/editor/pdfExport';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

const RENDER_SCALE = 1.5;
const FONT_URLS = {
  regular: '/fonts/NotoSans-Regular.ttf',
  mono: '/fonts/NotoSansMono-Regular.ttf',
  cursive: '/fonts/DancingScript-Regular.ttf',
};

export default function EditPdf() {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pages, setPages] = useState<PDFPageProxy[]>([]);
  const [filename, setFilename] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [originalPdfBytes, setOriginalPdfBytes] = useState<Uint8Array | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('select');
  const [style, setStyle] = useState<StyleState>(DEFAULT_STYLE);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const [signatures, setSignatures] = useState<SavedSignature[]>(() => loadSignatures());
  const [activeSignatureId, setActiveSignatureId] = useState<string | null>(null);
  const [showSignatureManager, setShowSignatureManager] = useState(false);

  const [showRestoreBanner, setShowRestoreBanner] = useState(false);
  const [pendingSession, setPendingSession] = useState<object[] | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [storageBytes, setStorageBytes] = useState(() => getStorageUsageBytes());
  const [shouldRestore, setShouldRestore] = useState(false);

  // One ref per page
  const canvasRefs = useRef<(AnnotationCanvasHandle | null)[]>([]);
  // Current page annotation JSONs (source of truth for save/export)
  const pageAnnotationsRef = useRef<object[]>([]);

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSave = useCallback(() => {
    if (!fileHash || !filename) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAnnotations(fileHash, {
        filename,
        pages: pageAnnotationsRef.current,
        savedAt: new Date().toISOString(),
      });
      setStorageBytes(getStorageUsageBytes());
    }, 500);
  }, [fileHash, filename]);

  const handleAnnotationChange = useCallback((pageIndex: number, json: object) => {
    pageAnnotationsRef.current[pageIndex] = json;
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleActivatePage = useCallback((idx: number) => setActivePageIndex(idx), []);

  const [loadError, setLoadError] = useState<string | null>(null);

  const handleFiles = async (files: File[]) => {
    const file = files[0];
    setLoadError(null);
    setFilename(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setOriginalPdfBytes(bytes);

      const hash = await hashFile(file);
      setFileHash(hash);

      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      setPdfDoc(doc);

      const loadedPages: PDFPageProxy[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        loadedPages.push(await doc.getPage(i));
      }
      setPages(loadedPages);
      pageAnnotationsRef.current = loadedPages.map(() => ({ objects: [] }));
      canvasRefs.current = loadedPages.map(() => null);

      // Check for saved session
      const saved = loadAnnotations(hash);
      if (saved && saved.pages.length > 0) {
        setPendingSession(saved.pages);
        setShowRestoreBanner(true);
      }
    } catch (err) {
      setLoadError('Failed to load PDF. The file may be corrupted or password-protected.');
      console.error(err);
    }
  };

  // Restore saved session once canvases are mounted
  const restoreSession = useCallback(async (sessionPages: object[]) => {
    for (let i = 0; i < sessionPages.length; i++) {
      const handle = canvasRefs.current[i];
      if (handle) {
        await handle.loadJSON(sessionPages[i]);
        pageAnnotationsRef.current[i] = sessionPages[i];
      }
    }
  }, []);

  // Deferred restore: fires after pages are rendered so canvasRefs are populated
  useEffect(() => {
    if (!shouldRestore || !pendingSession || pages.length === 0) return;
    setShouldRestore(false);
    restoreSession(pendingSession).then(() => setPendingSession(null));
  }, [shouldRestore, pendingSession, pages, restoreSession]);

  useEffect(() => {
    if (!showRestoreBanner && pendingSession) {
      setPendingSession(null);
    }
  }, [showRestoreBanner, pendingSession]);

  const handleRestore = () => {
    if (!pendingSession) return;
    setShowRestoreBanner(false);
    setShouldRestore(true);
  };

  const handleDiscard = () => {
    clearAnnotations(fileHash);
    setShowRestoreBanner(false);
    setPendingSession(null);
  };

  const activeSignatureUrl = signatures.find((s) => s.id === activeSignatureId)?.dataUrl ?? null;

  const handleUndo = useCallback(
    () => canvasRefs.current[activePageIndex]?.undo(),
    [activePageIndex],
  );
  const handleRedo = useCallback(
    () => canvasRefs.current[activePageIndex]?.redo(),
    [activePageIndex],
  );

  const handleExport = async (mode: 'flatten' | 'annotated') => {
    if (!originalPdfBytes || pages.length === 0) return;
    setExporting(true);
    try {
      const exportData: PageExportData[] = pages.map((page, i) => {
        const handle = canvasRefs.current[i];
        const vp1 = page.getViewport({ scale: 1 });
        const vpRender = page.getViewport({ scale: RENDER_SCALE });
        return {
          bgCanvas: handle!.getBgCanvas(),
          fabricJSON: handle?.getJSON() ?? { objects: [] },
          canvasWidth: Math.floor(vpRender.width),
          canvasHeight: Math.floor(vpRender.height),
          pdfPageWidth: vp1.width,
          pdfPageHeight: vp1.height,
        };
      });

      const baseName = filename.replace(/\.pdf$/i, '');
      const outName = `${baseName}-edited.pdf`;
      let bytes: Uint8Array;

      if (mode === 'flatten') {
        bytes = await flattenToPdf(exportData);
      } else {
        bytes = await exportAnnotated(originalPdfBytes, exportData, FONT_URLS);
      }
      downloadBlob(bytes, outName);
    } finally {
      setExporting(false);
      setShowExportDialog(false);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); handleUndo(); return; }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); handleRedo(); return; }
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      const keyMap: Record<string, ToolType> = {
        v: 'select', r: 'rect', e: 'ellipse', l: 'line', x: 'cross',
        t: 'text', m: 'mono-text', s: 'signature',
      };
      const tool = keyMap[e.key.toLowerCase()];
      if (tool) {
        setActiveTool(tool);
        if (tool === 'signature') setShowSignatureManager(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePageIndex, handleUndo, handleRedo]);

  const storageKb = Math.round(storageBytes / 1024);

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Edit PDF</h2>

      {!pdfDoc && (
        <FileDropZone onFiles={handleFiles} label="Drop a PDF here or click to select" />
      )}

      {loadError && (
        <div style={{ color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 16px', marginBottom: 12 }}>
          {loadError}
        </div>
      )}

      {showRestoreBanner && (
        <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 6, padding: '10px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>Saved annotations found for this file. Restore?</span>
          <button onClick={handleRestore} style={{ padding: '4px 12px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Restore</button>
          <button onClick={handleDiscard} style={{ padding: '4px 12px', border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer', background: '#fff' }}>Discard</button>
        </div>
      )}

      {pdfDoc && (
        <div style={{ display: 'flex', gap: 0 }}>
          <EditorToolbar
            activeTool={activeTool}
            style={style}
            onToolChange={setActiveTool}
            onStyleChange={(patch) => setStyle((prev) => ({ ...prev, ...patch }))}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onOpenSignatures={() => setShowSignatureManager(true)}
            onDownload={() => setShowExportDialog(true)}
            hasFile={true}
          />

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px', maxHeight: 'calc(100vh - 200px)' }}>
            {pages.map((page, i) => (
              <div key={`${fileHash}-${i}`}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Page {i + 1}</div>
                <AnnotationCanvas
                  ref={(el) => { canvasRefs.current[i] = el; }}
                  page={page}
                  pageIndex={i}
                  scale={RENDER_SCALE}
                  activeTool={activeTool}
                  style={style}
                  activeSignatureUrl={activeSignatureUrl}
                  onChange={handleAnnotationChange}
                  onActivate={handleActivatePage}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {pdfDoc && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#9ca3af' }}>
          Storage used: ~{storageKb} KB
          {storageKb > 4000 && (
            <span style={{ color: '#dc2626', marginLeft: 8 }}>⚠ Approaching storage limit</span>
          )}
          {' · '}
          <button onClick={() => { clearAllEditorData(); setStorageBytes(0); }}
            style={{ background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer', fontSize: 12, padding: 0 }}>
            Clear all saved data
          </button>
        </div>
      )}

      {/* Export dialog */}
      {showExportDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowExportDialog(false); }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ marginTop: 0 }}>Download edited PDF</h3>
            <p style={{ color: '#555', fontSize: 14 }}>Choose export format:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                disabled={exporting}
                onClick={() => handleExport('flatten')}
                style={{ padding: '10px 16px', background: '#0070f3', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                <strong>Flatten to PDF</strong>
                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Annotations baked in as image — works everywhere, not re-editable</div>
              </button>
              <button
                disabled={exporting}
                onClick={() => handleExport('annotated')}
                title="Complex rotations and opacity effects may not be preserved perfectly"
                style={{ padding: '10px 16px', background: '#fff', color: '#333', border: '1px solid #ccc', borderRadius: 6, cursor: 'pointer', textAlign: 'left' }}>
                <strong>PDF with annotations</strong>
                <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>Vector drawing calls on original PDF — selectable in Adobe Reader ⚠ limited fidelity</div>
              </button>
            </div>
            {exporting && <p style={{ color: '#888', marginTop: 12 }}>Exporting…</p>}
            <button onClick={() => setShowExportDialog(false)}
              style={{ marginTop: 16, background: 'none', border: 'none', color: '#0070f3', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {showSignatureManager && (
        <SignatureManager
          signatures={signatures}
          onSignaturesChange={setSignatures}
          activeSignatureId={activeSignatureId}
          onSelect={(id) => { setActiveSignatureId(id); setActiveTool('signature'); }}
          onClose={() => setShowSignatureManager(false)}
        />
      )}
    </div>
  );
}
