import { countRequest, db } from "../db.js";
import { optionalEnv } from "../env.js";
import { isDiscordWebhookUrl, postToWebhook } from "../logging/webhook.js";
import { buildConversionLogPayload, type ConversionLog } from "./discord-log.js";

/** The `LOGGING` webhook, the same one lrc.notnick.io logs downloads to. Optional. */
const webhookUrl = (() => {
  const url = optionalEnv("LOGGING");
  if (url && !isDiscordWebhookUrl(url)) {
    console.error("LOGGING isn't a Discord webhook URL, so nothing is posted to Discord");
    return undefined;
  }
  return url;
})();

/** For the startup message: where conversions are logged. */
export const loggingTargets = [db && "the database", webhookUrl && "Discord"].filter(Boolean);

/**
 * Records a conversion the way lrc.notnick.io records a saved file. Discord
 * doesn't tell bots when someone downloads a file, so each conversion counts.
 * Never in the reply's way: nothing waits on it, and a failure is only written
 * to the console.
 */
export function logConversion(log: ConversionLog): void {
  void storeConversion();
  void postConversion(log);
}

/**
 * A Download row, tagged as coming from Discord, and one more on the requests
 * served, both or neither. Only the format and the time are stored. The
 * site's privacy page says what's logged; change it along with this.
 */
async function storeConversion(): Promise<void> {
  if (!db) return;
  try {
    await db.$transaction([
      db.download.create({ data: { format: "srt", source: "discord" } }),
      ...countRequest(db),
    ]);
  } catch (error) {
    console.error("Couldn't log the conversion to the database", error);
  }
}

/** Posts the log to the `LOGGING` webhook, if there is one. */
async function postConversion(log: ConversionLog): Promise<void> {
  if (!webhookUrl) return;
  try {
    const response = await postToWebhook(webhookUrl, buildConversionLogPayload(log));
    if (!response.ok) console.error(`Discord webhook responded with ${response.status}`);
  } catch (error) {
    console.error("Discord webhook request failed", error);
  }
}
