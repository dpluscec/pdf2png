import { Router, Request, Response } from 'express';
import multer from 'multer';
import { mergePdfBuffers } from '../lib/mergePdfs.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post('/', upload.array('files'), async (req: Request, res: Response): Promise<void> => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length < 2) {
    res.status(400).json({ error: 'At least 2 files required' });
    return;
  }

  const nonPdf = files.find(
    (f) => f.mimetype !== 'application/pdf' && !f.originalname.toLowerCase().endsWith('.pdf')
  );
  if (nonPdf) {
    res.status(400).json({ error: `Only PDF files are accepted: "${nonPdf.originalname}" is not a PDF` });
    return;
  }

  try {
    const merged = await mergePdfBuffers(files.map((f) => f.buffer));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    res.send(merged);
  } catch (err) {
    console.error('Merge error:', err);
    res.status(500).json({ error: 'Merge failed' });
  }
});

export default router;
