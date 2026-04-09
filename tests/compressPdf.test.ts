import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { compressPdf } from '../server/lib/compressPdf';

async function makePdf(pageCount = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    doc.addPage([612, 792]);
  }
  return Buffer.from(await doc.save());
}

describe('compressPdf', () => {
  it('returns a valid PDF buffer for balanced level', async () => {
    const input = await makePdf(1);
    const result = await compressPdf(input, 'balanced');
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  }, 30000);

  it('returns a valid PDF buffer for maximum level', async () => {
    const input = await makePdf(1);
    const result = await compressPdf(input, 'maximum');
    expect(result).toBeInstanceOf(Buffer);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  }, 30000);

  it('returns a valid PDF buffer for quality level', async () => {
    const input = await makePdf(1);
    const result = await compressPdf(input, 'quality');
    expect(result).toBeInstanceOf(Buffer);
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  }, 30000);

  it('throws on invalid level', async () => {
    const input = await makePdf(1);
    await expect(
      compressPdf(input, 'invalid' as 'balanced')
    ).rejects.toThrow('Invalid compression level');
  });
});
