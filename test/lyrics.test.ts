import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { censorLine } from "../src/lyrics/censor.js";
import { applyEdits, describeEdits, NO_EDITS, removeParentheses } from "../src/lyrics/edits.js";
import { type Cue, LAST_CUE_SECONDS, lrcToCues } from "../src/lyrics/lrc.js";
import { buildSrt, formatSrtTime, parseSrt, wrapSubtitleLine } from "../src/lyrics/srt.js";

const texts = (cues: Cue[]) => cues.map((cue) => cue.text);

describe("lrcToCues", () => {
  test("each line lasts until the next one starts", () => {
    const cues = lrcToCues("[00:01.00]One\n[00:03.50]Two\n[00:07.25]Three");
    assert.deepEqual(cues, [
      { start: 1, end: 3.5, text: "One" },
      { start: 3.5, end: 7.25, text: "Two" },
      { start: 7.25, end: 7.25 + LAST_CUE_SECONDS, text: "Three" },
    ]);
  });

  test("[length] sets when the last line ends", () => {
    const cues = lrcToCues("[length: 03:20]\n[03:10.00]Last");
    assert.equal(cues.at(-1)?.end, 200);
  });

  test("[offset] shows every line earlier", () => {
    const cues = lrcToCues("[offset: 500]\n[00:02.00]One\n[00:04.00]Two");
    assert.deepEqual(cues.map((cue) => [cue.start, cue.end]), [
      [1.5, 3.5],
      [3.5, 8.5],
    ]);
  });

  test("a line with several tags repeats, in time order", () => {
    const cues = lrcToCues("[00:01.00][00:05.00]Chorus\n[00:03.00]Verse");
    assert.deepEqual(texts(cues), ["Chorus", "Verse", "Chorus"]);
  });

  test("an empty time tag ends the line before it early", () => {
    const cues = lrcToCues("[00:01.00]One\n[00:02.00]\n[00:09.00]Two");
    assert.deepEqual(cues[0], { start: 1, end: 2, text: "One" });
    assert.equal(cues.length, 2);
  });

  test("metadata, section headers and untimed lines are skipped", () => {
    const cues = lrcToCues("[ti: Song]\n[ar: Artist]\n[Chorus]\nno time\n\n[00:01.00]Lyric");
    assert.deepEqual(texts(cues), ["Lyric"]);
  });

  test("enhanced-LRC word tags are dropped", () => {
    const cues = lrcToCues("[00:01.00]<00:01.00>Hello <00:01.50>world");
    assert.deepEqual(texts(cues), ["Hello world"]);
  });

  test("Windows line endings and [mm:ss:xx] tags work", () => {
    const cues = lrcToCues("[00:01:50]One\r\n[00:02:00]Two\r\n");
    assert.deepEqual(cues.map((cue) => cue.start), [1.5, 2]);
  });

  test("a file without time tags has no cues", () => {
    assert.deepEqual(lrcToCues("Just some lyrics\nwith no times"), []);
  });
});

describe("SRT", () => {
  test("formats times as hh:mm:ss,mmm", () => {
    assert.equal(formatSrtTime(3661.5), "01:01:01,500");
    assert.equal(formatSrtTime(0.0004), "00:00:00,000");
  });

  test("builds numbered blocks and reads them back", () => {
    const cues = [
      { start: 1, end: 2.5, text: "One" },
      { start: 2.5, end: 4, text: "Two\nlines" },
    ];
    const srt = buildSrt(cues);
    assert.equal(srt, "1\n00:00:01,000 --> 00:00:02,500\nOne\n\n2\n00:00:02,500 --> 00:00:04,000\nTwo\nlines\n");
    assert.deepEqual(parseSrt(srt), cues);
  });

  test("wraps at spaces and only cuts words too long for a line", () => {
    assert.deepEqual(wrapSubtitleLine("the quick brown fox jumps", 10), ["the quick", "brown fox", "jumps"]);
    assert.deepEqual(wrapSubtitleLine("abcdefghij", 4), ["abcd", "efgh", "ij"]);
    assert.deepEqual(wrapSubtitleLine("short", 10), ["short"]);
  });
});

describe("edits", () => {
  const cues: Cue[] = [
    { start: 0, end: 1, text: "Hello (oh) World" },
    { start: 1, end: 2, text: "(Ooh ooh)" },
    { start: 2, end: 3, text: "We're never going back again" },
  ];

  test("no edits leaves the cues as they are", () => {
    assert.deepEqual(applyEdits(cues, NO_EDITS), cues);
  });

  test("removes parentheses, nested ones too, and drops lines left empty", () => {
    assert.equal(removeParentheses("Hello (oh) World"), "Hello World");
    assert.equal(removeParentheses("Go (so (very) high) now"), "Go now");
    assert.equal(removeParentheses("Fullwidth（はい）here"), "Fullwidthhere");
    assert.equal(removeParentheses("Unmatched ( stays"), "Unmatched ( stays");
    const edited = applyEdits(cues, { ...NO_EDITS, removeParentheses: true });
    assert.deepEqual(texts(edited), ["Hello World", "We're never going back again"]);
  });

  test("changes case", () => {
    assert.deepEqual(texts(applyEdits(cues, { ...NO_EDITS, textCase: "lower" }))[0], "hello (oh) world");
    assert.deepEqual(texts(applyEdits(cues, { ...NO_EDITS, textCase: "upper" }))[0], "HELLO (OH) WORLD");
  });

  test("wraps long lines without changing times", () => {
    const edited = applyEdits(cues, { ...NO_EDITS, maxLineLength: 12 });
    assert.equal(edited[2]?.text, "We're never\ngoing back\nagain");
    assert.deepEqual(edited.map((cue) => cue.start), cues.map((cue) => cue.start));
  });

  test("censors whole words, any case, and leaves clean words alone", () => {
    assert.equal(censorLine("What the fuck"), "What the ****");
    assert.equal(censorLine("Motherfuckin' SHIT, bullshit!"), "****' ****, ****!");
    assert.equal(censorLine("Kiss my ass, dumbass"), "Kiss my ****, ****");
    assert.equal(censorLine("Class, bass, a cocktail and Dickens"), "Class, bass, a cocktail and Dickens");
    const edited = applyEdits([{ start: 0, end: 1, text: "Oh shit\nno bitches" }], { ...NO_EDITS, censor: true });
    assert.deepEqual(texts(edited), ["Oh ****\nno ****"]);
  });

  test("combines edits", () => {
    const all = { textCase: "upper", removeParentheses: true, censor: true, maxLineLength: 12 } as const;
    const edited = applyEdits(cues, all);
    assert.deepEqual(texts(edited), ["HELLO WORLD", "WE'RE NEVER\nGOING BACK\nAGAIN"]);
    assert.equal(
      describeEdits(all),
      "UPPERCASE · no parentheses · censored · max 12 characters per line",
    );
    assert.equal(describeEdits(NO_EDITS), null);
  });
});
