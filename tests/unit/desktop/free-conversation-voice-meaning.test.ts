import { describe, expect, it, vi } from "vitest";
import { createGateway, MockLlmProvider } from "@language-lab/model-gateway";
import type { MemorySnapshot } from "@language-lab/memory";
import { replyToConversation } from "../../../apps/desktop/src/conversation/reply";
import {
  findVoiceMeaningAmbiguities,
  rebaseVoiceMeaningAmbiguities,
} from "../../../apps/desktop/src/conversation/voiceMeaning";

describe("free conversation voice meaning", () => {
  it.each([
    ["We can't talk about my job.", 0.45, "can't", "can"],
    ["We can talk about my job.", undefined, "can", "can't"],
    ["I couldn’t attend.", undefined, "couldn’t", "could"],
    ["I cannot attend.", 0.3, "cannot", "can"],
  ])("offers the other meaning of %s", (text, confidence, heard, alternative) => {
    expect(findVoiceMeaningAmbiguities(text, confidence)).toEqual([
      { start: text.indexOf(heard), heard, alternative },
    ]);
  });

  it("leaves confident speech, questions and other statements alone", () => {
    expect(findVoiceMeaningAmbiguities("We can't talk about my job.", 0.8)).toEqual([]);
    expect(findVoiceMeaningAmbiguities("Can't we talk about my job?", undefined)).toEqual([]);
    expect(findVoiceMeaningAmbiguities("I saw a rabbit.", 0.4)).toEqual([]);
    expect(findVoiceMeaningAmbiguities("I can not only read English.", 0.4)).toEqual([]);
  });

  it("retains the flagged word after unrelated edits and clears it when the user edits the word", () => {
    const original = "We can talk about my job.";
    const ambiguities = findVoiceMeaningAmbiguities(original, undefined);
    expect(
      rebaseVoiceMeaningAmbiguities(original, "Actually, " + original, ambiguities)[0]?.start,
    ).toBe(13);
    expect(
      rebaseVoiceMeaningAmbiguities(original, "We can talk about my job today.", ambiguities),
    ).toEqual(ambiguities);
    expect(
      rebaseVoiceMeaningAmbiguities(original, "We can't talk about my job.", ambiguities),
    ).toEqual([]);
  });
});

describe("free conversation topic boundaries", () => {
  const memory: MemorySnapshot = {
    profile: { targetLanguage: "en", level: "A2", goals: [] },
    knowledge: [],
    errors: [],
    episodes: [],
  };

  it("acknowledges a clear standalone refusal without asking about the topic", async () => {
    const llm = new MockLlmProvider();
    const generate = vi.spyOn(llm, "generateStructured");
    const gateway = createGateway({ llm });
    for (const content of ["We can't talk about my job.", "I'd rather not discuss my salary."]) {
      await expect(
        replyToConversation(
          gateway,
          [{ role: "user", content }],
          new AbortController().signal,
          memory,
        ),
      ).resolves.toEqual({
        utterance: content,
        reply: "Of course. What would you like to talk about instead?",
        vocabulary: [],
      });
    }
    expect(generate).not.toHaveBeenCalled();
  });

  it("lets the model follow a new topic included in the same reply", async () => {
    const llm = new MockLlmProvider({}, [
      JSON.stringify({ reply: "Sure. What music do you enjoy?" }),
    ]);
    const generate = vi.spyOn(llm, "generateStructured");
    const content = "I don't want to talk about work, but let's talk about music.";
    await expect(
      replyToConversation(
        createGateway({ llm }),
        [{ role: "user", content }],
        new AbortController().signal,
        memory,
      ),
    ).resolves.toMatchObject({ reply: "Sure. What music do you enjoy?" });
    expect(generate.mock.calls[0]?.[0].messages[0]?.content).toContain(
      "then follow any new topic the learner offers",
    );
  });
});
