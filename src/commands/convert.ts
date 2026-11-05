import { SlashCommandBuilder } from "discord.js";
import { buildUploadModal, convertFromInteraction } from "../convert/interactions.js";
import type { Command } from "./types.js";

export const convert: Command = {
  data: new SlashCommandBuilder()
    .setName("convert")
    .setDescription("Turn an LRC lyrics file into SRT subtitles")
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("The .lrc file to convert. Leave it out to open an upload form.")
        .setFileTypes(".lrc", ".txt"),
    ),

  async execute(interaction) {
    const file = interaction.options.getAttachment("file");
    if (file) {
      await convertFromInteraction(interaction, file);
    } else {
      await interaction.showModal(buildUploadModal());
    }
  },
};
