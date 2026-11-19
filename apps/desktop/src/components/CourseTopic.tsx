import { useEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { starterCoursePaths } from "../content/scenarioContent";
import { formatNumber } from "../i18n";

type CourseTopic = (typeof starterCoursePaths)[number]["topics"][number];
const covers = import.meta.glob<string>("../assets/course-topics/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

export function CourseTopicCard({ topic, onOpen }: { topic: CourseTopic; onOpen: () => void }) {
  const { t } = useTranslation();
  const titleId = `course-topic-${topic.id}`;
  const cover = covers[`../assets/course-topics/${topic.id}.webp`];
  const levels = Array.from(new Set(topic.courses.map((course) => course.difficulty))).sort();
  return (
    <article className="min-w-0">
      <h3 className="h-full">
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          aria-labelledby={titleId}
          aria-describedby={`${titleId}-details`}
          className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface text-left shadow-sm hover:border-brand-primary hover:bg-brand-primary-subtle"
        >
          <span className="block aspect-[2/1] w-full overflow-hidden bg-brand-primary-soft">
            {cover && (
              <img
                src={cover}
                alt=""
                width={510}
                height={203}
                loading="lazy"
                className="size-full object-cover"
              />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-between gap-2 p-3">
            <span id={titleId} className="font-semibold leading-snug text-ink">
              {t(`scenarios:topics.${topic.id}`)}
            </span>
            <span
              id={`${titleId}-details`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-muted"
            >
              <span>
                {t(
                  topic.courses.length === 1
                    ? "scenarios:singleLesson"
                    : "scenarios:multipleLessons",
                  { total: formatNumber(topic.courses.length) },
                )}
              </span>
              <span className="rounded-md bg-brand-primary-soft px-1.5 py-0.5 font-semibold text-brand-ink">
                {levels.join(" · ")}
              </span>
            </span>
          </span>
        </button>
      </h3>
    </article>
  );
}

export function CourseTopicDialog({
  topic,
  children,
  onClose,
}: {
  topic: CourseTopic;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      aria-labelledby="topic-dialog-title"
      className="fixed inset-0 m-auto max-h-[min(85dvh,48rem)] w-[calc(100%-2rem)] max-w-3xl overflow-auto overscroll-contain rounded-2xl border border-line bg-surface text-ink shadow-xl backdrop:bg-ink/50"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <h2 id="topic-dialog-title" className="text-lg font-semibold">
          {t(`scenarios:topics.${topic.id}`)}
        </h2>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="button-secondary rounded-lg px-3 py-2 text-sm font-semibold"
        >
          {t("scenarios:closeTopic")}
        </button>
      </div>
      <div className="space-y-3 p-4 sm:p-5">{children}</div>
    </dialog>
  );
}
