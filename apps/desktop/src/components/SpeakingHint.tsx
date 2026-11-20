import { useTranslation } from "react-i18next";
import type { useSpeakingHint } from "../practice/useSpeakingHint";

export function SpeakingHintButton({
  hint,
  className,
  disabled,
}: {
  hint: ReturnType<typeof useSpeakingHint>;
  className: string;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || hint.phase === "loading"}
      aria-expanded={!!hint.current}
      onClick={() => void hint.show()}
    >
      <span className="grid size-10 place-items-center rounded-full border border-warning-line bg-chat-hint text-hint-ink group-hover:border-warning sm:size-12">
        <span className="lesson-icon lesson-icon-hint" aria-hidden="true" />
      </span>
      <span>{t("training:speakingPractice.hint")}</span>
    </button>
  );
}

export function SpeakingHintCard({
  hint,
  language,
  onRead,
  readDisabled,
}: {
  hint: ReturnType<typeof useSpeakingHint>;
  language: string;
  onRead: (text: string) => void;
  readDisabled: boolean;
}) {
  const { t } = useTranslation();
  if (hint.phase === "loading")
    return <p role="status">{t("training:speakingPractice.loadingHint")}</p>;
  if (hint.failure)
    return <p role="alert">{t(`training:speakingPractice.hintErrors.${hint.failure}`)}</p>;
  if (!hint.current) return null;
  const { example } = hint.current;
  return (
    <aside
      aria-label={t("training:speakingPractice.example")}
      className="space-y-2 rounded-xl border border-warning-line bg-chat-hint p-3 text-sm text-hint-ink"
    >
      <p lang={language} className="wrap-break-word">
        {example}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="button-secondary rounded-lg px-2 py-1 disabled:opacity-50"
          disabled={readDisabled}
          onClick={() => onRead(example)}
        >
          {t("training:speakingPractice.readExample")}
        </button>
        <button type="button" className="button-secondary rounded-lg px-2 py-1" onClick={hint.hide}>
          {t("training:speakingPractice.hideExample")}
        </button>
      </div>
    </aside>
  );
}
