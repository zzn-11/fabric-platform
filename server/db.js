// 数据库抽象层：支持本地 SQLite(better-sqlite3) 与云端 Turso(@libsql/client)
// 通过环境变量切换：配置了 TURSO_URL(和可选 TURSO_TOKEN) 则用云端，否则用本地文件。
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const TURSO_URL = process.env.TURSO_URL || '';
const TURSO_TOKEN = process.env.TURSO_TOKEN || '';
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

const mode = TURSO_URL ? 'remote' : 'local';

// ---------- 本地实现 ----------
let localDb = null;
if (mode === 'local') {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  localDb = new Database(DB_PATH);
  localDb.pragma('journal_mode = WAL');
}

// 统一异步接口
const db = {
  mode,
  async exec(sql) {
    if (mode === 'local') { localDb.exec(sql); return; }
    const { createClient } = require('@libsql/client');
    const c = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN || undefined });
    try { await c.executeMultiple(sql); } finally { c.close(); }
  },
  // SELECT 返回行数组
  async all(sql, params = []) {
    if (mode === 'local') {
      return localDb.prepare(sql).all(...params);
    }
    const { createClient } = require('@libsql/client');
    const c = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN || undefined });
    try {
      const r = await c.execute({ sql, args: params });
      // 列名
      const cols = r.columns.map(col => col.name);
      return r.rows.map(row => {
        const obj = {};
        cols.forEach((cname, i) => { obj[cname] = row[i]; });
        return obj;
      });
    } finally { c.close(); }
  },
  // SELECT 返回单行(取第一条)，无则 undefined
  async get(sql, params = []) {
    const rows = await db.all(sql, params);
    return rows[0];
  },
  // INSERT/UPDATE/DELETE 执行，返回 { changes }
  async run(sql, params = []) {
    if (mode === 'local') {
      const info = localDb.prepare(sql).run(...params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    }
    const { createClient } = require('@libsql/client');
    const c = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN || undefined });
    try {
      const r = await c.execute({ sql, args: params });
      return { changes: r.rowsAffected, lastInsertRowid: null };
    } finally { c.close(); }
  }
};

module.exports = { db, mode };
