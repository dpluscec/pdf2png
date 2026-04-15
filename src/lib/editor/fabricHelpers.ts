import {
  Canvas,
  Rect,
  Ellipse,
  Line,
  Group,
  IText,
  FabricImage,
} from 'fabric';
import type { TPointerEventInfo } from 'fabric';
import type { ToolType, StyleState } from './types';

// ── History ──────────────────────────────────────────────────────────────────

export interface HistoryState {
  snapshots: string[];
  index: number;
}

export function createHistory(): HistoryState {
  // Use v7 version string
  return { snapshots: ['{"version":"7.2.0","objects":[]}'], index: 0 };
}

export function saveSnapshot(canvas: Canvas, history: HistoryState): void {
  const json = JSON.stringify(canvas.toJSON());
  history.snapshots.splice(history.index + 1);
  history.snapshots.push(json);
  if (history.snapshots.length > 50) {
    history.snapshots.shift();
  } else {
    history.index++;
  }
}

export async function undoHistory(canvas: Canvas, history: HistoryState): Promise<void> {
  if (history.index <= 0) return;
  history.index--;
  await canvas.loadFromJSON(JSON.parse(history.snapshots[history.index]));
  canvas.renderAll();
}

export async function redoHistory(canvas: Canvas, history: HistoryState): Promise<void> {
  if (history.index >= history.snapshots.length - 1) return;
  history.index++;
  await canvas.loadFromJSON(JSON.parse(history.snapshots[history.index]));
  canvas.renderAll();
}

// ── Canvas setup ──────────────────────────────────────────────────────────────

export function initFabricCanvas(el: HTMLCanvasElement, width: number, height: number): Canvas {
  return new Canvas(el, {
    width,
    height,
    backgroundColor: undefined, // transparent — PDF canvas shows through
    selection: true,
  });
}

export function deleteSelected(canvas: Canvas): void {
  canvas.getActiveObjects().forEach((obj) => canvas.remove(obj));
  canvas.discardActiveObject();
  canvas.renderAll();
}

// ── Drawing handlers ─────────────────────────────────────────────────────────

export function installDrawingHandlers(
  canvas: Canvas,
  getActiveTool: () => ToolType,
  getStyle: () => StyleState,
  getActiveSignatureUrl: () => string | null,
  onObjectAdded: () => void,
): () => void {
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let previewShape: Rect | Ellipse | Line | null = null;

  // v7: use opt.scenePoint directly (pre-computed by fabric)
  const onMouseDown = (opt: TPointerEventInfo) => {
    const tool = getActiveTool();
    const style = getStyle();
    const { x, y } = opt.scenePoint;
    startX = x;
    startY = y;

    if (tool === 'select') return;

    if (tool === 'text' || tool === 'mono-text') {
      const fontFamily = tool === 'mono-text' ? 'Noto Sans Mono' : style.fontFamily;
      const itext = new IText('Text', {
        left: x,
        top: y,
        fontSize: style.fontSize,
        fontFamily,
        fill: style.strokeColor,
        opacity: style.opacity,
        padding: 2,
      });
      canvas.add(itext);
      canvas.setActiveObject(itext);
      itext.enterEditing();
      itext.selectAll();
      canvas.renderAll();
      onObjectAdded();
      return;
    }

    if (tool === 'checkmark' || tool === 'crossmark' || tool === 'dot') {
      const char = tool === 'checkmark' ? '✓' : tool === 'crossmark' ? '✗' : '•';
      const sym = new IText(char, {
        left: x,
        top: y,
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        fill: style.strokeColor,
        opacity: style.opacity,
        editable: false,
      });
      canvas.add(sym);
      canvas.setActiveObject(sym);
      canvas.renderAll();
      onObjectAdded();
      return;
    }

    if (tool === 'cross') {
      const sz = style.fontSize * 1.5;
      const l1 = new Line([0, 0, sz, sz], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
      });
      const l2 = new Line([sz, 0, 0, sz], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
      });
      const group = new Group([l1, l2], { left: x - sz / 2, top: y - sz / 2 });
      canvas.add(group);
      canvas.setActiveObject(group);
      canvas.renderAll();
      onObjectAdded();
      return;
    }

    if (tool === 'signature') {
      const sigUrl = getActiveSignatureUrl();
      if (!sigUrl) return;
      FabricImage.fromURL(sigUrl).then((img) => {
        if ((img.width ?? 0) > 200) {
          const scale = 200 / (img.width ?? 200);
          img.scaleX = scale;
          img.scaleY = scale;
        }
        img.set({ left: x, top: y });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.renderAll();
        onObjectAdded();
      });
      return;
    }

    // Drag-to-draw tools
    isDrawing = true;
    canvas.selection = false;

    const common = {
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
      fill: style.fillEnabled ? style.fillColor : 'transparent',
      opacity: style.opacity,
      selectable: false,
      evented: false,
    };

    if (tool === 'rect') {
      previewShape = new Rect({ left: x, top: y, width: 0, height: 0, ...common });
    } else if (tool === 'ellipse') {
      previewShape = new Ellipse({ left: x, top: y, rx: 0, ry: 0, ...common });
    } else if (tool === 'line') {
      previewShape = new Line([x, y, x, y], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
        selectable: false,
        evented: false,
      });
    }

    if (previewShape) canvas.add(previewShape);
  };

  const onMouseMove = (opt: TPointerEventInfo) => {
    if (!isDrawing || !previewShape) return;
    const tool = getActiveTool();
    const { x, y } = opt.scenePoint;
    const dx = x - startX;
    const dy = y - startY;

    if (tool === 'rect') {
      (previewShape as Rect).set({
        left: dx < 0 ? x : startX,
        top: dy < 0 ? y : startY,
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    } else if (tool === 'ellipse') {
      (previewShape as Ellipse).set({
        left: Math.min(startX, x),
        top: Math.min(startY, y),
        rx: Math.abs(dx) / 2,
        ry: Math.abs(dy) / 2,
      });
    } else if (tool === 'line') {
      (previewShape as Line).set({ x2: x, y2: y });
    }
    canvas.renderAll();
  };

  const onMouseUp = (opt: TPointerEventInfo) => {
    if (!isDrawing) return;
    isDrawing = false;
    canvas.selection = true;

    const tool = getActiveTool();
    const style = getStyle();
    const { x, y } = opt.scenePoint;
    const dx = x - startX;
    const dy = y - startY;

    if (previewShape) {
      canvas.remove(previewShape);
      previewShape = null;
    }

    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return;

    const finalStyle = {
      stroke: style.strokeColor,
      strokeWidth: style.strokeWidth,
      fill: style.fillEnabled ? style.fillColor : 'transparent',
      opacity: style.opacity,
    };

    let finalShape: Rect | Ellipse | Line;

    if (tool === 'rect') {
      finalShape = new Rect({
        left: dx < 0 ? x : startX,
        top: dy < 0 ? y : startY,
        width: Math.abs(dx),
        height: Math.abs(dy),
        ...finalStyle,
      });
    } else if (tool === 'ellipse') {
      finalShape = new Ellipse({
        left: Math.min(startX, x),
        top: Math.min(startY, y),
        rx: Math.abs(dx) / 2,
        ry: Math.abs(dy) / 2,
        ...finalStyle,
      });
    } else {
      finalShape = new Line([startX, startY, x, y], {
        stroke: style.strokeColor,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
      });
    }

    canvas.add(finalShape);
    canvas.setActiveObject(finalShape);
    canvas.renderAll();
    onObjectAdded();
  };

  canvas.on('mouse:down', onMouseDown);
  canvas.on('mouse:move', onMouseMove);
  canvas.on('mouse:up', onMouseUp);

  return () => {
    canvas.off('mouse:down', onMouseDown);
    canvas.off('mouse:move', onMouseMove);
    canvas.off('mouse:up', onMouseUp);
  };
}

// ── Style update on selected object ──────────────────────────────────────────

export function applyStyleToSelected(canvas: Canvas, style: StyleState): void {
  const objs = canvas.getActiveObjects();
  objs.forEach((obj) => {
    if ('stroke' in obj) obj.set('stroke', style.strokeColor);
    if ('strokeWidth' in obj) obj.set('strokeWidth', style.strokeWidth);
    if ('fill' in obj && obj.type !== 'i-text') {
      obj.set('fill', style.fillEnabled ? style.fillColor : 'transparent');
    }
    if ('fill' in obj && obj.type === 'i-text') {
      obj.set('fill', style.strokeColor);
    }
    obj.set('opacity', style.opacity);
  });
  canvas.renderAll();
}
