import { Router, Request, Response } from 'express';
import multer from 'multer';
import { compressPdf, CompressionLevel } from '../lib/compressPdf.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

const VALID_LEVELS = new Set<CompressionLevel>(['maximum', 'balanced', 'quality']);

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }

  if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.toLowerCase().endsWith('.pdf')) {
    res.status(400).json({ error: 'Only PDF files are accepted' });
    return;
  }

  const rawLevel = (req.query['level'] as string) ?? 'balanced';
  if (!VALID_LEVELS.has(rawLevel as CompressionLevel)) {
    res.status(400).json({ error: `Invalid level. Must be one of: ${[...VALID_LEVELS].join(', ')}` });
    return;
  }
  const level = rawLevel as CompressionLevel;

  let compressed: Buffer;
  try {
    compressed = await compressPdf(req.file.buffer, level);
  } catch (err) {
    console.error('PDF compression error:', err);
    res.status(500).json({ error: 'Compression failed' });
    return;
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="compressed.pdf"');
  res.send(compressed);
});

export default router;
