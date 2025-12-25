import express from 'express';
import { getDb, dbAll, dbGet, dbRun } from './db.js';

export function createApiRouter() {
  const router = express.Router();

  router.use(express.json());

  function sendJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  }

  function sendError(res, statusCode, message) {
    sendJson(res, statusCode, { error: message });
  }

  // 根路径提示
  router.get('/', (req, res) => {
    sendJson(res, 200, { ok: true, message: 'Local API mounted at /api' });
  });

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

  router.get('/llm-configs', async (req, res) => {
    const db = await getDb();
    const rows = dbAll(db, 'SELECT * FROM llm_configs ORDER BY updatedAt DESC, id DESC');
    sendJson(res, 200, rows.map(rowToDto));
  });

  router.get('/llm-configs/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const db = await getDb();
    const row = dbGet(db, 'SELECT * FROM llm_configs WHERE id = ?', [id]);
    if (!row) return sendError(res, 404, 'not found');
    sendJson(res, 200, rowToDto(row));
  });

  router.post('/llm-configs', async (req, res) => {
    const { name, provider, baseUrl = '', apiKey = '', modelName = '' } = req.body || {};
    if (!name || typeof name !== 'string') return sendError(res, 400, 'name required');
    if (!provider || typeof provider !== 'string') return sendError(res, 400, 'provider required');

    const db = await getDb();
    try {
      dbRun(
        db,
        'INSERT INTO llm_configs (name, provider, baseUrl, apiKey, modelName) VALUES (?, ?, ?, ?, ?)',
        [name, provider, baseUrl, apiKey, modelName],
      );

      let row = dbGet(db, 'SELECT * FROM llm_configs WHERE name = ?', [name]);
      if (!row) row = dbGet(db, 'SELECT * FROM llm_configs ORDER BY id DESC LIMIT 1');
      if (!row) return sendError(res, 500, 'insert ok but cannot read back row');

      sendJson(res, 201, rowToDto(row));
    } catch (e) {
      if (String(e?.message || '').includes('UNIQUE')) {
        return sendError(res, 409, 'name already exists');
      }
      return sendError(res, 500, String(e?.message || e));
    }
  });

  router.put('/llm-configs/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const { name, provider, baseUrl = '', apiKey = '', modelName = '' } = req.body || {};
    if (!name || typeof name !== 'string') return sendError(res, 400, 'name required');
    if (!provider || typeof provider !== 'string') return sendError(res, 400, 'provider required');

    const db = await getDb();
    try {
      const exists = dbGet(db, 'SELECT id FROM llm_configs WHERE id = ?', [id]);
      if (!exists) return sendError(res, 404, 'not found');

      dbRun(
        db,
        "UPDATE llm_configs SET name=?, provider=?, baseUrl=?, apiKey=?, modelName=?, updatedAt=datetime('now') WHERE id=?",
        [name, provider, baseUrl, apiKey, modelName, id],
      );

      const row = dbGet(db, 'SELECT * FROM llm_configs WHERE id = ?', [id]);
      if (!row) return sendError(res, 404, 'not found');
      sendJson(res, 200, rowToDto(row));
    } catch (e) {
      if (String(e?.message || '').includes('UNIQUE')) {
        return sendError(res, 409, 'name already exists');
      }
      return sendError(res, 500, String(e?.message || e));
    }
  });

  router.delete('/llm-configs/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const db = await getDb();
    const row = dbGet(db, 'SELECT * FROM llm_configs WHERE id = ?', [id]);
    if (!row) return sendError(res, 404, 'not found');
    dbRun(db, 'DELETE FROM llm_configs WHERE id = ?', [id]);

    res.statusCode = 204;
    res.end();
  });

  // ======================
  // Conversations API
  // ======================

  router.get('/conversations/recent', async (req, res) => {
    const db = await getDb();
    const row = dbGet(db, 'SELECT * FROM conversations ORDER BY updatedAt DESC, id DESC LIMIT 1');
    if (!row) return sendJson(res, 200, null);
    sendJson(res, 200, row);
  });

  router.get('/conversations', async (req, res) => {
    const db = await getDb();
    const rows = dbAll(db, 'SELECT * FROM conversations ORDER BY updatedAt DESC, id DESC');
    sendJson(res, 200, rows);
  });

  router.get('/conversations/:id/messages', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const db = await getDb();
    const row = dbGet(db, 'SELECT * FROM conversations WHERE id = ?', [id]);
    if (!row) return sendError(res, 404, 'not found');

    const messages = dbAll(
      db,
      'SELECT id, conversationId, role, content, createdAt FROM conversation_messages WHERE conversationId = ? ORDER BY id ASC',
      [id],
    );
    sendJson(res, 200, { conversation: row, messages });
  });

  router.post('/conversations', async (req, res) => {
    const { title = '' } = req.body || {};
    const db = await getDb();
    dbRun(db, 'INSERT INTO conversations (title) VALUES (?)', [title]);
    const row = dbGet(db, 'SELECT * FROM conversations ORDER BY id DESC LIMIT 1');
    sendJson(res, 201, row);
  });

  // 保存整个会话（覆盖写）：用于“新增对话先把当前消息框保存到数据库”
  router.post('/conversations/:id/save', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const { title = '', messages = [] } = req.body || {};
    if (!Array.isArray(messages)) return sendError(res, 400, 'messages must be array');

    const db = await getDb();
    const exists = dbGet(db, 'SELECT id FROM conversations WHERE id = ?', [id]);
    if (!exists) return sendError(res, 404, 'not found');

    dbRun(db, "UPDATE conversations SET title=?, updatedAt=datetime('now') WHERE id=?", [title, id]);
    dbRun(db, 'DELETE FROM conversation_messages WHERE conversationId = ?', [id]);

    for (const m of messages) {
      const role = String(m?.role || '');
      const content = String(m?.content || '');
      if (!role || !content) continue;
      dbRun(db, 'INSERT INTO conversation_messages (conversationId, role, content) VALUES (?, ?, ?)', [id, role, content]);
    }

    sendJson(res, 200, { ok: true });
  });

  // 删除单个会话
  router.delete('/conversations/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const db = await getDb();
    const row = dbGet(db, 'SELECT id FROM conversations WHERE id = ?', [id]);
    if (!row) return sendError(res, 404, 'not found');

    dbRun(db, 'DELETE FROM conversation_messages WHERE conversationId = ?', [id]);
    dbRun(db, 'DELETE FROM conversations WHERE id = ?', [id]);

    res.statusCode = 204;
    res.end();
  });

  // 清空所有会话
  router.delete('/conversations', async (req, res) => {
    const db = await getDb();
    dbRun(db, 'DELETE FROM conversation_messages');
    dbRun(db, 'DELETE FROM conversations');
    res.statusCode = 204;
    res.end();
  });

  // ======================
  // System Prompts API
  // ======================

  function promptRowToDto(r) {
    return {
      id: r.id,
      name: r.name,
      content: r.content,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  router.get('/system-prompts', async (req, res) => {
    const db = await getDb();
    const rows = dbAll(db, 'SELECT * FROM system_prompts ORDER BY updatedAt DESC, id DESC');
    sendJson(res, 200, rows.map(promptRowToDto));
  });

  router.get('/system-prompts/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const db = await getDb();
    const row = dbGet(db, 'SELECT * FROM system_prompts WHERE id = ?', [id]);
    if (!row) return sendError(res, 404, 'not found');
    sendJson(res, 200, promptRowToDto(row));
  });

  router.post('/system-prompts', async (req, res) => {
    const { name, content } = req.body || {};
    if (!name || typeof name !== 'string') return sendError(res, 400, 'name required');
    if (!content || typeof content !== 'string') return sendError(res, 400, 'content required');

    const db = await getDb();
    try {
      dbRun(db, 'INSERT INTO system_prompts (name, content) VALUES (?, ?)', [name, content]);
      let row = dbGet(db, 'SELECT * FROM system_prompts WHERE name = ?', [name]);
      if (!row) row = dbGet(db, 'SELECT * FROM system_prompts ORDER BY id DESC LIMIT 1');
      if (!row) return sendError(res, 500, 'insert ok but cannot read back row');
      sendJson(res, 201, promptRowToDto(row));
    } catch (e) {
      if (String(e?.message || '').includes('UNIQUE')) {
        return sendError(res, 409, 'name already exists');
      }
      return sendError(res, 500, String(e?.message || e));
    }
  });

  router.put('/system-prompts/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const { name, content } = req.body || {};
    if (!name || typeof name !== 'string') return sendError(res, 400, 'name required');
    if (!content || typeof content !== 'string') return sendError(res, 400, 'content required');

    const db = await getDb();
    try {
      const exists = dbGet(db, 'SELECT id FROM system_prompts WHERE id = ?', [id]);
      if (!exists) return sendError(res, 404, 'not found');

      dbRun(db, "UPDATE system_prompts SET name=?, content=?, updatedAt=datetime('now') WHERE id=?", [name, content, id]);
      const row = dbGet(db, 'SELECT * FROM system_prompts WHERE id = ?', [id]);
      if (!row) return sendError(res, 404, 'not found');
      sendJson(res, 200, promptRowToDto(row));
    } catch (e) {
      if (String(e?.message || '').includes('UNIQUE')) {
        return sendError(res, 409, 'name already exists');
      }
      return sendError(res, 500, String(e?.message || e));
    }
  });

  router.delete('/system-prompts/:id', async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid id');

    const db = await getDb();
    const row = dbGet(db, 'SELECT * FROM system_prompts WHERE id = ?', [id]);
    if (!row) return sendError(res, 404, 'not found');

    dbRun(db, 'DELETE FROM system_prompts WHERE id = ?', [id]);

    // 如果此 prompt 正在被选中，则清空选中
    const current = dbGet(db, "SELECT value FROM app_settings WHERE key='activeSystemPromptId'");
    if (current && String(current.value) === String(id)) {
      dbRun(db, "DELETE FROM app_settings WHERE key='activeSystemPromptId'");
    }

    res.statusCode = 204;
    res.end();
  });

  // ======================
  // App Settings API
  // ======================

  router.get('/settings/system-prompt', async (req, res) => {
    const db = await getDb();
    const row = dbGet(db, "SELECT value FROM app_settings WHERE key='activeSystemPromptId'");
    const id = row ? Number(row.value) : null;
    sendJson(res, 200, { activeSystemPromptId: Number.isFinite(id) ? id : null });
  });

  router.put('/settings/system-prompt', async (req, res) => {
    const { activeSystemPromptId } = req.body || {};
    const db = await getDb();

    if (activeSystemPromptId == null) {
      dbRun(db, "DELETE FROM app_settings WHERE key='activeSystemPromptId'");
      return sendJson(res, 200, { activeSystemPromptId: null });
    }

    const id = Number(activeSystemPromptId);
    if (!Number.isFinite(id)) return sendError(res, 400, 'invalid activeSystemPromptId');

    const exists = dbGet(db, 'SELECT id FROM system_prompts WHERE id = ?', [id]);
    if (!exists) return sendError(res, 404, 'system prompt not found');

    const existing = dbGet(db, "SELECT key FROM app_settings WHERE key='activeSystemPromptId'");
    if (existing) {
      dbRun(db, "UPDATE app_settings SET value=?, updatedAt=datetime('now') WHERE key='activeSystemPromptId'", [String(id)]);
    } else {
      dbRun(db, "INSERT INTO app_settings (key, value) VALUES ('activeSystemPromptId', ?)", [String(id)]);
    }

    sendJson(res, 200, { activeSystemPromptId: id });
  });

  // ======================
  // Workbook storage API
  // ======================

  // NOTE: SheetNext.getData() 的数据结构在不同版本/构建中可能不同。
  // 为了保证持久化稳定，这里不做“必须包含某字段(sheets等)”的强校验，
  // 只保证：1) 是对象 2) 可 JSON 序列化 3) size 在限制内。

  function isSerializableObject(obj) {
    return !!obj && typeof obj === 'object' && !Array.isArray(obj);
  }

  // Get latest workbook snapshot
  router.get('/workbook/latest', async (req, res) => {
    const workbookKey = String(req.query?.key || 'default');
    const db = await getDb();
    const row = dbGet(db, 'SELECT workbookKey, version, dataJson, updatedAt FROM workbook_snapshots WHERE workbookKey = ?', [workbookKey]);
    if (!row) return sendJson(res, 200, null);

    let data = null;
    try {
      data = JSON.parse(row.dataJson);
    } catch {
      // corrupted json: treat as missing
      return sendJson(res, 200, null);
    }

    sendJson(res, 200, {
      workbookKey: row.workbookKey,
      version: Number(row.version) || 0,
      data,
      updatedAt: row.updatedAt,
    });
  });

  // Delete workbook snapshot
  router.delete('/workbook/snapshot', async (req, res) => {
    const workbookKey = String(req.query?.key || 'default');
    const db = await getDb();
    const existing = dbGet(db, 'SELECT workbookKey FROM workbook_snapshots WHERE workbookKey = ?', [workbookKey]);
    if (!existing) {
      res.statusCode = 204;
      return res.end();
    }
    dbRun(db, 'DELETE FROM workbook_snapshots WHERE workbookKey = ?', [workbookKey]);
    res.statusCode = 204;
    res.end();
  });

  // Save workbook snapshot (upsert)
  router.post('/workbook/save', async (req, res) => {
    const { workbookKey = 'default', data, version } = req.body || {};
    const key = String(workbookKey || 'default');
    if (!isSerializableObject(data)) return sendError(res, 400, 'data required');

    // hard limit to reduce accidental huge payloads
    let dataJson = '';
    try {
      dataJson = JSON.stringify(data);
    } catch {
      return sendError(res, 400, 'data not serializable');
    }

    const MAX_BYTES = 2 * 1024 * 1024; // 2MB
    if (Buffer.byteLength(dataJson, 'utf8') > MAX_BYTES) {
      return sendError(res, 413, 'workbook data too large (limit 2MB)');
    }

    const db = await getDb();
    const existing = dbGet(db, 'SELECT workbookKey, version FROM workbook_snapshots WHERE workbookKey = ?', [key]);

    if (!existing) {
      dbRun(db, "INSERT INTO workbook_snapshots (workbookKey, version, dataJson) VALUES (?, ?, ?)", [key, 1, dataJson]);
      return sendJson(res, 201, { ok: true, workbookKey: key, version: 1 });
    }

    const currentVersion = Number(existing.version) || 0;
    const clientVersion = version == null ? null : Number(version);

    // Treat missing/0 as "no optimistic lock" (force save). This avoids startup/save loops
    // when there is already a snapshot in DB but the client hasn't loaded the version yet.
    const hasOptimisticLock = clientVersion != null && Number.isFinite(clientVersion) && clientVersion > 0;
    if (hasOptimisticLock && clientVersion !== currentVersion) {
      return sendJson(res, 409, { error: 'version conflict', workbookKey: key, currentVersion });
    }

    const nextVersion = currentVersion + 1;
    dbRun(db, "UPDATE workbook_snapshots SET dataJson=?, version=?, updatedAt=datetime('now') WHERE workbookKey=?", [dataJson, nextVersion, key]);
    return sendJson(res, 200, { ok: true, workbookKey: key, version: nextVersion });
  });

  return router;
}

