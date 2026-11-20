import { countRequest, db } from "../db.js";

/**
 * Records that the bot made an `.srt`, the way lrc.notnick.io records a saved
 * file: a Download row, tagged as coming from Discord, and one more on the
 * requests served, both or neither. Only the format and the time are kept,
 * never the lyrics, the file's name or who asked for it. The site's privacy
 * page says so; change it along with this.
 *
 * Discord doesn't tell bots when someone downloads a file, so this counts
 * each conversion instead. Never in the reply's way: nothing waits on it, and
 * a failure is only written to the console.
 */
export function logConversion(): void {
  if (!db) return;
  void db
    .$transaction([
      db.download.create({ data: { format: "srt", source: "discord" } }),
      ...countRequest(db),
    ])
    .catch((error: unknown) => {
      console.error("Couldn't log the conversion to the database", error);
    });
}
