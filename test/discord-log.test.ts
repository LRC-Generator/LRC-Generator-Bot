import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { type BaseInteraction, InteractionContextType } from "discord.js";
import {
  BOT_SOFTWARE,
  buildConversionLogPayload,
  type DiscordDetails,
  interactionDetails,
  isDiscordWebhookUrl,
} from "../src/convert/discord-log.js";

const inServer: DiscordDetails = { place: "server", install: "server", serverLanguage: "en-US" };

describe("buildConversionLogPayload", () => {
  const now = new Date("2026-11-22T12:00:00Z");

  test("reports the file like the site's download log", () => {
    const payload = buildConversionLogPayload(
      { fileName: "My Song.srt", subtitles: 42, source: "command", discord: inServer, language: "en-GB" },
      now,
    );
    assert.equal(payload.username, "LRC Generator");
    assert.deepEqual(payload.allowed_mentions, { parse: [] });
    const [embed] = payload.embeds;
    assert.equal(embed?.title, "Downloaded .srt");
    assert.equal(embed?.color, 0x30d158);
    assert.equal(embed?.timestamp, "2026-11-22T12:00:00.000Z");
    assert.deepEqual(
      embed?.fields.map((field) => [field.name, field.value]),
      [
        ["File", "`My Song.srt`"],
        ["Lines", "42"],
        ["Lyrics", "Converted on Discord"],
        ["Edited first", "No"],
        ["Theme", "N/A"],
        ["Session", "N/A"],
        ["Audio", "N/A"],
        ["Saved this session", "N/A"],
        ["Language", "en-GB"],
        ["Came from", "/convert with a file"],
        ["Source", `Discord · Server · Added to the server · server language en-US · ${BOT_SOFTWARE}`],
      ],
    );
    // Laid out like the site's: Audio and Source take a whole row.
    assert.deepEqual(
      embed?.fields.filter((field) => !("inline" in field)).map((field) => field.name),
      ["Audio", "Source"],
    );
  });

  test("a file name can't break out of its code block or run over lines", () => {
    const payload = buildConversionLogPayload(
      { fileName: "a`b\n@everyone.srt", subtitles: 1, source: "dropped", discord: { place: "botDm", install: null, serverLanguage: null }, language: null },
      now,
    );
    const fields = payload.embeds[0]?.fields ?? [];
    assert.equal(fields[0]?.value, "`a'b @everyone.srt`");
    const value = (name: string) => fields.find((field) => field.name === name)?.value;
    assert.equal(value("Came from"), "Dropped in chat");
    assert.equal(value("Source"), `Discord · DM with the bot · ${BOT_SOFTWARE}`);
    assert.equal(value("Language"), "N/A");
  });
});

test("the bot's software has real version numbers", () => {
  assert.match(BOT_SOFTWARE, /^LRC Generator Bot \d+\.\d+\.\d+ \(discord\.js \d+\.\d+\.\d+; Node\.js \d+\.\d+\.\d+\)$/);
});

describe("interactionDetails", () => {
  /** Just the parts of an interaction that `interactionDetails` reads. */
  const fake = (parts: {
    context: InteractionContextType | null;
    guildId?: string;
    userId?: string;
    guildLocale?: string;
  }) =>
    ({
      context: parts.context,
      inGuild: () => parts.context === InteractionContextType.Guild,
      authorizingIntegrationOwners: { guildId: parts.guildId ?? null, userId: parts.userId ?? null },
      guildLocale: parts.guildLocale ?? null,
    }) as unknown as BaseInteraction;

  test("in a server the bot was added to", () => {
    assert.deepEqual(
      interactionDetails(
        fake({ context: InteractionContextType.Guild, guildId: "123", guildLocale: "en-US" }),
      ),
      inServer,
    );
  });

  test("a DM with the bot doesn't count as added to a server", () => {
    // Discord sends the server install as "0" here.
    assert.deepEqual(interactionDetails(fake({ context: InteractionContextType.BotDM, guildId: "0" })), {
      place: "botDm",
      install: null,
      serverLanguage: null,
    });
  });

  test("added to someone's own account, used in a group chat", () => {
    assert.deepEqual(
      interactionDetails(fake({ context: InteractionContextType.PrivateChannel, userId: "456" })),
      { place: "otherDm", install: "user", serverLanguage: null },
    );
  });
});

describe("isDiscordWebhookUrl", () => {
  test("accepts Discord webhooks only", () => {
    assert.ok(isDiscordWebhookUrl("https://discord.com/api/webhooks/1/abc"));
    assert.ok(isDiscordWebhookUrl("https://canary.discord.com/api/webhooks/1/abc"));
    assert.ok(!isDiscordWebhookUrl("http://discord.com/api/webhooks/1/abc"));
    assert.ok(!isDiscordWebhookUrl("https://discord.com.evil.example/api/webhooks/1/abc"));
    assert.ok(!isDiscordWebhookUrl("not a url"));
  });
});
