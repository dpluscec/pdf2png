import { Router, Request, Response } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import { splitPdf, SplitConfig } from '../lib/splitPdf.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

function getOutputName(config: SplitConfig, index: number): string {
  if (config.mode === 'size') return `chunk-${index + 1}.pdf`;
  if (config.mode === 'range') return `range-${index + 1}.pdf`;
  return `page-${index + 1}.pdf`;
}

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'No file provided' });
    return;
  }

  if (file.mimetype !== 'application/pdf' && !file.originalname.toLowerCase().endsWith('.pdf')) {
    res.status(400).json({ error: 'Only PDF files are accepted' });
    return;
  }

  let config: SplitConfig;
  try {
    config = JSON.parse(req.body.config) as SplitConfig;
  } catch {
    res.status(400).json({ error: 'Invalid config JSON' });
    return;
  }

  try {
    const buffers = await splitPdf(file.buffer, config);

    if (buffers.length === 0) {
      res.status(400).json({ error: 'No output produced — check your configuration' });
      return;
    }

    if (buffers.length === 1) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="split.pdf"');
      res.send(buffers[0]);
      return;
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="split.zip"');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.destroy(err);
    });
    archive.pipe(res);
    buffers.forEach((buf, i) => archive.append(buf, { name: getOutputName(config, i) }));
    await archive.finalize();
  } catch (err) {
    console.error('Split error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Split failed' });
  }
});

export default router;
