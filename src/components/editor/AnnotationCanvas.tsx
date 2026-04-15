import {
  useEffect,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import { Canvas as FabricCanvas } from 'fabric';
import {
  initFabricCanvas,
  installDrawingHandlers,
  saveSnapshot,
  undoHistory,
  redoHistory,
  deleteSelected,
  createHistory,
  applyStyleToSelected,
} from '../../lib/editor/fabricHelpers';
import type { ToolType, StyleState } from '../../lib/editor/types';

export interface AnnotationCanvasHandle {
  undo: () => void;
  redo: () => void;
  getJSON: () => object;
  getBgCanvas: () => HTMLCanvasElement;
  getFabricCanvas: () => FabricCanvas;
  loadJSON: (json: object) => Promise<void>;
  getPdfDimensions: () => { width: number; height: number };
}

interface Props {
  page: PDFPageProxy;
  pageIndex: number;
  scale: number;
  activeTool: ToolType;
  style: StyleState;
  activeSignatureUrl: string | null;
  onChange: (pageIndex: number, json: object) => void;
  onActivate: (pageIndex: number) => void;
}

const AnnotationCanvas = forwardRef<AnnotationCanvasHandle, Props>(
  ({ page, pageIndex, scale, activeTool, style, activeSignatureUrl, onChange, onActivate }, ref) => {
    const bgCanvasRef = useRef<HTMLCanvasElement>(null);
    const fabricElRef = useRef<HTMLCanvasElement>(null);
    const fabricRef = useRef<FabricCanvas | null>(null);
    const historyRef = useRef(createHistory());
    const cleanupRef = useRef<(() => void) | null>(null);

    const activeToolRef = useRef(activeTool);
    const styleRef = useRef(style);
    const sigUrlRef = useRef(activeSignatureUrl);

    // Keep refs in sync with props for use inside stable callbacks
    useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
    useEffect(() => { styleRef.current = style; }, [style]);
    useEffect(() => { sigUrlRef.current = activeSignatureUrl; }, [activeSignatureUrl]);

    const viewport = page.getViewport({ scale });
    const width = Math.floor(viewport.width);
    const height = Math.floor(viewport.height);

    // ── Render PDF page ────────────────────────────────────────────────────────
    useEffect(() => {
      const bgCanvas = bgCanvasRef.current;
      if (!bgCanvas) return;
      bgCanvas.width = width;
      bgCanvas.height = height;
      const ctx = bgCanvas.getContext('2d')!;
      page.render({ canvasContext: ctx, viewport }).promise.catch(console.error);
    }, [page, viewport, width, height]);

    // ── Init Fabric.js canvas ─────────────────────────────────────────────────
    useEffect(() => {
      const el = fabricElRef.current;
      if (!el) return;
      const fc = initFabricCanvas(el, width, height);
      fabricRef.current = fc;

      fc.on('mouse:down', () => onActivate(pageIndex));

      return () => {
        fc.dispose();
        fabricRef.current = null;
      };
    }, [width, height, pageIndex, onActivate]);

    // ── Install drawing handlers (re-installs when tool changes) ─────────────
    useEffect(() => {
      const fc = fabricRef.current;
      if (!fc) return;

      if (cleanupRef.current) cleanupRef.current();

      // Update cursor
      fc.defaultCursor = activeToolRef.current === 'select' ? 'default' : 'crosshair';
      fc.selection = activeToolRef.current === 'select';

      cleanupRef.current = installDrawingHandlers(
        fc,
        () => activeToolRef.current,
        () => styleRef.current,
        () => sigUrlRef.current,
        () => {
          const fc2 = fabricRef.current;
          if (!fc2) return;
          saveSnapshot(fc2, historyRef.current);
          onChange(pageIndex, fc2.toJSON());
        },
      );
    }, [activeTool, pageIndex, onChange]);

    // ── Apply style changes to currently selected object ──────────────────────
    useEffect(() => {
      const fc = fabricRef.current;
      if (!fc) return;
      applyStyleToSelected(fc, style);
      onChange(pageIndex, fc.toJSON());
    }, [style, pageIndex, onChange]);

    useImperativeHandle(ref, () => ({
      undo: () => {
        const fc = fabricRef.current;
        if (!fc) return;
        undoHistory(fc, historyRef.current).then(() => onChange(pageIndex, fc.toJSON()));
      },
      redo: () => {
        const fc = fabricRef.current;
        if (!fc) return;
        redoHistory(fc, historyRef.current).then(() => onChange(pageIndex, fc.toJSON()));
      },
      getJSON: () => fabricRef.current?.toJSON() ?? { objects: [] },
      getBgCanvas: () => bgCanvasRef.current!,
      getFabricCanvas: () => fabricRef.current!,
      loadJSON: async (json: object) => {
        const fc = fabricRef.current;
        if (!fc) return;
        await fc.loadFromJSON(json);
        fc.renderAll();
        saveSnapshot(fc, historyRef.current);
      },
      getPdfDimensions: () => {
        const vp = page.getViewport({ scale: 1 });
        return { width: vp.width, height: vp.height };
      },
    }));

    return (
      <div
        style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}
        role="region"
        aria-label={`Page ${pageIndex + 1}`}
      >
        <canvas
          ref={bgCanvasRef}
          style={{ display: 'block', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}
        />
        <div style={{ position: 'absolute', top: 0, left: 0 }}>
          <canvas
            ref={fabricElRef}
            onKeyDown={(e) => {
              if (e.key === 'Delete' || e.key === 'Backspace') {
                const fc = fabricRef.current;
                if (!fc) return;
                deleteSelected(fc);
                saveSnapshot(fc, historyRef.current);
                onChange(pageIndex, fc.toJSON());
              }
            }}
            tabIndex={0}
          />
        </div>
      </div>
    );
  },
);

AnnotationCanvas.displayName = 'AnnotationCanvas';
export default AnnotationCanvas;
