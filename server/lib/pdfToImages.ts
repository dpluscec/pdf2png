import { createCanvas } from 'canvas';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

// Point workerSrc to the bundled worker file so pdfjs can load it in Node.js
const _require = createRequire(import.meta.url);
const workerPath = _require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
(GlobalWorkerOptions as { workerSrc: string }).workerSrc = pathToFileURL(workerPath).href;

export async function convertPdfToImages(pdfBuffer: Buffer, dpi: number): Promise<Buffer[]> {
  if (dpi <= 0) {
    throw new RangeError('dpi must be greater than 0');
  }
  const data = new Uint8Array(pdfBuffer);
  const pdf = await getDocument({ data, isEvalSupported: false }).promise;
  const scale = dpi / 72;
  const images: Buffer[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    // node-canvas context is compatible with pdfjs rendering
    const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
    await page.render({ canvasContext: context, viewport }).promise;
    images.push(canvas.toBuffer('image/png'));
    page.cleanup();
  }

  return images;
}
