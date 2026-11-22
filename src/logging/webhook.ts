/** Sending to Discord webhooks, for the conversion log and the server log. */

/** Discord is given this long to take a message before it's dropped. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Only real Discord webhook URLs are accepted, so a typo in the env var fails loudly. */
export function isDiscordWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      /(^|\.)discord(app)?\.com$/.test(url.hostname) &&
      url.pathname.startsWith("/api/webhooks/")
    );
  } catch {
    return false;
  }
}

/** Posts a JSON message to a webhook. Throws when it can't be sent at all. */
export function postToWebhook(
  url: string,
  body: unknown,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
}
