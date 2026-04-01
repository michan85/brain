import { Database } from "bun:sqlite";
import { join } from "node:path";

const DB_PATH = join(import.meta.dir, "chat.db");

let db: Database;

export function initChatDb(): Database {
  db = new Database(DB_PATH, { create: true });
  db.exec("PRAGMA journal_mode=WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id),
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_conversation
    ON messages(conversation_id)
  `);

  return db;
}

export function getChatDb(): Database {
  if (!db) throw new Error("Chat DB not initialized");
  return db;
}

export interface Conversation {
  id: string;
  sessionId: string;
  title: string | null;
  createdAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

export function listConversations(): Conversation[] {
  const rows = getChatDb()
    .query("SELECT id, session_id, title, created_at FROM conversations ORDER BY created_at DESC")
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    sessionId: r.session_id,
    title: r.title,
    createdAt: r.created_at,
  }));
}

export function createConversation(id: string, sessionId: string, title: string | null): Conversation {
  const createdAt = Date.now();
  getChatDb()
    .query("INSERT INTO conversations (id, session_id, title, created_at) VALUES (?, ?, ?, ?)")
    .run(id, sessionId, title, createdAt);
  return { id, sessionId, title, createdAt };
}

export function getConversation(id: string): Conversation | null {
  const row = getChatDb()
    .query("SELECT id, session_id, title, created_at FROM conversations WHERE id = ?")
    .get(id) as any;
  if (!row) return null;
  return { id: row.id, sessionId: row.session_id, title: row.title, createdAt: row.created_at };
}

export function updateConversationTitle(id: string, title: string): void {
  getChatDb()
    .query("UPDATE conversations SET title = ? WHERE id = ?")
    .run(title, id);
}

export function getMessages(conversationId: string): Message[] {
  const rows = getChatDb()
    .query("SELECT id, conversation_id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC")
    .all(conversationId) as any[];
  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  }));
}

export function addMessage(id: string, conversationId: string, role: "user" | "assistant", content: string): Message {
  const createdAt = Date.now();
  getChatDb()
    .query("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, conversationId, role, content, createdAt);
  return { id, conversationId, role, content, createdAt };
}
