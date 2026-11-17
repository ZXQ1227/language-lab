import { z } from "zod";
import type { EvidenceMessage } from "./assessment";

const text = z.string().trim().min(1);
export const vocabularyFormsSchema = z.strictObject({
  term: text,
  forms: z.array(text.max(120)).max(8),
});
export const vocabularyMatchSchema = z.strictObject({
  term: text,
  form: text,
  quote: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().positive(),
});
export type VocabularyMatch = z.infer<typeof vocabularyMatchSchema>;
export type VocabularyForms = z.infer<typeof vocabularyFormsSchema>;
const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
const fold = (value: string) =>
  value.normalize("NFKC").toLowerCase().replace(/ς/gu, "σ").replace(/[’ʼ]/gu, "'");

/** Normalized text carries UTF-16 offsets back to the original learner text. */
function normalizedText(source: string) {
  let value = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of segmenter.segment(source)) {
    const folded = fold(segment);
    for (const character of folded) {
      const next = /[\s\-\u2010\u2011]/u.test(character) ? " " : character;
      if (next === " " && value.endsWith(" ")) {
        ends[ends.length - 1] = index + segment.length;
        continue;
      }
      value += next;
      for (let offset = 0; offset < next.length; offset++) {
        starts.push(index);
        ends.push(index + segment.length);
      }
    }
  }
  return { value, starts, ends };
}

export const normalizeVocabularyForm = (term: string) =>
  fold(term)
    .replace(/[\s\-\u2010\u2011]+/gu, " ")
    .trim();
/** State keys preserve the canonical authored term, including its hyphenation. */
export const vocabularyKey = (term: string) =>
  term.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");

function boundary(text: string, start: number, end: number) {
  const before = text.slice(0, start);
  const after = text.slice(end);
  return (
    !/[\p{L}\p{M}\p{N}_]$/u.test(before) &&
    !/^[\p{L}\p{M}\p{N}_]/u.test(after) &&
    !/[\p{L}\p{M}\p{N}]'$/u.test(before) &&
    !/^'[\p{L}\p{M}\p{N}]/u.test(after)
  );
}

/** Pure lexical observations: no model, stemming, correctness or mastery inference. */
export function trackVocabulary(
  utterance: string,
  targets: readonly string[],
  vocabularyForms: readonly VocabularyForms[] = [],
) {
  const source = normalizedText(utterance);
  const seen = new Set<string>();
  const terms = targets.filter((term) => {
    const key = normalizeVocabularyForm(term);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const matches: VocabularyMatch[] = [];
  const used: string[] = [];
  for (const term of terms) {
    const aliases = vocabularyForms
      .filter((item) => normalizeVocabularyForm(item.term) === normalizeVocabularyForm(term))
      .flatMap((item) => item.forms);
    const forms = new Map<string, string>();
    for (const form of [term, ...aliases]) {
      const key = normalizeVocabularyForm(form);
      if (!forms.has(key)) forms.set(key, form);
    }
    const candidates: VocabularyMatch[] = [];
    for (const [needle, form] of forms) {
      if (!needle) continue;
      let index = source.value.indexOf(needle);
      while (index !== -1) {
        const finish = index + needle.length;
        if (
          boundary(source.value, index, finish) &&
          (index === 0 || source.starts[index] !== source.starts[index - 1]) &&
          (finish === source.value.length || source.ends[finish - 1] !== source.ends[finish])
        ) {
          const start = source.starts[index]!;
          const end = source.ends[finish - 1]!;
          candidates.push({ term, form, quote: utterance.slice(start, end), start, end });
        }
        index = source.value.indexOf(needle, index + 1);
      }
    }
    // Prefer the longest form at a position; aliases must not double-count a span.
    candidates.sort((a, b) => a.start - b.start || b.end - a.end);
    let previousEnd = -1;
    for (const candidate of candidates) {
      if (candidate.start < previousEnd) continue;
      matches.push(candidate);
      previousEnd = candidate.end;
    }
    if (candidates.length) used.push(term);
  }
  return { used, missed: terms.filter((term) => !used.includes(term)), matches };
}

export interface VocabularyProgress {
  term: string;
  usedTurns: number;
  occurrences: number;
  latest?: VocabularyMatch & { messageSeq: number; content: string };
}

/** Replay is the source of truth; only learner practice contributes. */
export function summarizeVocabulary(
  targets: readonly string[],
  transcript: readonly EvidenceMessage[],
  forms: readonly VocabularyForms[] = [],
): VocabularyProgress[] {
  const progress = trackVocabulary("", targets, forms).missed.map((term): VocabularyProgress => ({
    term,
    usedTurns: 0,
    occurrences: 0,
  }));
  for (const message of transcript) {
    if (message.role !== "user" || message.purpose === "support") continue;
    const result = trackVocabulary(message.content, targets, forms);
    for (const item of progress) {
      const matches = result.matches.filter((match) => match.term === item.term);
      if (!matches.length) continue;
      item.usedTurns++;
      item.occurrences += matches.length;
      item.latest = { ...matches.at(-1)!, messageSeq: message.seq, content: message.content };
    }
  }
  return progress;
}

export function vocabularyCounts(progress: readonly VocabularyProgress[]): Record<string, number> {
  return Object.fromEntries(
    progress
      .filter((item) => item.usedTurns > 0)
      .map((item) => [vocabularyKey(item.term), item.usedTurns]),
  );
}
