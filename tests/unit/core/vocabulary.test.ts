import { describe, expect, it } from "vitest";
import { summarizeVocabulary, trackVocabulary, vocabularyCounts } from "@language-lab/core";

describe("deterministic vocabulary observations", () => {
  it.each([
    ["An irregular order and a valid ticket.", ["regular", "ID"], []],
    ["A LATTE, please. 'espresso'!", ["latte", "espresso"], ["latte", "espresso"]],
    ["The latte_shop sells lattes.", ["latte"], []],
    ["Can't stay; I'm leaving.", ["can", "I"], []],
    ["ΟΣ, ος and οσ.", ["ος"], ["ος"]],
    ["I’d like tea.", ["ID"], []],
    ["It is non-refundable.", ["refundable"], ["refundable"]],
    [
      "An oat\t\n milk latte and check‑out time.",
      ["oat milk", "check-out"],
      ["oat milk", "check-out"],
    ],
    ["Some oat. Milk, please. Check, out there.", ["oat milk", "check-out"], []],
    ["I use C++ and .NET, not C++17 or X.NET.", ["C++", ".NET"], ["C++", ".NET"]],
    ["A cafe is not a café.", ["café"], ["café"]],
  ] as const)("matches lexical boundaries in %s", (utterance, targets, used) => {
    expect(trackVocabulary(utterance, targets).used).toEqual(used);
  });

  it("returns exact UTF-16 evidence after compatibility, case, punctuation and combining-mark normalization", () => {
    const utterance = "🧳 ＩＤ, cafe\u0301, OAT\u00a0  MILK, check‑out and I’d.";
    const output = trackVocabulary(utterance, ["ID", "café", "oat milk", "check-out", "I'd"]);
    expect(output.matches.map((match) => match.quote)).toEqual([
      "ＩＤ",
      "cafe\u0301",
      "OAT\u00a0  MILK",
      "check‑out",
      "I’d",
    ]);
    for (const match of output.matches)
      expect(utterance.slice(match.start, match.end)).toBe(match.quote);
    expect(output.matches[0]?.start).toBe(3);
    expect(trackVocabulary("½", ["1", "2"]).used).toEqual([]);
  });

  it("accepts only explicit additional forms and keeps one canonical term", () => {
    const utterance = "Two key cards and a lift. Keys are useful, but keycard is not configured.";
    expect(trackVocabulary(utterance, ["key card", "elevator"]).used).toEqual([]);
    const result = trackVocabulary(
      utterance,
      ["key card", "elevator"],
      [
        { term: "key card", forms: ["key cards"] },
        { term: "elevator", forms: ["lift", "lifts"] },
      ],
    );
    expect(result.used).toEqual(["key card", "elevator"]);
    expect(result.matches.map((match) => match.quote)).toEqual(["key cards", "lift"]);
    expect(result.matches[0]?.form).toBe("key cards");
  });

  it("deduplicates canonical targets and overlapping aliases but keeps repeated occurrences", () => {
    const result = trackVocabulary(
      "Key card, key cards; KEY CARD.",
      ["key card", "KEY CARD", "deposit"],
      [{ term: "key card", forms: ["key cards", "KEY CARD", "key-card"] }],
    );
    expect(result.used).toEqual(["key card"]);
    expect(result.missed).toEqual(["deposit"]);
    expect(result.matches.map((match) => match.quote)).toEqual([
      "Key card",
      "key cards",
      "KEY CARD",
    ]);
    expect(trackVocabulary("quiet room", ["quiet room", "room"]).used).toEqual([
      "quiet room",
      "room",
    ]);
  });

  it("counts practice turns separately from occurrences and excludes help and partner text", () => {
    const progress = summarizeVocabulary(
      ["deposit", "ID", "breakfast"],
      [
        { seq: 0, role: "assistant", content: "Here is your ID and breakfast." },
        { seq: 1, role: "user", content: "Deposit, deposit. Is the deposit refundable?" },
        { seq: 2, role: "assistant", content: "Yes, refundable." },
        { seq: 3, role: "user", purpose: "support", content: "ID breakfast deposit" },
        { seq: 4, role: "assistant", purpose: "support", content: "Try: Here is my ID." },
        { seq: 5, role: "user", content: "I do not have my ID or a deposit." },
      ],
    );
    expect(vocabularyCounts(progress)).toEqual({ deposit: 2, id: 1 });
    expect(progress[0]?.occurrences).toBe(4);
    expect(progress[1]?.latest?.messageSeq).toBe(5);
    expect(progress[2]?.usedTurns).toBe(0);
    expect(progress[2]?.latest).toBeUndefined();
  });

  it("uses safe own properties for vocabulary that resembles object keys", () => {
    const progress = summarizeVocabulary(
      ["constructor", "__proto__"],
      [{ seq: 1, role: "user", content: "constructor __proto__" }],
    );
    expect(Object.hasOwn(vocabularyCounts(progress), "__proto__")).toBe(true);
    expect(vocabularyCounts(progress)["constructor"]).toBe(1);
  });
});
