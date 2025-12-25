import express from 'express';
import cors from 'cors';
import { createApiRouter } from './router.js';

const app = express();

app.use(cors());

// All local APIs mounted under /api
app.use('/api', createApiRouter());

const port = Number(process.env.LLM_DB_PORT || 5175);
app.listen(port, '127.0.0.1', () => {
  console.log(`[llm-db] listening on http://127.0.0.1:${port}`);
});
