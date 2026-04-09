import { PDFDocument } from 'pdf-lib';

export type SplitConfig =
  | { mode: 'range'; rangeType: 'custom'; ranges: { from: number; to: number }[]; mergeAll: boolean }
  | { mode: 'range'; rangeType: 'fixed'; everyN: number; mergeAll: boolean }
  | { mode: 'pages'; pageSelection: 'all' }
  | { mode: 'pages'; pageSelection: 'selected'; pages: number[]; mergeSelected: boolean }
  | { mode: 'size'; maxSizeMb: number };

async function createPdfFromIndices(sourceDoc: PDFDocument, pageIndices: number[]): Promise<Buffer> {
  const out = await PDFDocument.create();
  const copied = await out.copyPages(sourceDoc, pageIndices);
  copied.forEach(p => out.addPage(p));
  return Buffer.from(await out.save());
}

export async function splitPdf(inputBuffer: Buffer, config: SplitConfig): Promise<Buffer[]> {
  const sourceDoc = await PDFDocument.load(inputBuffer);
  const total = sourceDoc.getPageCount();

  if (config.mode === 'range') {
    let groups: number[][];

    if (config.rangeType === 'custom') {
      groups = config.ranges
        .map(r => {
          const from = Math.max(0, r.from - 1);
          const to = Math.min(total - 1, r.to - 1);
          if (from > to) return [] as number[];
          return Array.from({ length: to - from + 1 }, (_, i) => from + i);
        })
        .filter(g => g.length > 0);
    } else {
      if (config.everyN < 1) throw new Error('everyN must be at least 1');
      groups = [];
      for (let i = 0; i < total; i += config.everyN) {
        const end = Math.min(i + config.everyN, total);
        groups.push(Array.from({ length: end - i }, (_, j) => i + j));
      }
    }

    if (groups.length === 0) return [];

    if (config.mergeAll) {
      return [await createPdfFromIndices(sourceDoc, groups.flat())];
    }

    const results: Buffer[] = [];
    for (const g of groups) results.push(await createPdfFromIndices(sourceDoc, g));
    return results;
  }

  if (config.mode === 'pages') {
    if (config.pageSelection === 'all') {
      const results: Buffer[] = [];
      for (let i = 0; i < total; i++) results.push(await createPdfFromIndices(sourceDoc, [i]));
      return results;
    }

    const validIndices = [...new Set(
      config.pages.filter(p => p >= 1 && p <= total).map(p => p - 1)
    )].sort((a, b) => a - b);

    if (validIndices.length === 0) return [];

    if (config.mergeSelected) {
      return [await createPdfFromIndices(sourceDoc, validIndices)];
    }

    const results: Buffer[] = [];
    for (const idx of validIndices) results.push(await createPdfFromIndices(sourceDoc, [idx]));
    return results;
  }

  if (config.mode !== 'size') {
    throw new Error(`Unknown split mode: ${(config as { mode: string }).mode}`);
  }

  // mode === 'size'
  if (config.maxSizeMb <= 0) throw new Error('maxSizeMb must be greater than 0');
  const maxBytes = config.maxSizeMb * 1024 * 1024;
  const chunks: Buffer[] = [];
  let currentIndices: number[] = [];
  let currentBuf = Buffer.alloc(0);

  for (let i = 0; i < total; i++) {
    const testIndices = [...currentIndices, i];
    const testBuf = await createPdfFromIndices(sourceDoc, testIndices);

    if (testBuf.length > maxBytes && currentIndices.length > 0) {
      chunks.push(currentBuf);
      currentIndices = [i];
      currentBuf = await createPdfFromIndices(sourceDoc, [i]);
    } else {
      currentIndices = testIndices;
      currentBuf = testBuf;
    }
  }

  if (currentIndices.length > 0) chunks.push(currentBuf);
  return chunks;
}
