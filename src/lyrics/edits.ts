/**
 * The edits the buttons under a converted file can turn on. They're settings,
 * not one-off changes: each render starts from the subtitles as converted and
 * applies whatever is on, so any edit can be turned off again.
 */

import { censorLine } from "./censor.js";
import type { Cue } from "./lrc.js";
import { wrapSubtitleLine } from "./srt.js";

export type TextCase = "original" | "lower" | "upper";

export type Edits = {
  textCase: TextCase;
  removeParentheses: boolean;
  /** Swear words and slurs replaced with `****`. */
  censor: boolean;
  /** The most characters a subtitle line may have; null for no limit. */
  maxLineLength: number | null;
};

export const NO_EDITS: Edits = {
  textCase: "original",
  removeParentheses: false,
  censor: false,
  maxLineLength: null,
};

export const MIN_LINE_LENGTH = 1;
export const MAX_LINE_LENGTH = 999;

export function hasEdits(edits: Edits): boolean {
  return (
    edits.textCase !== NO_EDITS.textCase ||
    edits.removeParentheses !== NO_EDITS.removeParentheses ||
    edits.censor !== NO_EDITS.censor ||
    edits.maxLineLength !== NO_EDITS.maxLineLength
  );
}

/** A parenthesized aside with nothing nested inside it, plus the spaces before it. */
const PAREN_GROUP_RE = /[ \t]*(?:\([^()]*\)|（[^（）]*）)/g;

/**
 * Removes asides in parentheses such as `(Let's go)`, from lrc.notnick.io's
 * `stripParentheses`. Innermost groups go first so nested asides are removed
 * too; an unmatched `(` is left as it is.
 */
export function removeParentheses(line: string): string {
  let body = line;
  for (;;) {
    const next = body.replace(PAREN_GROUP_RE, "");
    if (next === body) break;
    body = next;
  }
  return body === line ? line : body.replace(/[ \t]{2,}/g, " ").trim();
}

function changeCase(line: string, textCase: TextCase): string {
  if (textCase === "lower") return line.toLowerCase();
  if (textCase === "upper") return line.toUpperCase();
  return line;
}

/**
 * The cues with `edits` applied. A cue that was nothing but an aside in
 * parentheses is left out, so nothing shows while it plays.
 */
export function applyEdits(cues: Cue[], edits: Edits): Cue[] {
  const out: Cue[] = [];
  for (const cue of cues) {
    let lines = cue.text.split("\n");
    if (edits.removeParentheses) {
      lines = lines.map(removeParentheses).filter((line) => line !== "");
      if (lines.length === 0) continue;
    }
    if (edits.censor) lines = lines.map(censorLine);
    lines = lines.map((line) => changeCase(line, edits.textCase));
    const max = edits.maxLineLength;
    if (max !== null) lines = lines.flatMap((line) => wrapSubtitleLine(line, max));
    out.push({ ...cue, text: lines.join("\n") });
  }
  return out;
}

/** "lowercase · no parentheses · censored · max 32 characters per line", or null. */
export function describeEdits(edits: Edits): string | null {
  const parts: string[] = [];
  if (edits.textCase === "lower") parts.push("lowercase");
  if (edits.textCase === "upper") parts.push("UPPERCASE");
  if (edits.removeParentheses) parts.push("no parentheses");
  if (edits.censor) parts.push("censored");
  if (edits.maxLineLength !== null) {
    parts.push(`max ${edits.maxLineLength} characters per line`);
  }
  return parts.length === 0 ? null : parts.join(" · ");
}
