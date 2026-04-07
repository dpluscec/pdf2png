import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { convertPdfToImages } from '../server/lib/pdfToImages';

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]);
  }
  return Buffer.from(await doc.save());
}

describe('convertPdfToImages', () => {
  it('returns one buffer per page', async () => {
    const pdfBuffer = await makePdf(3);
    const images = await convertPdfToImages(pdfBuffer, 72);
    expect(images).toHaveLength(3);
  });

  it('returns Buffer instances', async () => {
    const pdfBuffer = await makePdf(1);
    const images = await convertPdfToImages(pdfBuffer, 72);
    expect(images[0]).toBeInstanceOf(Buffer);
  });

  it('returns non-empty buffers', async () => {
    const pdfBuffer = await makePdf(1);
    const images = await convertPdfToImages(pdfBuffer, 72);
    expect(images[0].length).toBeGreaterThan(0);
  });
});
