// using sqlite fts5

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface StoredMessage {
  id: number;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO
}

// make a folder 'data' in root and store in there
const DB_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'conversations.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL'); // better concurrency
db.pragma('foreign_keys = ON'); // by default, foreign keys are off

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id         TEXT PRIMARY KEY,
    started_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT    NOT NULL REFERENCES sessions(id),
    role       TEXT    NOT NULL CHECK(role IN ('user', 'assistant')),
    content    TEXT    NOT NULL,
    timestamp  TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session
    ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_messages_timestamp
    ON messages(timestamp);
`);

// fts5 virtual table for full-text search across all messages.
// content='' makes it not store original text content, it will store only the index
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts
  USING fts5(content, content='', content_rowid='rowid');
`);


const insertSession = db.prepare(
  `INSERT OR IGNORE INTO sessions (id, started_at) VALUES (?, ?)`
);

const insertMessage = db.prepare(
  `INSERT INTO messages (session_id, role, content, timestamp)
  VALUES (?, ?, ?, ?)`
);

const insertFts = db.prepare(
  `INSERT INTO messages_fts (rowid, content) VALUES (?, ?)`
);

const selectBySession = db.prepare(
  `SELECT * FROM messages WHERE session_id = ? ORDER BY id ASC`
);

const selectByDateRange = db.prepare(
  `SELECT * FROM messages
  WHERE timestamp >= ? AND timestamp < ?
  ORDER BY id ASC
  LIMIT 100`
);

const searchFts = db.prepare(
  `SELECT m.*
  FROM messages_fts f
  JOIN messages m ON m.id = f.rowid
  WHERE messages_fts MATCH ?
  ORDER BY rank
  LIMIT ?`
);

const selectRecent = db.prepare(
  `SELECT * FROM messages
  WHERE session_id != ?
  ORDER BY id DESC
  LIMIT ?`
);

export function close(): void {
  db.close();
}

export function createSession(sessionId: string): void {
  insertSession.run(sessionId, new Date().toISOString())
}

export function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): StoredMessage {
  const timestamp = new Date().toISOString();
  const info = insertMessage.run(sessionId, role, content, timestamp);
  const id = Number(info.lastInsertRowid);

  insertFts.run(id, content);

  return { id, sessionId, role, content, timestamp };
}

export function getSessionMessages(sessionId: string): StoredMessage[] {
  return selectBySession.all(sessionId) as StoredMessage[];
}

export function getMessagesByDateRange(
  from: string,
  to: string,
): StoredMessage[] {
  return selectByDateRange.all(from, to) as StoredMessage[];
}

export function getRecentMessages(
  excludeSessionId: string,
  limit = 20,
): StoredMessage[] {
  return selectRecent.all(excludeSessionId, limit) as StoredMessage[];
}

/**
 * Full-text search across all stored messages.
 */
export function searchMessages(
  query: string,
  limit = 20,
): StoredMessage[] {
  try {
    // wrap each word in quotes
    const sanitized = query
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => `"${w.replace(/"/g, '')}"`)
      .join(' OR ');

    if (!sanitized) return [];
    return searchFts.all(sanitized, limit) as StoredMessage[];
  } catch {
    // fts query syntax error
    return [];
  }
}

