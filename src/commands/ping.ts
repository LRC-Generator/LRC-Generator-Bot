import { SlashCommandBuilder } from "discord.js";
import type { Command } from "./types.js";

export const ping: Command = {
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check that the bot is alive"),

  async execute(interaction) {
    const started = Date.now();
    await interaction.deferReply();
    const roundTrip = Date.now() - started;

    await interaction.editReply(
      `Pong! Round trip: ${roundTrip}ms · Gateway: ${interaction.client.ws.ping}ms`,
    );
  },
};
