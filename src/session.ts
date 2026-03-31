// Session persistence - save/load conversation history to ~/.mcc/sessions/

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const SESSION_DIR = path.join(os.homedir(), ".mcc", "sessions");

export interface SessionMetadata {
  id: string;
  cwd: string;
  provider: string;
  model: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  summary: string;
}

export interface SessionData extends SessionMetadata {
  messages: ChatCompletionMessageParam[];
}

/** Generate a short session ID (timestamp-based) */
export function generateSessionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Ensure session directory exists */
function ensureDir(): void {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

/** Save session to disk */
export function saveSession(data: SessionData): void {
  ensureDir();
  const filePath = path.join(SESSION_DIR, `${data.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** Load a session by ID */
export function loadSession(id: string): SessionData | null {
  const filePath = path.join(SESSION_DIR, `${id}.json`);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

/** List recent sessions (newest first, max 20) */
export function listSessions(): SessionMetadata[] {
  ensureDir();
  return fs.readdirSync(SESSION_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        const raw = fs.readFileSync(path.join(SESSION_DIR, f), "utf-8");
        const data = JSON.parse(raw) as SessionData;
        const { messages: _, ...meta } = data;
        return meta;
      } catch {
        return null;
      }
    })
    .filter((m): m is SessionMetadata => m !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20);
}

/** Get the most recent session for this cwd, or the most recent overall */
export function getLastSession(cwd: string): SessionMetadata | null {
  const sessions = listSessions();
  return sessions.find(s => s.cwd === cwd) || sessions[0] || null;
}

/** Extract summary from first user message */
export function extractSummary(messages: ChatCompletionMessageParam[]): string {
  const firstUser = messages.find(m => m.role === "user");
  if (!firstUser) return "(empty session)";
  const content = typeof firstUser.content === "string" ? firstUser.content : "";
  return content.slice(0, 80) + (content.length > 80 ? "..." : "");
}
