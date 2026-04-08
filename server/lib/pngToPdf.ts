import { PDFDocument } from 'pdf-lib';

export type PageSize = 'original' | 'a4' | 'letter' | 'a3';

export interface ImageInput {
  buffer: Buffer;
  mimetype: 'image/png' | 'image/jpeg';
}

const PAGE_DIMENSIONS: Record<Exclude<PageSize, 'original'>, [number, number]> = {
  a4: [595, 842],
  letter: [612, 792],
  a3: [842, 1191],
};

function fitRect(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(pageW / imgW, pageH / imgH);
  const width = imgW * scale;
  const height = imgH * scale;
  return { x: (pageW - width) / 2, y: (pageH - height) / 2, width, height };
}

export async function imagesToPdf(images: ImageInput[], pageSize: PageSize): Promise<Buffer> {
  if (images.length === 0) {
    throw new Error('At least one image is required');
  }
  const doc = await PDFDocument.create();

  for (const { buffer, mimetype } of images) {
    const pdfImage =
      mimetype === 'image/png'
        ? await doc.embedPng(buffer)
        : await doc.embedJpg(buffer);

    let pageW: number;
    let pageH: number;

    if (pageSize === 'original') {
      pageW = pdfImage.width;
      pageH = pdfImage.height;
    } else {
      [pageW, pageH] = PAGE_DIMENSIONS[pageSize];
    }

    const page = doc.addPage([pageW, pageH]);

    if (pageSize === 'original') {
      page.drawImage(pdfImage, { x: 0, y: 0, width: pageW, height: pageH });
    } else {
      page.drawImage(pdfImage, fitRect(pdfImage.width, pdfImage.height, pageW, pageH));
    }
  }

  return Buffer.from(await doc.save());
}
