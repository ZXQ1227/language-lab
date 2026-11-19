import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ScenarioContent } from "@language-lab/core";
import type { starterCoursePaths } from "../content/scenarioContent";
import { formatNumber } from "../i18n";

type StarterPath = (typeof starterCoursePaths)[number];
const covers = import.meta.glob<string>("../assets/course-topics/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

function CourseCoverCard({
  course,
  topic,
  onOpen,
}: {
  course: ScenarioContent;
  topic: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const titleId = `course-card-${course.slug}`;
  const cover = covers[`../assets/course-topics/${topic}.webp`];
  return (
    <article className="flex min-w-0 shrink-0 basis-[82%] snap-start @min-[24rem]:basis-[calc((100%-1rem)/2)] @min-[32rem]:basis-[calc((100%-1.5rem)/3)] @min-[52rem]:basis-[calc((100%-2.25rem)/4)]">
      <h3 className="w-full">
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
            <span
              id={titleId}
              lang={course.courseTemplate?.targetLanguage}
              className="font-semibold leading-snug wrap-break-word text-ink"
            >
              {course.title}
            </span>
            <span
              id={`${titleId}-details`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted"
            >
              <span>{t(`scenarios:topics.${topic}`)}</span>
              <span className="rounded-md bg-brand-primary-soft px-1.5 py-0.5 font-semibold text-brand-ink">
                {course.difficulty}
              </span>
            </span>
          </span>
        </button>
      </h3>
    </article>
  );
}

export function CoursePathRow({
  path,
  onOpen,
}: {
  path: StarterPath;
  onOpen: (course: ScenarioContent) => void;
}) {
  const { t } = useTranslation();
  const scrollRow = useRef<HTMLDivElement>(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);
  const titleId = `course-path-${path.id}`;
  const rowId = `${titleId}-row`;

  useEffect(() => {
    const row = scrollRow.current;
    if (!row) return;
    const updateControls = () => {
      setCanScrollBack(row.scrollLeft > 1);
      setCanScrollForward(row.scrollLeft + row.clientWidth < row.scrollWidth - 1);
    };
    updateControls();
    const resize = new ResizeObserver(updateControls);
    resize.observe(row);
    row.addEventListener("scroll", updateControls, { passive: true });
    return () => {
      resize.disconnect();
      row.removeEventListener("scroll", updateControls);
    };
  }, [path.entries.length]);

  function scrollByPage(direction: -1 | 1) {
    const row = scrollRow.current;
    if (!row) return;
    row.scrollBy({
      left: direction * row.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }

  return (
    <section aria-labelledby={titleId} className="min-w-0 space-y-2">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id={titleId} className="text-lg font-semibold text-ink">
            {t(`common:categories.${path.id}`)}
          </h2>
          <span className="text-sm text-ink-muted">
            {t(path.entries.length === 1 ? "scenarios:singleLesson" : "scenarios:multipleLessons", {
              total: formatNumber(path.entries.length),
            })}
          </span>
        </div>
        {(canScrollBack || canScrollForward) && (
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={t("scenarios:previousLessons")}
              aria-controls={rowId}
              disabled={!canScrollBack}
              onClick={() => scrollByPage(-1)}
              className="button-secondary grid size-9 place-items-center rounded-full text-xl leading-none disabled:opacity-40"
            >
              <span aria-hidden="true">‹</span>
            </button>
            <button
              type="button"
              aria-label={t("scenarios:nextLessons")}
              aria-controls={rowId}
              disabled={!canScrollForward}
              onClick={() => scrollByPage(1)}
              className="button-secondary grid size-9 place-items-center rounded-full text-xl leading-none disabled:opacity-40"
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
        )}
      </div>
      <div
        id={rowId}
        ref={scrollRow}
        className="flex snap-x snap-proximity gap-3 overflow-x-auto overscroll-x-contain scroll-pl-1 px-1 pt-1 pb-2 [scrollbar-width:thin]"
      >
        {path.entries.map(({ course, topic }) => (
          <CourseCoverCard
            key={course.slug}
            course={course}
            topic={topic}
            onOpen={() => onOpen(course)}
          />
        ))}
      </div>
    </section>
  );
}

export function CourseDialog({
  course,
  children,
  onClose,
}: {
  course: ScenarioContent;
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
      aria-labelledby="course-dialog-title"
      className="fixed inset-0 m-auto max-h-[min(85dvh,48rem)] w-[calc(100%-2rem)] max-w-3xl overflow-auto overscroll-contain rounded-2xl border border-line bg-surface text-ink shadow-xl backdrop:bg-ink/50"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2
            id="course-dialog-title"
            lang={course.courseTemplate?.targetLanguage}
            className="text-lg font-semibold wrap-break-word"
          >
            {course.title}
          </h2>
          <p className="text-xs font-semibold text-brand-ink">{course.difficulty}</p>
        </div>
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="button-secondary shrink-0 rounded-lg px-3 py-2 text-sm font-semibold"
        >
          {t("scenarios:closeCourse")}
        </button>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </dialog>
  );
}
