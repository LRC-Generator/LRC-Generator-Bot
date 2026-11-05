import {
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
  MessageFlags,
  Partials,
} from "discord.js";
import { commands } from "./commands/index.js";
import { handleConvertInteraction } from "./convert/interactions.js";
import { handleDroppedFiles } from "./convert/messages.js";
import { flagEnv, requireEnv } from "./env.js";

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

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
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

await client.login(requireEnv("DISCORD_TOKEN"));
