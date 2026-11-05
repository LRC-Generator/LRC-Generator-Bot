import type { Message } from "discord.js";
import { ConvertError, convertAttachment, isLrcAttachment } from "./input.js";
import { renderSession } from "./view.js";

const HINT =
  "Send me an `.lrc` file and I'll turn it into an `.srt`, or use `/convert` to open the upload form.";

/**
 * Converts `.lrc` files dropped into chat. Without the Message Content intent,
 * Discord only shows the bot attachments in DMs and in messages that mention
 * it; `watchAllChannels` (which needs that intent) picks them up anywhere.
 */
export async function handleDroppedFiles(message: Message, watchAllChannels: boolean): Promise<void> {
  if (message.author.bot) return;

  const inDm = !message.inGuild();
  const mentioned = message.mentions.users.has(message.client.user.id);
  if (!inDm && !mentioned && !watchAllChannels) return;

  const files = message.attachments.filter(isLrcAttachment);
  if (files.size === 0) {
    if (inDm || mentioned) await message.reply({ content: HINT, allowedMentions: { repliedUser: false } });
    return;
  }

  for (const file of files.values()) {
    try {
      const session = await convertAttachment(file, message.author.id);
      await message.reply({
        ...renderSession(session),
        allowedMentions: { parse: [], repliedUser: false },
      });
    } catch (error) {
      if (!(error instanceof ConvertError)) throw error;
      await message.reply({ content: error.message, allowedMentions: { repliedUser: false } });
    }
  }
}
