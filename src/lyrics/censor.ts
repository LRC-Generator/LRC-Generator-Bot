/**
 * Hides swear words and slurs in lyrics, for the Replace Censor button. Each
 * word that matches is swapped for `****` as a whole, so "Fucking" and "fuck"
 * both become `****`.
 */

export const CENSOR_MASK = "****";

/** Bad wherever they appear in a word: "fuck" also catches "motherfucking". */
const ANYWHERE = ["fuck", "shit", "bitch", "cunt", "whore"];

/**
 * Bad only as whole words, because they also turn up inside clean ones
 * ("class", "cocktail", "snigger"). List every form that should be caught.
 */
const WHOLE_WORDS = [
  "ass", "asses", "asshole", "assholes", "badass", "dumbass", "fatass", "jackass", "kickass", "smartass",
  "bastard", "bastards",
  "cock", "cocks", "cocksucker", "cocksuckers",
  "dick", "dicks", "dickhead", "dickheads",
  "fag", "fags", "faggot", "faggots",
  "hoe", "hoes",
  "nigga", "niggas", "niggaz", "nigger", "niggers",
  "prick", "pricks",
  "pussy", "pussies",
  "retard", "retards", "retarded",
  "slut", "sluts", "slutty",
  "thot", "thots",
  "twat", "twats",
];

/** A letter or digit in any script, so accented words count as one word. */
const WORD_CHAR = String.raw`[\p{L}\p{N}]`;

const CENSOR_RE = new RegExp(
  [
    `${WORD_CHAR}*(?:${ANYWHERE.join("|")})${WORD_CHAR}*`,
    `(?<!${WORD_CHAR})(?:${WHOLE_WORDS.join("|")})(?!${WORD_CHAR})`,
  ].join("|"),
  "giu",
);

export function censorLine(line: string): string {
  return line.replace(CENSOR_RE, CENSOR_MASK);
}
