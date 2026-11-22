/**
 * What the bot posts to the `LOGGING` webhook each time it converts a file.
 * It has the same fields, in the same order, as lrc.notnick.io's download log
 * (`buildSessionLogPayload` in its `src/lib/session-log.ts`), so both land in
 * the same channel looking alike. Fields only a browser can fill say "N/A".
 */

import { readFileSync } from "node:fs";
import {
  type BaseInteraction,
  InteractionContextType,
  type Message,
  version as discordJsVersion,
} from "discord.js";

/** The site's name and theme colour, as its log uses them. */
const SITE_NAME = "LRC Generator";
const THEME_COLOR = "#30d158";

/**
 * The bot's own software, the closest thing it has to the site's browser
 * string. It also makes Source long enough to wrap, which widens the embed to
 * Discord's full width, as the browser string does on the site's.
 */
export const BOT_SOFTWARE = `LRC Generator Bot ${botVersion()} (discord.js ${discordJsVersion}; Node.js ${process.versions.node})`;

/** The version in package.json, two folders up from here in `src/` and `dist/` alike. */
function botVersion(): string {
  try {
    const pkg: unknown = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));
    const version = (pkg as { version?: unknown }).version;
    return typeof version === "string" ? version : "unknown";
  } catch {
    return "unknown";
  }
}

/** For the site's fields that only make sense in a browser. */
const NOT_APPLICABLE = "N/A";

const FILE_NAME_MAX_LENGTH = 200;

/** How the lyrics reached the bot. */
export type ConversionSource = "command" | "form" | "pasted" | "dropped";

const SOURCE_LABELS: Record<ConversionSource, string> = {
  command: "/convert with a file",
  form: "Upload form",
  pasted: "Pasted in the form",
  dropped: "Dropped in chat",
};

/** Where in Discord it happened. */
export type DiscordPlace = "server" | "botDm" | "otherDm";

const PLACE_LABELS: Record<DiscordPlace, string> = {
  server: "Server",
  botDm: "DM with the bot",
  // Only reachable when someone has added the bot to their own account.
  otherDm: "Other DM or group chat",
};

/** Whether the bot was added to the server, or by the user to their own account. */
export type InstallType = "server" | "user";

const INSTALL_LABELS: Record<InstallType, string> = {
  server: "Added to the server",
  user: "Added to their account",
};

/**
 * What Discord says about where the bot was used, for the Source field.
 * Discord doesn't tell bots which device or app someone is on, so this is as
 * close to the site's Browser field as it gets.
 */
export type DiscordDetails = {
  place: DiscordPlace;
  /** Null when Discord doesn't say: it only does for slash commands and forms. */
  install: InstallType | null;
  /** The server's preferred language, like "en-US"; null outside a server. */
  serverLanguage: string | null;
};

/** The details for a slash command or form. Only labels are kept, never the IDs Discord sends. */
export function interactionDetails(interaction: BaseInteraction): DiscordDetails {
  const place: DiscordPlace =
    interaction.context === InteractionContextType.PrivateChannel
      ? "otherDm"
      : interaction.context === InteractionContextType.BotDM
        ? "botDm"
        : interaction.inGuild()
          ? "server"
          : "botDm";

  // In a DM with the bot, the server install is there but set to "0".
  const owners = interaction.authorizingIntegrationOwners;
  const install: InstallType | null =
    owners.guildId && owners.guildId !== "0" ? "server" : owners.userId ? "user" : null;

  return { place, install, serverLanguage: interaction.guildLocale ?? null };
}

/**
 * The details for a dropped file. Bots only see messages in their own DMs
 * and in servers they were added to.
 */
export function messageDetails(message: Message): DiscordDetails {
  return message.inGuild()
    ? { place: "server", install: "server", serverLanguage: message.guild.preferredLocale }
    : { place: "botDm", install: null, serverLanguage: null };
}

/** One conversion, as the log reports it. Nothing about who asked for it. */
export type ConversionLog = {
  /** The `.srt` file's name. */
  fileName: string;
  /** Subtitles in the file. */
  subtitles: number;
  source: ConversionSource;
  discord: DiscordDetails;
  /**
   * The language the user's Discord is set to, like "en-GB". Discord only
   * says for slash commands and forms, so null for dropped files.
   */
  language: string | null;
};

/** One line of plain text, short enough for a Discord field. */
function cleanName(name: string): string {
  const text = name
    .replace(/[\s\u0000-\u001f\u007f]+/g, " ")
    .trim()
    .slice(0, FILE_NAME_MAX_LENGTH);
  return text || "(no name)";
}

/** A language code like "en-GB", the shape the site accepts; "N/A" otherwise. */
function cleanLanguage(language: string | null): string {
  return language && /^[A-Za-z0-9-]{1,35}$/.test(language) ? language : NOT_APPLICABLE;
}

/**
 * "Discord · Server · added to the server · server language en-US · LRC
 * Generator Bot 1.0.0 (discord.js 14.28.1; Node.js 22.22.0)".
 */
function describeDiscord(details: DiscordDetails): string {
  const serverLanguage = cleanLanguage(details.serverLanguage);
  return [
    "Discord",
    PLACE_LABELS[details.place],
    details.install && INSTALL_LABELS[details.install],
    serverLanguage !== NOT_APPLICABLE && `server language ${serverLanguage}`,
    BOT_SOFTWARE,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A file name as Discord code, so nothing in it reads as a link, a mention
 * or formatting.
 */
function asCode(text: string): string {
  return `\`${text.replace(/`/g, "'")}\``;
}

/** The JSON body Discord expects. Mentions are disabled so a file name can't ping anyone. */
export function buildConversionLogPayload(log: ConversionLog, now = new Date()) {
  return {
    username: SITE_NAME,
    embeds: [
      {
        title: "Downloaded .srt",
        color: parseInt(THEME_COLOR.slice(1), 16),
        fields: [
          { name: "File", value: asCode(cleanName(log.fileName)), inline: true },
          { name: "Lines", value: String(log.subtitles), inline: true },
          // The site's label for this source on /usage.
          { name: "Lyrics", value: "Converted on Discord", inline: true },
          // Logged as it's converted, before any of the edit buttons.
          { name: "Edited first", value: "No", inline: true },
          { name: "Theme", value: NOT_APPLICABLE, inline: true },
          { name: "Session", value: NOT_APPLICABLE, inline: true },
          { name: "Audio", value: NOT_APPLICABLE },
          { name: "Saved this session", value: NOT_APPLICABLE, inline: true },
          { name: "Language", value: cleanLanguage(log.language), inline: true },
          { name: "Came from", value: SOURCE_LABELS[log.source], inline: true },
          // Where the site puts the visitor's browser.
          { name: "Source", value: describeDiscord(log.discord) },
        ],
        timestamp: now.toISOString(),
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}
