import { Collection } from "discord.js";
import { convert } from "./convert.js";
import type { Command } from "./types.js";

// Add new commands to this list.
const all: Command[] = [convert];

export const commands = new Collection<string, Command>(
  all.map((command) => [command.data.name, command]),
);
