import express from 'express';
import convertRouter from './routes/convert.js';
import mergeRouter from './routes/merge.js';
import pngToPdfRouter from './routes/pngToPdf.js';
import splitRouter from './routes/split.js';

const app = express();
const PORT = 3001;

app.use('/api/convert', convertRouter);
app.use('/api/merge', mergeRouter);
app.use('/api/png-to-pdf', pngToPdfRouter);
app.use('/api/split', splitRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
