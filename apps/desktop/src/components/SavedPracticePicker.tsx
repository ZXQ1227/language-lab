import { useTranslation } from "react-i18next";
import { formatNumber } from "../i18n";
import { useTrainingStore } from "../stores/training";

const control = "mt-1 w-full rounded-lg border form-control px-3 py-2 text-sm";

export function SavedPracticePicker() {
  const { t } = useTranslation();
  const { sessions, session, busy, resume } = useTrainingStore();
  if (!sessions.length) return null;
  return (
    <label className="block text-sm">
      {t("training:savedPractice")}
      <select
        className={control}
        disabled={busy}
        value={session?.id ?? ""}
        onChange={(event) => resume(event.target.value)}
      >
        <option value="">{t("training:chooseASavedLesson")}</option>
        {sessions.map((item) => (
          <option value={item.id} key={item.id}>
            {item.scenario.title} · {t(`common:phases.${item.state.phase}`)} ·{" "}
            {formatNumber(item.state.turnCount)} {t("training:replies")}{" "}
            {item.provider.mode === "demo" ? t("training:demo") : t("training:aI")}
            {item.state.courseTemplate?.learningPack
              ? t("training:value", {
                  v0:
                    item.state.courseTemplate.learningPack.variations.find(
                      (variation) =>
                        variation.id === item.state.courseTemplate?.selectedVariationId,
                    )?.title ?? t("training:standardCheckIn"),
                })
              : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
