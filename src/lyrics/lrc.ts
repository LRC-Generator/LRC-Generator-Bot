/**
 * Reads LRC lyrics into subtitle cues. Ported from lrc.notnick.io
 * (`src/lib/lrc.ts` and `lrcToSrtCues` in `src/lib/srt.ts`), so the bot and the
 * site turn the same file into the same subtitles.
 *
 * LRC only says when each line starts, so a cue lasts until the next time in
 * the file. A time tag with no text after it ends the line before it early
 * (handy for instrumental breaks). Nothing follows the last line, so it runs
 * to the end of the song when `[length: …]` says how long that is, or for a
 * fixed few seconds when it doesn't.
 */

export type Cue = {
  /** Seconds from the start of the song. */
  start: number;
  end: number;
  /** One or more lines, joined with `\n`. */
  text: string;
};

/** How long the last subtitle stays up when the song's length isn't known. */
export const LAST_CUE_SECONDS = 5;

const TIME_TAG = String.raw`\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]`;
const TIME_TAG_GLOBAL_RE = new RegExp(TIME_TAG, "g");
const LEADING_TIME_TAGS_RE = new RegExp(String.raw`^(?:\s*${TIME_TAG})+\s*`);
/** Enhanced-LRC word tags such as `<00:12.34>`. */
const WORD_TAG_GLOBAL_RE = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;
/** Metadata lines such as `[ti: Title]`, `[ar: Artist]`, `[offset: 500]`. */
const ID_TAG_LINE_RE =
  /^\s*\[(?:ti|ar|al|au|by|offset|re|ve|length|lr|la|tool|#)\s*:[^\]]*\]\s*$/i;
/** `[offset: +500]`: milliseconds to show every line earlier (later if negative). */
const OFFSET_LINE_RE = /^\s*\[offset\s*:\s*([+-]?\d+)\s*\]\s*$/i;
/** `[length: 03:25]`: how long the song is. */
const LENGTH_LINE_RE =
  /^\s*\[length\s*:\s*(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\s*\]\s*$/i;

function tagToSeconds(min: string, sec: string, frac?: string): number {
  const fraction = frac ? Number(`0.${frac}`) : 0;
  return Number(min) * 60 + Number(sec) + fraction;
}

/**
 * One cue per time tag, in time order. Untimed lines and metadata are left
 * out, `[offset: …]` is applied, and a line with several tags (a repeated
 * chorus) becomes one cue per tag.
 */
export function lrcToCues(text: string): Cue[] {
  let offset = 0;
  let duration: number | null = null;
  const stamps: { time: number; text: string }[] = [];

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.trim() === "") continue;

    if (ID_TAG_LINE_RE.test(line)) {
      const offsetTag = OFFSET_LINE_RE.exec(line);
      if (offsetTag) offset = Number(offsetTag[1]) / 1000;
      const lengthTag = LENGTH_LINE_RE.exec(line);
      if (lengthTag) {
        duration = tagToSeconds(lengthTag[1]!, lengthTag[2]!, lengthTag[3]);
      }
      continue;
    }

    const prefix = LEADING_TIME_TAGS_RE.exec(line)?.[0];
    // Untimed text (section headers, notes): players skip it, and so do we.
    if (!prefix) continue;

    const lyric = line
      .slice(prefix.length)
      .replace(WORD_TAG_GLOBAL_RE, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
    for (const tag of prefix.matchAll(TIME_TAG_GLOBAL_RE)) {
      stamps.push({ time: tagToSeconds(tag[1]!, tag[2]!, tag[3]), text: lyric });
    }
  }

  // Stable, so lines stamped at the same moment keep their order.
  stamps.sort((a, b) => a.time - b.time);

  const cues: Cue[] = [];
  stamps.forEach((stamp, index) => {
    if (stamp.text === "") return;
    let next = index + 1;
    while (next < stamps.length && stamps[next]!.time <= stamp.time) next += 1;
    // A positive offset shows the lyrics earlier.
    const start = Math.max(0, stamp.time - offset);
    let end: number;
    if (next < stamps.length) {
      end = stamps[next]!.time - offset;
    } else if (duration !== null && duration > start) {
      end = duration;
    } else {
      end = start + LAST_CUE_SECONDS;
    }
    // Nothing to show when the offset pushes the whole line before 0:00.
    if (end <= start) return;
    cues.push({ start, end, text: stamp.text });
  });
  return cues;
}
