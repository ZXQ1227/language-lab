import { useState } from "react";
import { useTrainingStore } from "../stores/training";
import type { TrainingSession } from "../training/session";
import { characterVoiceStyle } from "../speech/voices";
import { latestSpeakingHint, successfulTransfer } from "../practice/records";
import { relatedSpeakingPractice } from "../practice/candidates";
import { SpeakingTransferControl } from "./SpeakingTransfer";

export function LessonSpeakingPractice({ session }: { session: TrainingSession }) {
  const busy = useTrainingStore((state) => state.busy);
  const sources = useTrainingStore((state) => state.memoryContributions);
  const reuse = useTrainingStore((state) => state.reuseAcrossSessions);
  const load = useTrainingStore((state) => state.loadSpeakingSource);
  const save = useTrainingStore((state) => state.saveSpeakingTransfer);
  const [active, setActive] = useState<{ id: string; anchorSeq: number }>();
  const template = session.state.courseTemplate;
  if (!template || session.state.phase !== "done") return null;

  const local = session.speakingPractice?.hints.filter(
    (hint) =>
      hint.answer?.assessment.result === "met" &&
      hint.transfer?.skippedAt === undefined &&
      (session.provider.mode === "ai" || !!hint.authoredId),
  );
  const current = local?.filter((hint) => !successfulTransfer(hint.transfer)).at(-1);
  const historical =
    reuse &&
    relatedSpeakingPractice(sources, {
      id: session.id,
      language: template.targetLanguage,
      category: session.scenario.category,
      offline: session.provider.mode === "demo",
    });
  const fallback = local?.at(-1);
  const locked =
    active &&
    (active.id === session.id || (reuse && sources.some((item) => item.lessonId === active.id)))
      ? active
      : undefined;
  const candidate =
    locked ??
    (current && { id: session.id, anchorSeq: current.anchorSeq }) ??
    (historical || (fallback && { id: session.id, anchorSeq: fallback.anchorSeq }));
  if (!candidate) return null;

  return (
    <SpeakingTransferControl
      key={candidate.id + ":" + candidate.anchorSeq}
      disabled={busy}
      language={template.targetLanguage}
      provider={session.provider}
      voiceStyle={characterVoiceStyle(template.character)}
      resolveSource={async () => {
        const source = candidate.id === session.id ? session : await load(candidate.id);
        return {
          hint: latestSpeakingHint(source.speakingPractice, candidate.anchorSeq),
          originalPrompt: source.messages[candidate.anchorSeq]?.content,
        };
      }}
      save={(next, expected, signal) =>
        save(session, candidate.id, candidate.anchorSeq, next, expected, signal)
      }
      onActive={(opened) => setActive(opened ? candidate : undefined)}
    />
  );
}
