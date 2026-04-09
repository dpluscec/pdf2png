import { describe, it, expect, beforeAll } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { splitPdf } from '../server/lib/splitPdf';
import type { SplitConfig } from '../server/lib/splitPdf';

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

async function pageCount(buf: Buffer): Promise<number> {
  return (await PDFDocument.load(buf)).getPageCount();
}

describe('splitPdf', () => {
  let pdf5: Buffer;

  beforeAll(async () => {
    pdf5 = await makePdf(5);
  });

  describe('range — custom', () => {
    it('extracts a single range', async () => {
      const config: SplitConfig = { mode: 'range', rangeType: 'custom', ranges: [{ from: 2, to: 4 }], mergeAll: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(1);
      expect(await pageCount(result[0])).toBe(3);
    });

    it('extracts multiple ranges as separate PDFs', async () => {
      const config: SplitConfig = { mode: 'range', rangeType: 'custom', ranges: [{ from: 1, to: 2 }, { from: 4, to: 5 }], mergeAll: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(2);
      expect(await pageCount(result[0])).toBe(2);
      expect(await pageCount(result[1])).toBe(2);
    });

    it('merges all ranges into one PDF when mergeAll is true', async () => {
      const config: SplitConfig = { mode: 'range', rangeType: 'custom', ranges: [{ from: 1, to: 2 }, { from: 4, to: 5 }], mergeAll: true };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(1);
      expect(await pageCount(result[0])).toBe(4);
    });

    it('ignores ranges entirely outside document bounds', async () => {
      const config: SplitConfig = { mode: 'range', rangeType: 'custom', ranges: [{ from: 10, to: 20 }], mergeAll: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(0);
    });

    it('clamps ranges that partially exceed document bounds', async () => {
      const config: SplitConfig = { mode: 'range', rangeType: 'custom', ranges: [{ from: 3, to: 100 }], mergeAll: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(1);
      expect(await pageCount(result[0])).toBe(3); // pages 3–5
    });
  });

  describe('range — fixed', () => {
    it('splits into chunks of N pages', async () => {
      const config: SplitConfig = { mode: 'range', rangeType: 'fixed', everyN: 2, mergeAll: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(3); // [1–2], [3–4], [5]
      expect(await pageCount(result[0])).toBe(2);
      expect(await pageCount(result[1])).toBe(2);
      expect(await pageCount(result[2])).toBe(1);
    });

    it('merges all fixed chunks into one PDF when mergeAll is true', async () => {
      const config: SplitConfig = { mode: 'range', rangeType: 'fixed', everyN: 2, mergeAll: true };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(1);
      expect(await pageCount(result[0])).toBe(5);
    });
  });

  describe('pages — all', () => {
    it('extracts every page as its own PDF', async () => {
      const config: SplitConfig = { mode: 'pages', pageSelection: 'all' };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(5);
      for (const buf of result) expect(await pageCount(buf)).toBe(1);
    });
  });

  describe('pages — selected', () => {
    it('extracts selected pages as individual PDFs', async () => {
      const config: SplitConfig = { mode: 'pages', pageSelection: 'selected', pages: [1, 3, 5], mergeSelected: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(3);
      for (const buf of result) expect(await pageCount(buf)).toBe(1);
    });

    it('merges selected pages into one PDF when mergeSelected is true', async () => {
      const config: SplitConfig = { mode: 'pages', pageSelection: 'selected', pages: [1, 3, 5], mergeSelected: true };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(1);
      expect(await pageCount(result[0])).toBe(3);
    });

    it('deduplicates and sorts pages', async () => {
      const config: SplitConfig = { mode: 'pages', pageSelection: 'selected', pages: [3, 1, 3, 1], mergeSelected: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(2);
    });

    it('ignores out-of-range page numbers', async () => {
      const config: SplitConfig = { mode: 'pages', pageSelection: 'selected', pages: [2, 99], mergeSelected: false };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(1);
    });
  });

  describe('size', () => {
    it('puts all pages in one chunk when limit is very large', async () => {
      const config: SplitConfig = { mode: 'size', maxSizeMb: 100 };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(1);
      expect(await pageCount(result[0])).toBe(5);
    });

    it('puts each page in its own chunk when limit is effectively zero', async () => {
      const config: SplitConfig = { mode: 'size', maxSizeMb: 0.000001 };
      const result = await splitPdf(pdf5, config);
      expect(result).toHaveLength(5);
      for (const buf of result) expect(await pageCount(buf)).toBe(1);
    });
  });
});
