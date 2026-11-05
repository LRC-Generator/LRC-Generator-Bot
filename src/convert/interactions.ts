import {
  type Attachment,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  FileUploadBuilder,
  LabelBuilder,
  MessageFlags,
  type ModalMessageModalSubmitInteraction,
  ModalBuilder,
  type ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import {
  type Edits,
  MAX_LINE_LENGTH,
  MIN_LINE_LENGTH,
  NO_EDITS,
} from "../lyrics/edits.js";
import { parseSrt } from "../lyrics/srt.js";
import {
  attachmentProblem,
  ConvertError,
  convertAttachment,
  convertLrc,
  readAttachment,
} from "./input.js";
import { createSession, forgetSession, getSession, type Session } from "./session.js";
import {
  editCustomId,
  type EditTarget,
  parseEditCustomId,
  renderSession,
} from "./view.js";

const UPLOAD_MODAL_ID = "convert:upload";
const FILE_FIELD = "file";
const TEXT_FIELD = "text";
const LENGTH_FIELD = "length";

/** What `/convert` opens when it's run without a file. */
export function buildUploadModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(UPLOAD_MODAL_ID)
    .setTitle("Convert LRC to SRT")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("LRC file")
        .setDescription("The .lrc file to turn into SRT subtitles.")
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId(FILE_FIELD)
            .setFileTypes(".lrc", ".txt")
            .setMaxValues(1)
            .setRequired(false),
        ),
      new LabelBuilder()
        .setLabel("Or paste the lyrics")
        .setDescription("LRC text, if you don't have it as a file.")
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId(TEXT_FIELD)
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("[00:12.34] First line\n[00:15.80] Second line")
            .setMaxLength(4000)
            .setRequired(false),
        ),
    );
}

function buildMaxLengthModal(target: EditTarget, current: number | null): ModalBuilder {
  const input = new TextInputBuilder()
    .setCustomId(LENGTH_FIELD)
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("e.g. 42")
    .setMaxLength(String(MAX_LINE_LENGTH).length)
    .setRequired(false);
  if (current !== null) input.setValue(String(current));

  return new ModalBuilder()
    .setCustomId(editCustomId("setmax", { id: target.sessionId, ownerId: target.ownerId }))
    .setTitle("Max line length")
    .addLabelComponents(
      new LabelBuilder()
        .setLabel("Characters per line")
        .setDescription("Longer lines continue on the next line. Leave it empty for no limit.")
        .setTextInputComponent(input),
    );
}

/** A text field's value, or "" when Discord left an empty optional field out. */
function textField(interaction: ModalSubmitInteraction, customId: string): string {
  try {
    return interaction.fields.getTextInputValue(customId);
  } catch {
    return "";
  }
}

/**
 * Answers in public with the converted file. Problems with what the user sent
 * are told to them alone, in place of the "thinking…" message.
 */
async function respondWithConversion(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  convert: () => Session | Promise<Session>,
): Promise<void> {
  await interaction.deferReply();
  try {
    const session = await convert();
    await interaction.editReply(renderSession(session));
  } catch (error) {
    await interaction.deleteReply().catch(() => undefined);
    if (!(error instanceof ConvertError)) throw error;
    await interaction.followUp({ content: error.message, flags: MessageFlags.Ephemeral });
  }
}

export async function convertFromInteraction(
  interaction: ChatInputCommandInteraction | ModalSubmitInteraction,
  file: Attachment,
): Promise<void> {
  // Checked first, so a wrong file gets a private answer straight away.
  const problem = attachmentProblem(file);
  if (problem) {
    await interaction.reply({ content: problem, flags: MessageFlags.Ephemeral });
    return;
  }
  await respondWithConversion(interaction, () => convertAttachment(file, interaction.user.id));
}

async function handleUploadModal(interaction: ModalSubmitInteraction): Promise<void> {
  const file = interaction.fields.getUploadedFiles(FILE_FIELD)?.first();
  if (file) {
    await convertFromInteraction(interaction, file);
    return;
  }

  const text = textField(interaction, TEXT_FIELD).trim();
  if (text) {
    await respondWithConversion(interaction, () =>
      convertLrc(text, "lyrics.lrc", interaction.user.id, "what you pasted"),
    );
    return;
  }

  await interaction.reply({
    content: "Upload an `.lrc` file or paste the lyrics, and I'll turn them into an `.srt`.",
    flags: MessageFlags.Ephemeral,
  });
}

type EditInteraction = ButtonInteraction | ModalMessageModalSubmitInteraction;

async function rejectIfNotOwner(interaction: EditInteraction, target: EditTarget): Promise<boolean> {
  if (interaction.user.id === target.ownerId) return false;
  await interaction.reply({
    content: `Only <@${target.ownerId}> can use these buttons. Use \`/convert\` to convert your own file.`,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
  return true;
}

/**
 * The session behind a message's buttons. When the bot has forgotten it (it
 * restarted, or the session sat idle), the file on the message becomes the
 * new starting point, so the buttons keep working; only undoing the edits
 * made before that is lost.
 */
async function sessionFor(interaction: EditInteraction, target: EditTarget): Promise<Session | null> {
  const known = getSession(target.sessionId);
  if (known) return known;

  // Downloading the file can take longer than Discord waits for an answer.
  await interaction.deferUpdate();
  const file = interaction.message.attachments.find((attachment) =>
    attachment.name.toLowerCase().endsWith(".srt"),
  );
  if (!file) return null;
  const cues = parseSrt(await readAttachment(file).catch(() => ""));
  if (cues.length === 0) return null;
  return createSession({
    id: target.sessionId,
    ownerId: target.ownerId,
    fileName: file.name,
    cues,
  });
}

async function showSession(interaction: EditInteraction, session: Session | null): Promise<void> {
  if (!session) {
    // Only reached after deferring, while picking up a forgotten session.
    await interaction.editReply({ components: [] });
    await interaction.followUp({
      content: "I can't edit this file anymore. Run `/convert` again to make a new one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  // `attachments: []` drops the old file; `files` puts the new one in its place.
  const payload = { ...renderSession(session), attachments: [] };
  if (interaction.deferred) {
    await interaction.editReply(payload);
  } else {
    await interaction.update(payload);
  }
}

function toggledEdits(edits: Edits, action: EditTarget["action"]): Edits {
  switch (action) {
    case "lower":
      return { ...edits, textCase: edits.textCase === "lower" ? "original" : "lower" };
    case "upper":
      return { ...edits, textCase: edits.textCase === "upper" ? "original" : "upper" };
    case "parens":
      return { ...edits, removeParentheses: !edits.removeParentheses };
    case "censor":
      return { ...edits, censor: !edits.censor };
    case "reset":
      return NO_EDITS;
    default:
      return edits;
  }
}

async function handleEditButton(interaction: ButtonInteraction, target: EditTarget): Promise<void> {
  if (await rejectIfNotOwner(interaction, target)) return;

  if (target.action === "cancel") {
    // Removes the bot's message with the file and buttons, and forgets the edits.
    forgetSession(target.sessionId);
    await interaction.deferUpdate();
    await interaction.deleteReply();
    return;
  }

  if (target.action === "maxlen") {
    const current = getSession(target.sessionId)?.edits.maxLineLength ?? null;
    await interaction.showModal(buildMaxLengthModal(target, current));
    return;
  }

  const session = await sessionFor(interaction, target);
  if (session) session.edits = toggledEdits(session.edits, target.action);
  await showSession(interaction, session);
}

async function handleMaxLengthModal(
  interaction: ModalMessageModalSubmitInteraction,
  target: EditTarget,
): Promise<void> {
  if (await rejectIfNotOwner(interaction, target)) return;

  const raw = textField(interaction, LENGTH_FIELD).trim();
  let maxLineLength: number | null = null;
  if (raw !== "") {
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || value < MIN_LINE_LENGTH || value > MAX_LINE_LENGTH) {
      await interaction.reply({
        content: `Enter a whole number from ${MIN_LINE_LENGTH} to ${MAX_LINE_LENGTH}, or leave it empty for no limit.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    maxLineLength = value;
  }

  const session = await sessionFor(interaction, target);
  if (session) session.edits = { ...session.edits, maxLineLength };
  await showSession(interaction, session);
}

/** Routes the upload form, the edit and cancel buttons, and the max length form. */
export async function handleConvertInteraction(
  interaction: ButtonInteraction | ModalSubmitInteraction,
): Promise<void> {
  if (interaction.isModalSubmit() && interaction.customId === UPLOAD_MODAL_ID) {
    await handleUploadModal(interaction);
    return;
  }

  const target = parseEditCustomId(interaction.customId);
  if (!target) return;

  if (interaction.isButton()) {
    await handleEditButton(interaction, target);
  } else if (target.action === "setmax" && interaction.isFromMessage()) {
    await handleMaxLengthModal(interaction, target);
  }
}
