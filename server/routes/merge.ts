import { Router, Request, Response } from 'express';
import multer from 'multer';
import { mergePdfBuffers } from '../lib/mergePdfs.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.array('files'), async (req: Request, res: Response): Promise<void> => {
  const files = req.files as Express.Multer.File[];

  if (!files || files.length < 2) {
    res.status(400).json({ error: 'At least 2 files required' });
    return;
  }

  try {
    const merged = await mergePdfBuffers(files.map((f) => f.buffer));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
    res.send(merged);
  } catch {
    res.status(500).json({ error: 'Merge failed' });
  }
});

export default router;
