import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";
import { optionalEnv, requireEnv } from "./env.js";

const token = requireEnv("DISCORD_TOKEN");
const clientId = requireEnv("DISCORD_CLIENT_ID");
const guildId = optionalEnv("DISCORD_GUILD_ID");

const body = commands.map((command) => command.data.toJSON());
const rest = new REST().setToken(token);

// Guild commands update instantly; global commands can take a while to propagate.
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

await rest.put(route, { body });

console.log(
  `Registered ${body.length} command(s) ${guildId ? `to guild ${guildId}` : "globally"}.`,
);
