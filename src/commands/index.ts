import { Collection } from "discord.js";
import { ping } from "./ping.js";
import type { Command } from "./types.js";

// Add new commands to this list.
const all: Command[] = [ping];

export const commands = new Collection<string, Command>(
  all.map((command) => [command.data.name, command]),
);
