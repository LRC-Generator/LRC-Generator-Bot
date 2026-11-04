# LRC Generator Bot

A Discord bot built with [discord.js](https://discord.js.org) and TypeScript.

## Requirements

- Node.js 22.9 or newer

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` from the [Discord Developer Portal](https://discord.com/developers/applications). For development, set `DISCORD_GUILD_ID` to your test server's ID so command changes appear instantly.

3. Invite the bot to your server with the `bot` and `applications.commands` scopes (OAuth2 → URL Generator in the Developer Portal).

4. Register the slash commands:

   ```bash
   npm run deploy-commands
   ```

5. Start the bot in watch mode:

   ```bash
   npm run dev
   ```

## Scripts

| Script                    | What it does                                           |
| ------------------------- | ------------------------------------------------------ |
| `npm run dev`             | Run from source with auto-restart on file changes      |
| `npm run deploy-commands` | Register slash commands with Discord                   |
| `npm run build`           | Compile TypeScript to `dist/`                          |
| `npm start`               | Run the compiled bot from `dist/`                      |
| `npm run typecheck`       | Type-check without emitting files                      |

`.env` is loaded automatically if it exists; otherwise, the scripts read environment variables from the shell.

## Adding a command

1. Create a file in `src/commands/` that exports a `Command` (see `src/commands/ping.ts`).
2. Add it to the list in `src/commands/index.ts`.
3. Run `npm run deploy-commands` again.
