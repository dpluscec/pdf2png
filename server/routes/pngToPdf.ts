import { Router, Request, Response } from 'express';
import multer from 'multer';
import { imagesToPdf, PageSize, ImageInput } from '../lib/pngToPdf.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const VALID_PAGE_SIZES = new Set<string>(['original', 'a4', 'letter', 'a3']);
const VALID_MIMETYPES = new Set(['image/png', 'image/jpeg']);

router.post('/', upload.array('files'), async (req: Request, res: Response): Promise<void> => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const invalidFile = files.find((f) => !VALID_MIMETYPES.has(f.mimetype));
  if (invalidFile) {
    res.status(400).json({
      error: `Only PNG and JPEG files are accepted: "${invalidFile.originalname}" is not valid`,
    });
    return;
  }

  const pageSizeParam = ((req.query['pageSize'] as string) ?? 'original').toLowerCase();
  if (!VALID_PAGE_SIZES.has(pageSizeParam)) {
    res.status(400).json({ error: 'Invalid pageSize. Must be one of: original, a4, letter, a3' });
    return;
  }

  try {
    const images: ImageInput[] = files.map((f) => ({
      buffer: f.buffer,
      mimetype: f.mimetype as 'image/png' | 'image/jpeg',
    }));
    const pdf = await imagesToPdf(images, pageSizeParam as PageSize);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error('PNG to PDF error:', err);
    res.status(500).json({ error: 'Conversion failed' });
  }
});

export default router;
