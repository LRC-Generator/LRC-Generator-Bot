// First, so the server log sees everything the rest prints while loading.
import { flushServerLog } from "./logging/server-log.js";

import { hostname } from "node:os";
import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
  MessageFlags,
  Partials,
} from "discord.js";
import { commands } from "./commands/index.js";
import { BOT_SOFTWARE } from "./convert/discord-log.js";
import { handleConvertInteraction } from "./convert/interactions.js";
import { handleDroppedFiles } from "./convert/messages.js";
import { loggingTargets } from "./convert/usage-log.js";
import { db } from "./db.js";
import { flagEnv, requireEnv } from "./env.js";

console.log(`Starting ${BOT_SOFTWARE} on ${hostname()}`);

/** Convert `.lrc` files dropped in any channel, not just DMs and mentions. */
const watchAllChannels = flagEnv("WATCH_ALL_CHANNELS");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    // Privileged: turn on "Message Content Intent" in the Developer Portal first.
    ...(watchAllChannels ? [GatewayIntentBits.MessageContent] : []),
  ],
  // DM channels aren't cached, so their messages arrive only with this.
  partials: [Partials.Channel],
});

// The connection to Discord. discord.js reconnects by itself; these say when.
client.on(Events.Error, (error) => console.error("Discord client error:", error));
client.on(Events.Warn, (message) => console.warn("Discord client warning:", message));
client.on(Events.ShardDisconnect, (event) =>
  console.warn(`Disconnected from Discord (close code ${event.code})`),
);
client.on(Events.ShardReconnecting, () => console.log("Reconnecting to Discord…"));
client.on(Events.ShardResume, () => console.log("Reconnected to Discord"));

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(
    loggingTargets.length > 0
      ? `Logging conversions to ${loggingTargets.join(" and ")}`
      : "No DATABASE_URL or LOGGING, so conversions aren't logged",
  );
});

async function handleInteraction(interaction: Interaction): Promise<void> {
  if (interaction.isChatInputCommand()) {
    const command = commands.get(interaction.commandName);
    if (!command) {
      console.warn(`Received unknown command: /${interaction.commandName}`);
      return;
    }
    await command.execute(interaction);
  } else if (interaction.isButton() || interaction.isModalSubmit()) {
    await handleConvertInteraction(interaction);
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    const name = interaction.isChatInputCommand()
      ? `/${interaction.commandName}`
      : "customId" in interaction
        ? interaction.customId
        : interaction.type;
    console.error(`Error while handling ${name}:`, error);
    if (!interaction.isRepliable()) return;

    const reply = {
      content: "Something went wrong. Please try again.",
      flags: MessageFlags.Ephemeral,
    } as const;

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch (replyError) {
      console.error("Failed to send error reply:", replyError);
    }
  }
});

client.on(Events.MessageCreate, async (message) => {
  try {
    await handleDroppedFiles(message, watchAllChannels);
  } catch (error) {
    console.error("Error while converting a dropped file:", error);
  }
});

// A crash is logged and sent before the bot exits; pm2 then starts it again.
process.on("uncaughtException", (error) => {
  console.error("The bot crashed:", error);
  void flushServerLog(3_000).finally(() => process.exit(1));
});
// A promise that failed with nothing to catch it. Logged, and the bot carries
// on, rather than crashing over one failed request.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

/** pm2 sends SIGINT to stop or restart the bot. */
async function shutDown(signal: NodeJS.Signals): Promise<void> {
  console.log(`Shutting down (${signal})`);
  await client.destroy().catch(() => undefined);
  await db?.$disconnect().catch(() => undefined);
  await flushServerLog(2_000);
  process.exit(0);
}
process.once("SIGINT", (signal) => void shutDown(signal));
process.once("SIGTERM", (signal) => void shutDown(signal));

await client.login(requireEnv("DISCORD_TOKEN"));
