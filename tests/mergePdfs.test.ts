import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergePdfBuffers } from '../server/lib/mergePdfs';

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]);
  }
  return Buffer.from(await doc.save());
}

async function makePdfWithPageSize(width: number, height: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([width, height]);
  return Buffer.from(await doc.save());
}

describe('mergePdfBuffers', () => {
  it('combines page counts from all input PDFs', async () => {
    const pdf1 = await makePdf(2);
    const pdf2 = await makePdf(3);
    const merged = await mergePdfBuffers([pdf1, pdf2]);
    const result = await PDFDocument.load(merged);
    expect(result.getPageCount()).toBe(5);
  });

  it('preserves order of input documents', async () => {
    const pdf1 = await makePdfWithPageSize(100, 200);
    const pdf2 = await makePdfWithPageSize(300, 400);
    const merged = await mergePdfBuffers([pdf1, pdf2]);
    const result = await PDFDocument.load(merged);
    const pages = result.getPages();
    expect(pages[0].getSize()).toEqual({ width: 100, height: 200 });
    expect(pages[1].getSize()).toEqual({ width: 300, height: 400 });
  });

  it('works with a single PDF', async () => {
    const pdf = await makePdf(1);
    const merged = await mergePdfBuffers([pdf]);
    const result = await PDFDocument.load(merged);
    expect(result.getPageCount()).toBe(1);
  });
});
