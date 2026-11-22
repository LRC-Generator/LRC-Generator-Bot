/**
 * Sends what the bot writes to the console (startup, errors, crashes,
 * disconnects, shutdowns) to the `SERVER_LOGGING` Discord webhook as well. The
 * console still gets everything, so pm2's log files are unchanged.
 *
 * Import this before anything else, so it sees everything from the start.
 * Without `SERVER_LOGGING` it does nothing.
 */

import { hostname } from "node:os";
import { formatWithOptions } from "node:util";
import { optionalEnv } from "../env.js";
import { type LogEntry, type LogLevel, redact, secretsFrom, takeMessage } from "./server-log-format.js";
import { isDiscordWebhookUrl, postToWebhook } from "./webhook.js";

/** One message at most this often: Discord allows a webhook about 5 every 2 seconds. */
const SEND_INTERVAL_MS = 2_000;
/** Past this many waiting lines, more are counted but not kept, so a flood can't eat memory. */
const QUEUE_MAX = 500;
const SEND_TIMEOUT_MS = 5_000;

/**
 * The console as it was. The server log's own problems go only here: sent to
 * Discord, a failure to reach Discord would loop.
 */
const original = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const webhookUrl = (() => {
  const url = optionalEnv("SERVER_LOGGING");
  if (url && !isDiscordWebhookUrl(url)) {
    original.error("SERVER_LOGGING isn't a Discord webhook URL, so server logs stay on the server");
    return undefined;
  }
  return url;
})();

/** Never sent to Discord, even when an error message happens to include one. */
const secrets = secretsFrom(
  ["DISCORD_TOKEN", "DATABASE_URL", "LOGGING", "SERVER_LOGGING"].map((name) => process.env[name]),
);

const footer = `${hostname()} · times in UTC`;

const queue: LogEntry[] = [];
/** Lines left out since the queue filled up. */
let dropped = 0;
/** The message being sent, so only one goes at a time. */
let sending: Promise<void> | null = null;
/** When Discord last said to slow down, the time to wait until. */
let waitUntil = 0;

function add(level: LogLevel, args: unknown[]): void {
  if (queue.length >= QUEUE_MAX) {
    dropped += 1;
    return;
  }
  const text = redact(formatWithOptions({ colors: false }, ...args), secrets);
  queue.push({ level, text, time: new Date() });
}

/** Sends the next message's worth of lines, if Discord isn't asking to wait. */
async function sendNext(): Promise<void> {
  if (!webhookUrl || Date.now() < waitUntil) return;
  if (dropped > 0 && queue.length < QUEUE_MAX) {
    queue.push({
      level: "warn",
      text: `${dropped} log lines came too fast to send to Discord. They're still in pm2's logs.`,
      time: new Date(),
    });
    dropped = 0;
  }
  const message = takeMessage(queue, footer);
  if (!message) return;

  try {
    const response = await postToWebhook(webhookUrl, message.payload, SEND_TIMEOUT_MS);
    if (response.status === 429) {
      // Keep the lines and try again once Discord says it's ready.
      const body = (await response.json().catch(() => ({}))) as { retry_after?: unknown };
      const seconds = typeof body.retry_after === "number" ? body.retry_after : 2;
      waitUntil = Date.now() + seconds * 1000;
      return;
    }
    if (!response.ok) original.error(`Server log: Discord webhook responded with ${response.status}`);
  } catch (error) {
    original.error("Server log: Discord webhook request failed", error);
  }
  // Dropped even when sending failed, so one bad message can't hold up the rest.
  queue.splice(0, message.count);
}

function sendInTurn(): Promise<void> {
  sending ??= sendNext().finally(() => {
    sending = null;
  });
  return sending;
}

/**
 * Sends everything waiting, for when the bot is about to stop. Gives up after
 * `timeoutMs`, as pm2 won't wait long for a stopping process.
 */
export async function flushServerLog(timeoutMs: number): Promise<void> {
  if (!webhookUrl) return;
  const drain = async () => {
    while (queue.length > 0) {
      const wait = waitUntil - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      await sendInTurn();
    }
  };
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    drain(),
    new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}

if (webhookUrl) {
  const methods = [
    ["log", "info"],
    ["info", "info"],
    ["warn", "warn"],
    ["error", "error"],
  ] as const;
  for (const [method, level] of methods) {
    console[method] = (...args: unknown[]) => {
      original[method](...args);
      add(level, args);
    };
  }
  // Unref'd: the server log alone shouldn't keep the process running.
  setInterval(() => void sendInTurn(), SEND_INTERVAL_MS).unref();
}
