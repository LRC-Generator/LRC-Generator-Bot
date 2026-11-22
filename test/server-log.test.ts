import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  ENTRY_MAX_LENGTH,
  formatEntry,
  type LogEntry,
  redact,
  secretsFrom,
  takeMessage,
} from "../src/logging/server-log-format.js";

const time = new Date("2026-11-22T14:31:02Z");
const entry = (level: LogEntry["level"], text: string): LogEntry => ({ level, text, time });

describe("formatEntry", () => {
  test("shows the time in UTC and the level", () => {
    assert.equal(formatEntry(entry("error", "Oh no")), "[14:31:02] ERROR Oh no");
  });

  test("can't close the code block it's shown in", () => {
    assert.ok(!formatEntry(entry("info", "a ``` b")).includes("```"));
  });

  test("cuts a huge entry short and says by how much", () => {
    const line = formatEntry(entry("info", "x".repeat(ENTRY_MAX_LENGTH + 10)));
    assert.ok(line.endsWith("… (10 more characters)"));
  });
});

describe("takeMessage", () => {
  test("is coloured and titled by the worst level", () => {
    const message = takeMessage([entry("info", "a"), entry("error", "b"), entry("warn", "c")], "host");
    const embed = message?.payload.embeds[0];
    assert.equal(message?.count, 3);
    assert.equal(embed?.title, "Error");
    assert.equal(embed?.color, 0xed4245);
    assert.equal(embed?.footer.text, "host");
    assert.deepEqual(message?.payload.allowed_mentions, { parse: [] });
    assert.equal(
      embed?.description,
      "```\n[14:31:02] INFO  a\n[14:31:02] ERROR b\n[14:31:02] WARN  c\n```",
    );
  });

  test("leaves what doesn't fit for the next message", () => {
    const queue = Array.from({ length: 10 }, () => entry("info", "y".repeat(ENTRY_MAX_LENGTH)));
    const message = takeMessage(queue, "host");
    assert.equal(message?.count, 2);
    assert.ok((message?.payload.embeds[0]?.description.length ?? 0) <= 4096);
  });

  test("has nothing to send for an empty queue", () => {
    assert.equal(takeMessage([], "host"), null);
  });
});

describe("redact", () => {
  test("hides tokens, URLs and the passwords in them", () => {
    const secrets = secretsFrom([
      "MTIzNDU2Nzg5.token.value",
      "postgres://user:s3cret-pass@db.example:5432/postgres",
      undefined,
      "short",
    ]);
    assert.equal(
      redact(
        "token MTIzNDU2Nzg5.token.value, url postgres://user:s3cret-pass@db.example:5432/postgres, password s3cret-pass, short",
        secrets,
      ),
      "token [redacted], url [redacted], password [redacted], short",
    );
  });
});
