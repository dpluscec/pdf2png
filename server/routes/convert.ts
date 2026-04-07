import { Router, Request, Response } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { convertPdfToImages } from '../lib/pdfToImages.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  const dpi = Math.min(600, Math.max(72, parseInt(req.query['dpi'] as string) || 150));

  try {
    const images = await convertPdfToImages(req.file.buffer, dpi);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="pages.zip"');

    const archive = archiver('zip');
    archive.pipe(res);

    images.forEach((buffer, i) => {
      const name = `page-${String(i + 1).padStart(3, '0')}.png`;
      archive.append(buffer, { name });
    });

    await archive.finalize();
  } catch {
    res.status(500).json({ error: 'Conversion failed' });
  }
});

export default router;
