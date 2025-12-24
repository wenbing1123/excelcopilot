import path from 'node:path';
import fs from 'node:fs';
import initSqlJs from 'sql.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'sheetnext.db');

let SQL = null;
let db = null;

async function ensureSql() {
  if (SQL) return SQL;
  // sql.js wasm 会从 node_modules 中加载
  SQL = await initSqlJs({
    locateFile: (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file),
  });
  return SQL;
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadDbBytes() {
  try {
    return fs.readFileSync(DB_PATH);
  } catch {
    return null;
  }
}

function saveDb() {
  if (!db) return;
  ensureDataDir();
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export async function getDb() {
  if (db) return db;
  const SQL = await ensureSql();
  ensureDataDir();

  const bytes = loadDbBytes();
  db = bytes ? new SQL.Database(bytes) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS llm_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      provider TEXT NOT NULL,
      baseUrl TEXT,
      apiKey TEXT,
      modelName TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 会话表（一个会话包含多条消息）
  db.run(`
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 消息表
  db.run(`
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversationId INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);

  // 系统提示词（System Prompt）
  db.run(`
    CREATE TABLE IF NOT EXISTS system_prompts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 应用设置（Key-Value）
  db.run(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  saveDb();
  return db;
}

export function dbAll(database, sql, params = []) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function dbGet(database, sql, params = []) {
  const stmt = database.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

export function dbRun(database, sql, params = []) {
  database.run(sql, params);
  saveDb();
}
