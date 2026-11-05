import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  escapeMarkdown,
} from "discord.js";
import { applyEdits, describeEdits, hasEdits } from "../lyrics/edits.js";
import { buildSrt } from "../lyrics/srt.js";
import type { Session } from "./session.js";

export type EditAction =
  | "lower"
  | "upper"
  | "parens"
  | "censor"
  | "maxlen"
  | "reset"
  | "setmax"
  | "cancel";

const EDIT_ACTIONS = new Set<string>([
  "lower",
  "upper",
  "parens",
  "censor",
  "maxlen",
  "reset",
  "setmax",
  "cancel",
]);

/** What a button (or the max length form) does, and to whose file. */
export type EditTarget = {
  action: EditAction;
  sessionId: string;
  ownerId: string;
};

/**
 * `srt:<action>:<session>:<owner>`. The owner rides along so the buttons can
 * still tell who may press them after the bot forgets the session.
 */
export function editCustomId(action: EditAction, session: Pick<Session, "id" | "ownerId">): string {
  return `srt:${action}:${session.id}:${session.ownerId}`;
}

export function parseEditCustomId(customId: string): EditTarget | null {
  const [prefix, action, sessionId, ownerId] = customId.split(":");
  if (prefix !== "srt" || !action || !EDIT_ACTIONS.has(action) || !sessionId || !ownerId) {
    return null;
  }
  return { action: action as EditAction, sessionId, ownerId };
}

function editButton(
  session: Session,
  action: EditAction,
  label: string,
  active: boolean,
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(editCustomId(action, session))
    .setLabel(label)
    .setStyle(active ? ButtonStyle.Primary : ButtonStyle.Secondary);
}

/** The message that carries a converted file: summary, file and buttons. */
export function renderSession(session: Session) {
  const { edits } = session;
  const cues = applyEdits(session.cues, edits);
  const srt = buildSrt(cues);

  const summary = [
    `**${escapeMarkdown(session.fileName)}**`,
    `${cues.length} subtitle${cues.length === 1 ? "" : "s"}`,
    describeEdits(edits),
  ]
    .filter(Boolean)
    .join(" · ");

  const content =
    cues.length === 0
      ? `${summary}\nRemoving parentheses left nothing to show. Press **Remove ( )** again to bring the lyrics back.`
      : summary;

  // The on/off edits go on the first row; the line length, Reset and Cancel
  // on the second.
  const editRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    editButton(session, "lower", "Lowercase", edits.textCase === "lower"),
    editButton(session, "upper", "Uppercase", edits.textCase === "upper"),
    editButton(session, "parens", "Remove ( )", edits.removeParentheses),
    editButton(session, "censor", "Replace Censor", edits.censor),
  );

  const controlRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    editButton(
      session,
      "maxlen",
      edits.maxLineLength === null
        ? "Set Line Max Length"
        : `Set Line Max Length: ${edits.maxLineLength}`,
      edits.maxLineLength !== null,
    ),
    editButton(session, "reset", "Reset", false).setDisabled(!hasEdits(edits)),
    new ButtonBuilder()
      .setCustomId(editCustomId("cancel", session))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content,
    files: srt === "" ? [] : [new AttachmentBuilder(Buffer.from(srt, "utf8"), { name: session.fileName })],
    components: [editRow, controlRow],
    allowedMentions: { parse: [] },
  };
}
