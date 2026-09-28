import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import convertRouter from './routes/convert.js';
import mergeRouter from './routes/merge.js';
import pngToPdfRouter from './routes/pngToPdf.js';
import splitRouter from './routes/split.js';
import compressRouter from './routes/compress.js';
import healthRouter from './routes/health.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = Number(process.env.PORT) || 8101;
const HOST = process.env.HOST || '127.0.0.1';

app.use('/api/health', healthRouter);
app.use('/api/convert', convertRouter);
app.use('/api/merge', mergeRouter);
app.use('/api/png-to-pdf', pngToPdfRouter);
app.use('/api/split', splitRouter);
app.use('/api/compress', compressRouter);

const clientDistPath = path.join(__dirname, '..');
app.use(express.static(clientDistPath));
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
