import express from 'express';
import cors from 'cors';
import { getDb, dbAll, dbGet, dbRun } from './db.js';

const app = express();

app.use(cors());
app.use(express.json());

function rowToDto(r) {
  return {
    id: r.id,
    name: r.name,
    provider: r.provider,
    baseUrl: r.baseUrl ?? '',
    apiKey: r.apiKey ?? '',
    modelName: r.modelName ?? '',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

app.get('/api/llm-configs', async (req, res) => {
  const db = await getDb();
  const rows = dbAll(db, 'SELECT * FROM llm_configs ORDER BY updatedAt DESC, id DESC');
  res.json(rows.map(rowToDto));
});

app.get('/api/llm-configs/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const db = await getDb();
  const row = dbGet(db, 'SELECT * FROM llm_configs WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(rowToDto(row));
});

app.post('/api/llm-configs', async (req, res) => {
  const { name, provider, baseUrl = '', apiKey = '', modelName = '' } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  if (!provider || typeof provider !== 'string') return res.status(400).json({ error: 'provider required' });

  const db = await getDb();
  try {
    dbRun(
      db,
      'INSERT INTO llm_configs (name, provider, baseUrl, apiKey, modelName) VALUES (?, ?, ?, ?, ?)',
      [name, provider, baseUrl, apiKey, modelName],
    );

    // sql.js 在某些情况下 last_insert_rowid() 不稳定，这里用 name(唯一) 取回
    let row = dbGet(db, 'SELECT * FROM llm_configs WHERE name = ?', [name]);
    if (!row) {
      row = dbGet(db, 'SELECT * FROM llm_configs ORDER BY id DESC LIMIT 1');
    }

    if (!row) return res.status(500).json({ error: 'insert ok but cannot read back row' });

    res.status(201).json(rowToDto(row));
  } catch (e) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'name already exists' });
    }
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.put('/api/llm-configs/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const { name, provider, baseUrl = '', apiKey = '', modelName = '' } = req.body || {};
  if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
  if (!provider || typeof provider !== 'string') return res.status(400).json({ error: 'provider required' });

  const db = await getDb();
  try {
    const exists = dbGet(db, 'SELECT id FROM llm_configs WHERE id = ?', [id]);
    if (!exists) return res.status(404).json({ error: 'not found' });

    dbRun(
      db,
      "UPDATE llm_configs SET name=?, provider=?, baseUrl=?, apiKey=?, modelName=?, updatedAt=datetime('now') WHERE id=?",
      [name, provider, baseUrl, apiKey, modelName, id],
    );
    const row = dbGet(db, 'SELECT * FROM llm_configs WHERE id = ?', [id]);
    res.json(rowToDto(row));
  } catch (e) {
    if (String(e?.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'name already exists' });
    }
    return res.status(500).json({ error: String(e?.message || e) });
  }
});

app.delete('/api/llm-configs/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const db = await getDb();
  const row = dbGet(db, 'SELECT * FROM llm_configs WHERE id = ?', [id]);
  if (!row) return res.status(404).json({ error: 'not found' });
  dbRun(db, 'DELETE FROM llm_configs WHERE id = ?', [id]);
  res.status(204).end();
});

const port = Number(process.env.LLM_DB_PORT || 5175);
app.listen(port, '127.0.0.1', () => {
  console.log(`[llm-db] listening on http://127.0.0.1:${port}`);
});
