export interface VoiceMeaningAmbiguity {
  start: number;
  heard: string;
  alternative: string;
}

const reliableRecognition = 0.8;

/** Check common modal contrasts in statements when the recognizer supplied weak or no confidence. */
export function findVoiceMeaningAmbiguities(
  transcript: string,
  confidence: number | undefined,
): VoiceMeaningAmbiguity[] {
  if (confidence !== undefined && confidence >= reliableRecognition) return [];

  const clauses =
    /(?:^|[.!?\n]\s*)(?:i|we|you|they|he|she|it)\s+(can(?:not|['’]t|\s+not)?|could(?:n['’]t|\s+not)?)(?=\s+(?!(?:not|never|only)\b)[a-z])/gi;
  return Array.from(transcript.matchAll(clauses), (match) => {
    const heard = match[1]!;
    const lower = heard.toLowerCase();
    const positive = lower.startsWith("could") ? "could" : "can";
    const alternative = lower === positive ? (positive === "can" ? "can't" : "couldn't") : positive;
    return {
      start: match.index + match[0].length - heard.length,
      heard,
      alternative: heard === heard.toUpperCase() ? alternative.toUpperCase() : alternative,
    };
  });
}

/** Preserve untouched ASR words when the learner edits another part of the draft. */
export function rebaseVoiceMeaningAmbiguities(
  before: string,
  after: string,
  ambiguities: readonly VoiceMeaningAmbiguity[],
): VoiceMeaningAmbiguity[] {
  if (!ambiguities.length) return [];
  if (before === after) return [...ambiguities];

  let start = 0;
  while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd--;
    newEnd--;
  }

  return ambiguities.flatMap((item) => {
    if (item.start < oldEnd && item.start + item.heard.length > start) return [];
    const offset = item.start >= oldEnd ? item.start + newEnd - oldEnd : item.start;
    const end = offset + item.heard.length;
    const wordCharacter = /[\p{L}\p{N}'’]/u;
    if (
      after.slice(offset, end) !== item.heard ||
      wordCharacter.test(after[offset - 1] ?? "") ||
      wordCharacter.test(after[end] ?? "") ||
      /^\s+not\b/i.test(after.slice(end))
    )
      return [];
    return [{ ...item, start: offset }];
  });
}
