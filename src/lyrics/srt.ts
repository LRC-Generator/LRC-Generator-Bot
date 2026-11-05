/**
 * Writes and reads SubRip (`.srt`) subtitles. The writer and line wrapping are
 * ported from lrc.notnick.io (`src/lib/srt.ts`).
 */

import type { Cue } from "./lrc.js";

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}

/** `hh:mm:ss,mmm`, the SRT timestamp format. */
export function formatSrtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(secs, 2)},${pad(total % 1000, 3)}`;
}

/** One numbered SRT block. */
export function formatSrtCue(cue: Cue, index: number): string {
  return `${index + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}`;
}

/** Content for an `.srt` file. Subtitles are numbered from 1. */
export function buildSrt(cues: Cue[]): string {
  return cues.length === 0 ? "" : `${cues.map(formatSrtCue).join("\n\n")}\n`;
}

const SRT_TIME = String.raw`(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})`;
const SRT_TIMING_RE = new RegExp(
  String.raw`^\s*${SRT_TIME}\s*-->\s*${SRT_TIME}\s*$`,
);

function srtSeconds(h: string, m: string, s: string, frac: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(`0.${frac}`);
}

/**
 * Reads SRT text back into cues. Lenient: anything that isn't a time range
 * followed by text is skipped. Used to pick up a file the bot sent earlier.
 */
export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = [];
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const timingAt = lines.findIndex((line) => SRT_TIMING_RE.test(line));
    if (timingAt === -1) continue;
    const m = SRT_TIMING_RE.exec(lines[timingAt]!)!;
    const start = srtSeconds(m[1]!, m[2]!, m[3]!, m[4]!);
    const end = srtSeconds(m[5]!, m[6]!, m[7]!, m[8]!);
    const body = lines
      .slice(timingAt + 1)
      .map((line) => line.trim())
      .filter((line) => line !== "");
    if (body.length === 0 || end <= start) continue;
    cues.push({ start, end, text: body.join("\n") });
  }
  return cues;
}

const WORD_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "word" });
const CHARACTER_SEGMENTER = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

/** What a reader sees as characters, so an emoji is never cut in two. */
function characters(text: string): string[] {
  return Array.from(CHARACTER_SEGMENTER.segment(text), (part) => part.segment);
}

function charCount(text: string): number {
  return characters(text).length;
}

/** The words in a run of text, each with the punctuation that follows it. */
function splitWords(text: string): string[] {
  const words: string[] = [];
  for (const { segment, isWordLike } of WORD_SEGMENTER.segment(text)) {
    if (isWordLike || words.length === 0) words.push(segment);
    else words[words.length - 1] += segment;
  }
  return words;
}

/** Cuts a word into pieces of `max` characters, the last perhaps shorter. */
function cutWord(word: string, max: number): string[] {
  const chars = characters(word);
  const pieces: string[] = [];
  for (let at = 0; at < chars.length; at += max) {
    pieces.push(chars.slice(at, at + max).join(""));
  }
  return pieces;
}

/**
 * Breaks a line of subtitle text into lines of at most `max` characters (at
 * least 1), filling each before starting the next. Lines break at spaces, or
 * between words in text written without them, such as Japanese. Only a word
 * too long for a line of its own is cut.
 */
export function wrapSubtitleLine(line: string, max: number): string[] {
  if (charCount(line) <= max) return [line];
  const rows: string[] = [];
  let row = "";
  const add = (gap: string, piece: string) => {
    if (row === "") {
      row = piece;
    } else if (charCount(row + gap + piece) <= max) {
      row += gap + piece;
    } else {
      rows.push(row);
      row = piece;
    }
  };
  for (const [, gap = "", word = ""] of line.trim().matchAll(/(\s*)(\S+)/g)) {
    if (charCount(word) <= max) {
      add(gap, word);
    } else {
      splitWords(word)
        .flatMap((part) => cutWord(part, max))
        .forEach((part, index) => add(index === 0 ? gap : "", part));
    }
  }
  rows.push(row);
  return rows;
}
