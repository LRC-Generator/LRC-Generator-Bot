import type { Attachment } from "discord.js";
import { lrcToCues } from "../lyrics/lrc.js";
import { createSession, type Session } from "./session.js";

/** A problem with what the user sent, worded for them. */
export class ConvertError extends Error {}

/** Lyrics files are a few kilobytes; anything near this isn't one. */
const MAX_FILE_BYTES = 512 * 1024;
const ACCEPTED_EXTENSIONS = [".lrc", ".txt"];

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
}

export function isLrcAttachment(attachment: Attachment): boolean {
  return extensionOf(attachment.name) === ".lrc";
}

/** Why an attachment can't be converted, or null when it looks fine. */
export function attachmentProblem(attachment: Attachment): string | null {
  if (!ACCEPTED_EXTENSIONS.includes(extensionOf(attachment.name))) {
    return `**${attachment.name}** isn't an LRC file. Send a \`.lrc\` file (or a \`.txt\` with LRC lyrics in it).`;
  }
  if (attachment.size > MAX_FILE_BYTES) {
    return `**${attachment.name}** is too big to be a lyrics file (the limit is ${MAX_FILE_BYTES / 1024} KB).`;
  }
  return null;
}

/**
 * Downloads a text attachment. UTF-8 unless a byte order mark says UTF-16,
 * which is how some Windows lyric tools save their files.
 */
export async function readAttachment(attachment: Attachment): Promise<string> {
  const response = await fetch(attachment.url).catch(() => null);
  if (!response?.ok) {
    throw new ConvertError(`I couldn't download **${attachment.name}** from Discord. Try again in a moment.`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? "utf-16le"
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  const text = new TextDecoder(encoding).decode(bytes);
  if (text.includes("\u0000")) {
    throw new ConvertError(`**${attachment.name}** doesn't look like a text file.`);
  }
  return text;
}

/** `My_Song.lrc` → `My_Song.srt`. */
export function srtFileName(sourceName: string): string {
  const dot = sourceName.lastIndexOf(".");
  const base = (dot > 0 ? sourceName.slice(0, dot) : sourceName).trim();
  return `${base || "lyrics"}.srt`;
}

/**
 * Converts LRC text and opens a session for its buttons. `described` names
 * the source in error messages, for text that didn't come from a file.
 */
export function convertLrc(
  text: string,
  sourceName: string,
  ownerId: string,
  described = `**${sourceName}**`,
): Session {
  const cues = lrcToCues(text);
  if (cues.length === 0) {
    throw new ConvertError(
      `I couldn't find any timed lyrics in ${described}. LRC lines start with a time, like \`[00:12.34] First line\`.`,
    );
  }
  return createSession({ ownerId, fileName: srtFileName(sourceName), cues });
}

export async function convertAttachment(attachment: Attachment, ownerId: string): Promise<Session> {
  const problem = attachmentProblem(attachment);
  if (problem) throw new ConvertError(problem);
  return convertLrc(await readAttachment(attachment), attachment.name, ownerId);
}
