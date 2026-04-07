import { PDFDocument } from 'pdf-lib';

export async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 0) {
    throw new Error('At least one PDF buffer is required');
  }

  const merged = await PDFDocument.create();

  for (const buffer of buffers) {
    const doc = await PDFDocument.load(buffer);
    const copiedPages = await merged.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach((page) => merged.addPage(page));
  }

  return Buffer.from(await merged.save());
}
