import express from 'express';
import convertRouter from './routes/convert.js';
import mergeRouter from './routes/merge.js';

const app = express();
const PORT = 3001;

app.use('/api/convert', convertRouter);
app.use('/api/merge', mergeRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
