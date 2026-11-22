/**
 * How the server log (see `server-log.ts`) words what the bot writes to the
 * console, as Discord webhook messages. Nothing here sends anything.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogEntry = {
  level: LogLevel;
  text: string;
  time: Date;
};

const LEVEL_NAMES: Record<LogLevel, string> = { info: "INFO ", warn: "WARN ", error: "ERROR" };
const LEVEL_TITLES: Record<LogLevel, string> = { info: "Log", warn: "Warning", error: "Error" };
const LEVEL_COLORS: Record<LogLevel, number> = {
  info: 0x30d158, // the site's green
  warn: 0xfee75c,
  error: 0xed4245,
};
const SEVERITY: Record<LogLevel, number> = { info: 0, warn: 1, error: 2 };

/** One entry this long is cut short, so one huge error can't fill a message alone. */
export const ENTRY_MAX_LENGTH = 1500;
/** Room for the lines in one embed, inside Discord's 4096 with the code fences. */
const DESCRIPTION_MAX_LENGTH = 3900;

/** "14:31:02", in UTC like the rest of the server. */
function clock(time: Date): string {
  return time.toISOString().slice(11, 19);
}

/** Keeps text from closing the code block it's shown in. */
function escapeFences(text: string): string {
  return text.replace(/```/g, "`​``");
}

/** One entry as a line (or a few, for a stack trace) of the code block. */
export function formatEntry(entry: LogEntry): string {
  const text =
    entry.text.length > ENTRY_MAX_LENGTH
      ? `${entry.text.slice(0, ENTRY_MAX_LENGTH)}… (${entry.text.length - ENTRY_MAX_LENGTH} more characters)`
      : entry.text;
  return `[${clock(entry.time)}] ${LEVEL_NAMES[entry.level]} ${escapeFences(text)}`;
}

/**
 * Takes as many entries from the front as fit in one message, and words them
 * as one embed, coloured and titled by the worst level among them. Returns
 * null when there's nothing to send.
 */
export function takeMessage(
  queue: LogEntry[],
  footer: string,
): { payload: ReturnType<typeof buildPayload>; count: number } | null {
  if (queue.length === 0) return null;
  const lines: string[] = [];
  let length = 0;
  for (const entry of queue) {
    const line = formatEntry(entry);
    // Always at least one, which fits: entries are cut to ENTRY_MAX_LENGTH.
    if (lines.length > 0 && length + line.length + 1 > DESCRIPTION_MAX_LENGTH) break;
    lines.push(line);
    length += line.length + 1;
  }
  const taken = queue.slice(0, lines.length);
  return { payload: buildPayload(taken, lines, footer), count: taken.length };
}

function buildPayload(entries: LogEntry[], lines: string[], footer: string) {
  const worst = entries.reduce<LogLevel>(
    (level, entry) => (SEVERITY[entry.level] > SEVERITY[level] ? entry.level : level),
    "info",
  );
  return {
    username: "LRC Generator",
    embeds: [
      {
        title: LEVEL_TITLES[worst],
        color: LEVEL_COLORS[worst],
        description: `\`\`\`\n${lines.join("\n")}\n\`\`\``,
        footer: { text: footer },
        timestamp: entries[0]?.time.toISOString(),
      },
    ],
    allowed_mentions: { parse: [] as string[] },
  };
}

/**
 * The secret parts of these values: each value whole and, for a URL, its
 * password on its own, since an error may print either. Short values are
 * skipped, as hiding them would hide ordinary words too.
 */
export function secretsFrom(values: (string | undefined)[]): string[] {
  const secrets = new Set<string>();
  for (const value of values) {
    if (!value || value.length < 8) continue;
    secrets.add(value);
    try {
      const password = decodeURIComponent(new URL(value).password);
      if (password.length >= 8) secrets.add(password);
    } catch {
      // Not a URL.
    }
  }
  // Longest first, so a URL goes before the password inside it.
  return [...secrets].sort((a, b) => b.length - a.length);
}

/** The text with every secret swapped for "[redacted]". */
export function redact(text: string, secrets: string[]): string {
  let result = text;
  for (const secret of secrets) result = result.split(secret).join("[redacted]");
  return result;
}
