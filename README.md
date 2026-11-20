# LRC Generator Bot

A Discord bot that turns LRC lyrics files into SRT subtitles, built with [discord.js](https://discord.js.org) and TypeScript. It converts files the same way [lrc.notnick.io](https://lrc.notnick.io) does.

## Using it

- **`/convert file:<your .lrc>`** converts the file you attach.
- **`/convert`** on its own opens a form where you can upload the file or paste the lyrics.
- **Drop an `.lrc` file** in a DM with the bot, or in a server message that @mentions it. Set `WATCH_ALL_CHANNELS=true` to pick up `.lrc` files in any channel without the mention.

The bot replies with the `.srt` file and buttons to edit it:

| Button                  | What it does                                                                 |
| ----------------------- | ---------------------------------------------------------------------------- |
| **Lowercase**           | Makes every line lowercase. Press again to undo.                             |
| **Uppercase**           | Makes every line uppercase. Press again to undo.                             |
| **Remove ( )**          | Removes asides in parentheses, like `(yeah)`. Press again to undo.           |
| **Replace Censor**      | Replaces swear words and slurs with `****`. Press again to undo. The word list is in `src/lyrics/censor.ts`. |
| **Set Line Max Length** | Wraps lines longer than the number of characters you choose. Leave it empty to remove the limit. |
| **Reset**               | Turns every edit off.                                                        |
| **Cancel**              | Deletes the bot's reply, file and buttons included.                          |

Highlighted buttons are on. Only the person who converted the file can press them. The bot keeps the original file in memory for 24 hours; after that, or after a restart, the buttons apply their edits to the file as it is on the message.

## Usage logging

When `DATABASE_URL` is set, every file the bot converts is counted in [lrc.notnick.io](https://lrc.notnick.io)'s database. It adds one to **Requests served** and shows up as "Converted on Discord" on the site's [Usage](https://lrc.notnick.io/usage) page. Only that an `.srt` was made, and when, is stored: never the lyrics, the file's name or who asked for it.

Discord doesn't tell bots when someone downloads a file, so each conversion is counted instead: `/convert` with a file, the upload form, or a dropped file. Edits with the buttons don't count again. Logging never holds up a reply, and if the database can't be reached the error goes to the console and the bot carries on.

The site owns the database. `prisma/schema.prisma` here is a copy of the site's, used only to generate the client (`npm install` does it). Never run `prisma migrate` or `prisma db push` from this repo. The bot needs the site's `discord` source migration deployed first; until then each conversion logs an error and nothing is stored.

## How conversion works

- Each lyric lasts until the next time tag. The last one lasts until `[length: mm:ss]` if the file has it, or 5 seconds otherwise.
- A time tag with no text (`[01:23.45]`) ends the line before it early, for instrumental breaks.
- `[offset: ms]` is applied, a line with several tags (a repeated chorus) appears at each of them, and enhanced-LRC word tags (`<00:12.34>`) are removed.
- Metadata (`[ti: …]`, `[ar: …]`), section headers (`[Chorus]`) and lines without a time are skipped.

## Requirements

- Node.js 22.9 or newer

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID` from the [Discord Developer Portal](https://discord.com/developers/applications). For development, set `DISCORD_GUILD_ID` to your test server's ID so command changes appear instantly. To count conversions on lrc.notnick.io, also set `DATABASE_URL` (see [Usage logging](#usage-logging)).

3. Invite the bot to your server (OAuth2 → URL Generator in the Developer Portal) with the `bot` and `applications.commands` scopes, and the **View Channels**, **Send Messages**, **Attach Files** and **Read Message History** permissions.

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
| `npm test`                | Run the conversion tests                               |
| `npm run typecheck`       | Type-check the bot and tests without emitting files    |
| `npm run db:generate`     | Regenerate the database client after the schema changes |

`.env` is loaded automatically if it exists; otherwise, the scripts read environment variables from the shell.

## Project layout

- `src/lyrics/` – LRC parsing, SRT output and the edits, with no Discord code.
- `src/convert/` – the Discord side: reading files, the reply and its buttons, the upload and max length forms, and dropped files.
- `src/db.ts`, `prisma/` – the connection to lrc.notnick.io's database, used by `src/convert/usage-log.ts`. The client is generated into `src/generated/` (gitignored).
- `src/commands/` – slash commands. Add a new one to the list in `src/commands/index.ts`, then run `npm run deploy-commands`.
