import { Router, Request, Response } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { convertPdfToImages } from '../lib/pdfToImages.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
    res.status(400).json({ error: 'Only PDF files are accepted' });
    return;
  }

  const dpi = Math.min(600, Math.max(72, parseInt(req.query['dpi'] as string, 10) || 150));

  let images: Buffer[];
  try {
    images = await convertPdfToImages(req.file.buffer, dpi);
  } catch (err) {
    console.error('PDF conversion error:', err);
    res.status(500).json({ error: 'Conversion failed' });
    return;
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="pages.zip"');

  const archive = archiver('zip');

  archive.on('error', (err) => {
    console.error('Archiver error:', err);
    // Headers already sent — destroy the connection to signal error to client
    res.destroy(err);
  });

  archive.pipe(res);

  images.forEach((buffer, i) => {
    const name = `page-${String(i + 1).padStart(3, '0')}.png`;
    archive.append(buffer, { name });
  });

  await archive.finalize();
});

export default router;
