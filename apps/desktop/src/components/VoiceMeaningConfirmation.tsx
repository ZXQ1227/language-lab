import { useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { VoiceMeaningAmbiguity } from "../conversation/voiceMeaning";

export function VoiceMeaningConfirmation({
  draft,
  ambiguity,
  canSend,
  onChoose,
}: {
  draft: string;
  ambiguity: VoiceMeaningAmbiguity;
  canSend: (text: string) => boolean;
  onChoose: (text: string) => void;
}) {
  const { t } = useTranslation();
  const heading = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const alternative =
    draft.slice(0, ambiguity.start) +
    ambiguity.alternative +
    draft.slice(ambiguity.start + ambiguity.heard.length);
  useEffect(() => {
    title.current?.focus();
  }, []);
  return (
    <section
      aria-labelledby={heading}
      className="space-y-2 rounded-xl border border-line-info bg-brand-primary-subtle p-3 text-sm"
    >
      <h2 id={heading} ref={title} tabIndex={-1} className="font-semibold">
        {t("common:freeConversation.voiceConfirmation.title")}
      </h2>
      <p>{t("common:freeConversation.voiceConfirmation.description")}</p>
      <div className="grid gap-2">
        {[draft, alternative].map((choice) => (
          <button
            key={choice}
            type="button"
            lang="en"
            className="button-secondary wrap-break-word rounded-lg px-3 py-2 text-left whitespace-pre-wrap disabled:opacity-50"
            disabled={!canSend(choice)}
            onClick={() => {
              title.current?.focus();
              onChoose(choice);
            }}
          >
            {choice}
          </button>
        ))}
      </div>
    </section>
  );
}
