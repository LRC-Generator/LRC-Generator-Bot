import { randomBytes } from "node:crypto";
import { NO_EDITS, type Edits } from "../lyrics/edits.js";
import type { Cue } from "../lyrics/lrc.js";

/** A converted file and the edits turned on for it, behind one set of buttons. */
export type Session = {
  id: string;
  /** The only user who may press the buttons. */
  ownerId: string;
  /** Name of the `.srt` file sent back. */
  fileName: string;
  /** The subtitles as converted, before any edits. */
  cues: Cue[];
  edits: Edits;
  lastUsed: number;
};

/** Sessions nobody has touched for this long are forgotten. */
const IDLE_MS = 24 * 60 * 60 * 1000;
/** Past this many, the least recently used are forgotten first. */
const MAX_SESSIONS = 2_000;

// Insertion order doubles as recency: every use moves a session to the end.
const sessions = new Map<string, Session>();

function remember(session: Session): void {
  session.lastUsed = Date.now();
  sessions.delete(session.id);
  sessions.set(session.id, session);
  for (const id of sessions.keys()) {
    if (sessions.size <= MAX_SESSIONS) break;
    sessions.delete(id);
  }
}

export function createSession(fields: {
  ownerId: string;
  fileName: string;
  cues: Cue[];
  /** Reuse an id when picking up a session the bot forgot, so its buttons keep working. */
  id?: string;
}): Session {
  const session: Session = {
    id: fields.id ?? randomBytes(6).toString("base64url"),
    ownerId: fields.ownerId,
    fileName: fields.fileName,
    cues: fields.cues,
    edits: NO_EDITS,
    lastUsed: Date.now(),
  };
  remember(session);
  return session;
}

export function getSession(id: string): Session | undefined {
  const session = sessions.get(id);
  if (!session) return undefined;
  if (Date.now() - session.lastUsed > IDLE_MS) {
    sessions.delete(id);
    return undefined;
  }
  remember(session);
  return session;
}

export function forgetSession(id: string): void {
  sessions.delete(id);
}

setInterval(() => {
  const cutoff = Date.now() - IDLE_MS;
  for (const [id, session] of sessions) {
    if (session.lastUsed < cutoff) sessions.delete(id);
  }
}, 10 * 60 * 1000).unref();
