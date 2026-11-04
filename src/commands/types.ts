import type {
  ChatInputCommandInteraction,
  RESTPostAPIChatInputApplicationCommandsJSONBody,
} from "discord.js";

export interface Command {
  /** Any SlashCommandBuilder (with or without options/subcommands). */
  data: {
    name: string;
    toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody;
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}
