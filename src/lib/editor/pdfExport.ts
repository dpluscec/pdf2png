import { PDFDocument, rgb, degrees } from 'pdf-lib';
import { Canvas as FabricCanvas } from 'fabric';

export interface PageExportData {
  /** pdfjs-rendered background canvas */
  bgCanvas: HTMLCanvasElement;
  /** Fabric.js canvas JSON (canvas.toJSON()) */
  fabricJSON: object;
  /** Canvas pixel width */
  canvasWidth: number;
  /** Canvas pixel height */
  canvasHeight: number;
  /** Original PDF page width in points */
  pdfPageWidth: number;
  /** Original PDF page height in points */
  pdfPageHeight: number;
}

export async function flattenToPdf(pages: PageExportData[]): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  for (const pageData of pages) {
    // Composite bg + annotations onto an offscreen canvas
    const offscreen = document.createElement('canvas');
    offscreen.width = pageData.canvasWidth;
    offscreen.height = pageData.canvasHeight;
    const ctx = offscreen.getContext('2d')!;
    ctx.drawImage(pageData.bgCanvas, 0, 0);

    // Render Fabric annotations to a temp canvas
    const tempEl = document.createElement('canvas');
    tempEl.width = pageData.canvasWidth;
    tempEl.height = pageData.canvasHeight;
    const tempFc = new FabricCanvas(tempEl, {
      width: pageData.canvasWidth,
      height: pageData.canvasHeight,
    });
    await tempFc.loadFromJSON(pageData.fabricJSON);
    tempFc.renderAll();
    ctx.drawImage(tempEl, 0, 0);
    tempFc.dispose();

    // Embed composite as PNG in the PDF page
    const pngDataUrl = offscreen.toDataURL('image/png');
    const pngBytes = await fetch(pngDataUrl).then((r) => r.arrayBuffer());
    const pdfPage = pdfDoc.addPage([pageData.pdfPageWidth, pageData.pdfPageHeight]);
    const pngImage = await pdfDoc.embedPng(pngBytes);
    pdfPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: pageData.pdfPageWidth,
      height: pageData.pdfPageHeight,
    });
  }

  return pdfDoc.save();
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

/** Converts canvas-pixel Y (top-down) to pdf-lib Y (bottom-up) */
function toPointY(fabricY: number, objectHeightPx: number, scaleY: number, pdfH: number): number {
  return pdfH - fabricY / scaleY - objectHeightPx / scaleY;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean, 16);
  return { r: ((num >> 16) & 255) / 255, g: ((num >> 8) & 255) / 255, b: (num & 255) / 255 };
}

function parseColor(fill: unknown): ReturnType<typeof rgb> | undefined {
  if (!fill || fill === 'transparent' || fill === '' || fill === 'rgba(0,0,0,0)') return undefined;
  if (typeof fill === 'string' && fill.startsWith('#')) {
    const { r, g, b } = hexToRgb(fill);
    return rgb(r, g, b);
  }
  return undefined;
}

// ── Annotated export ──────────────────────────────────────────────────────────

interface FontUrls {
  regular: string;
  mono: string;
  cursive: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricObject = Record<string, any>;

export async function exportAnnotated(
  originalPdfBytes: Uint8Array,
  pages: PageExportData[],
  fontUrls: FontUrls,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pdfPages = pdfDoc.getPages();

  const [regularBytes, monoBytes, cursiveBytes] = await Promise.all([
    fetch(fontUrls.regular).then((r) => r.arrayBuffer()),
    fetch(fontUrls.mono).then((r) => r.arrayBuffer()),
    fetch(fontUrls.cursive).then((r) => r.arrayBuffer()),
  ]);
  const regularFont = await pdfDoc.embedFont(regularBytes);
  const monoFont = await pdfDoc.embedFont(monoBytes);
  const cursiveFont = await pdfDoc.embedFont(cursiveBytes);

  for (let i = 0; i < pages.length && i < pdfPages.length; i++) {
    const pageData = pages[i];
    const pdfPage = pdfPages[i];
    const { width: pdfW, height: pdfH } = pdfPage.getSize();
    const scaleX = pageData.canvasWidth / pdfW;
    const scaleY = pageData.canvasHeight / pdfH;

    const fabricData = pageData.fabricJSON as { objects?: FabricObject[] };
    for (const obj of fabricData.objects ?? []) {
      const opacity = (obj.opacity as number) ?? 1;
      const angle = (obj.angle as number) ?? 0;
      const strokeColor = parseColor(obj.stroke);
      const fillColor = parseColor(obj.fill);
      const strokeWidth = ((obj.strokeWidth as number) ?? 1) / scaleX;

      if (obj.type === 'Rect' || obj.type === 'rect') {
        const w = ((obj.width as number) * ((obj.scaleX as number) ?? 1)) / scaleX;
        const h = ((obj.height as number) * ((obj.scaleY as number) ?? 1)) / scaleY;
        pdfPage.drawRectangle({
          x: (obj.left as number) / scaleX,
          y: toPointY(obj.top as number, (obj.height as number) * ((obj.scaleY as number) ?? 1), scaleY, pdfH),
          width: w,
          height: h,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          color: fillColor,
          opacity,
          rotate: degrees(angle),
        });
      } else if (obj.type === 'Ellipse' || obj.type === 'ellipse') {
        const rx = ((obj.rx as number) * ((obj.scaleX as number) ?? 1)) / scaleX;
        const ry = ((obj.ry as number) * ((obj.scaleY as number) ?? 1)) / scaleY;
        pdfPage.drawEllipse({
          x: ((obj.left as number) + (obj.rx as number) * ((obj.scaleX as number) ?? 1)) / scaleX,
          y: toPointY(
            obj.top as number,
            (obj.ry as number) * ((obj.scaleY as number) ?? 1) * 2,
            scaleY,
            pdfH,
          ) + ry,
          xScale: rx,
          yScale: ry,
          borderColor: strokeColor,
          borderWidth: strokeWidth,
          color: fillColor,
          opacity,
        });
      } else if (obj.type === 'Line' || obj.type === 'line') {
        // Fabric Line: x1/y1/x2/y2 are relative to center; left/top is center
        const cx = (obj.left as number) / scaleX;
        const cy = (obj.top as number) / scaleY;
        const hw = ((obj.width as number) / 2) / scaleX;
        const hh = ((obj.height as number) / 2) / scaleY;
        const absX1 = cx - hw;
        const absY1 = pdfH - cy + hh;
        const absX2 = cx + hw;
        const absY2 = pdfH - cy - hh;
        pdfPage.drawLine({
          start: { x: absX1, y: absY1 },
          end: { x: absX2, y: absY2 },
          thickness: strokeWidth,
          color: strokeColor,
          opacity,
        });
      } else if (obj.type === 'IText' || obj.type === 'i-text' || obj.type === 'Textbox') {
        const fontFamily = (obj.fontFamily as string) ?? 'Noto Sans';
        const font = fontFamily.includes('Mono') ? monoFont
          : fontFamily.includes('Dancing') ? cursiveFont
          : regularFont;
        const fontSize = ((obj.fontSize as number) ?? 16) / scaleY;
        const textColor = parseColor(obj.fill);
        const text = (obj.text as string) ?? '';
        if (text.trim()) {
          pdfPage.drawText(text, {
            x: (obj.left as number) / scaleX,
            y: toPointY(obj.top as number, (obj.fontSize as number) ?? 16, scaleY, pdfH),
            size: fontSize,
            font,
            color: textColor,
            opacity,
            rotate: degrees(angle),
          });
        }
      } else if (obj.type === 'Image' || obj.type === 'image') {
        // Signatures — embed as image
        const src = (obj.src as string) ?? '';
        if (src.startsWith('data:image/png')) {
          const imgBytes = await fetch(src).then((r) => r.arrayBuffer());
          const embeddedImg = await pdfDoc.embedPng(imgBytes);
          const w = ((obj.width as number) * ((obj.scaleX as number) ?? 1)) / scaleX;
          const h = ((obj.height as number) * ((obj.scaleY as number) ?? 1)) / scaleY;
          pdfPage.drawImage(embeddedImg, {
            x: (obj.left as number) / scaleX,
            y: toPointY(obj.top as number, (obj.height as number) * ((obj.scaleY as number) ?? 1), scaleY, pdfH),
            width: w,
            height: h,
            opacity,
            rotate: degrees(angle),
          });
        }
      }
      // Group (cross shapes) — child objects handled recursively if needed;
      // for now groups render correctly in the flatten export.
    }
  }

  return pdfDoc.save();
}

export function downloadBlob(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
