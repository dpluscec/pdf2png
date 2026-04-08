import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { createCanvas } from 'canvas';
import { imagesToPdf } from '../server/lib/pngToPdf';
import type { ImageInput, PageSize } from '../server/lib/pngToPdf';

function makePng(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/png');
}

function makeJpeg(width: number, height: number): Buffer {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0000ff';
  ctx.fillRect(0, 0, width, height);
  return canvas.toBuffer('image/jpeg');
}

describe('imagesToPdf', () => {
  it('throws when called with an empty array', async () => {
    await expect(imagesToPdf([], 'a4')).rejects.toThrow('At least one image is required');
  });

  it('single PNG produces a one-page PDF', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'original'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('single JPEG produces a one-page PDF', async () => {
    const result = await imagesToPdf(
      [{ buffer: makeJpeg(100, 100), mimetype: 'image/jpeg' }],
      'original'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(1);
  });

  it('multiple images produce correct page count in order', async () => {
    const images: ImageInput[] = [
      { buffer: makePng(100, 100), mimetype: 'image/png' },
      { buffer: makeJpeg(100, 100), mimetype: 'image/jpeg' },
      { buffer: makePng(100, 100), mimetype: 'image/png' },
    ];
    const result = await imagesToPdf(images, 'original');
    const doc = await PDFDocument.load(result);
    expect(doc.getPageCount()).toBe(3);
  });

  it('original page size uses image pixel dimensions as points', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(200, 150), mimetype: 'image/png' }],
      'original'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 200, height: 150 });
  });

  it('a4 page size produces 595x842 pt pages', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'a4'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 595, height: 842 });
  });

  it('letter page size produces 612x792 pt pages', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'letter'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 612, height: 792 });
  });

  it('a3 page size produces 842x1191 pt pages', async () => {
    const result = await imagesToPdf(
      [{ buffer: makePng(100, 100), mimetype: 'image/png' }],
      'a3'
    );
    const doc = await PDFDocument.load(result);
    expect(doc.getPages()[0].getSize()).toEqual({ width: 842, height: 1191 });
  });
});
