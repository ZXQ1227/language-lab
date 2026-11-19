import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { homeTabs, libraryTabs, useNavStore, workspaces, type PageId } from "./stores/nav";
import { syncScenarioContent } from "./content/syncScenarios";
import { libraryDifficulties } from "./content/courseDifficulty";
import {
  GuidedPracticePage,
  ListeningPage,
  PlanPage,
  ProfilePage,
} from "./pages/LearningWorkspaces";
import { ScenariosPage } from "./pages/ScenariosPage";
import { TrainingPage } from "./pages/TrainingPage";
import { FreeConversationPage } from "./pages/FreeConversationPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LearningMemoryPage } from "./pages/LearningMemoryPage";
import { useLocaleStore } from "./stores/locale";
import { useTrainingStore } from "./stores/training";

const saydenLogo = new URL("../src-tauri/icons/128x128.png", import.meta.url).href;

const PAGES: Record<PageId, React.ReactNode> = {
  plan: <PlanPage />,
  scenarios: <ScenariosPage />,
  guided: <GuidedPracticePage />,
  training: <TrainingPage />,
  freeConversation: <FreeConversationPage />,
  listening: <ListeningPage />,
  review: <ReviewPage />,
  vocabulary: <LearningMemoryPage key="vocabulary" view="vocabulary" />,
  sentences: <ReviewPage key="sentences" sentencesOnly />,
  corrections: <LearningMemoryPage key="corrections" view="corrections" />,
  reports: <ReportsPage />,
  profile: <ProfilePage />,
  memory: <LearningMemoryPage />,
  settings: <SettingsPage />,
};

function SectionNavigation({
  label,
  pages,
  current,
  library = false,
}: {
  label: string;
  pages: readonly PageId[];
  current: PageId;
  library?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavStore((state) => state.navigate);
  return (
    <nav
      aria-label={label}
      className={
        library
          ? "flex min-w-0 flex-wrap gap-1"
          : "mb-4 flex flex-wrap gap-x-5 gap-y-1 border-b border-line pt-1 sm:pt-4"
      }
    >
      {pages.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => navigate(item)}
          aria-current={current === item ? "page" : undefined}
          className={
            library
              ? "rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-hover hover:text-brand-ink aria-[current=page]:bg-brand-primary-soft aria-[current=page]:text-brand-ink"
              : "border-b-2 border-transparent py-3 text-sm font-semibold text-ink-muted hover:text-brand-ink aria-[current=page]:border-brand-primary aria-[current=page]:text-brand-ink"
          }
        >
          {t(library ? `common:workspace.libraryTabs.${item}` : `common:workspace.pages.${item}`)}
        </button>
      ))}
    </nav>
  );
}

function LibraryDifficultySelect() {
  const { t } = useTranslation();
  const libraryDifficulty = useNavStore((state) => state.libraryDifficulty);
  const setLibraryDifficulty = useNavStore((state) => state.setLibraryDifficulty);
  return (
    <label className="ml-auto flex items-center gap-2 text-sm font-medium text-ink-muted">
      <span>{t("scenarios:difficulty.label")}</span>
      <select
        value={libraryDifficulty}
        onChange={(event) => {
          const selected = libraryDifficulties.find((value) => value === event.target.value);
          if (selected) setLibraryDifficulty(selected);
        }}
        className="form-control rounded-xl border bg-surface px-2.5 py-2 font-semibold"
      >
        {libraryDifficulties.map((value) => (
          <option key={value} value={value}>
            {t(`scenarios:difficulty.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function App() {
  const { t } = useTranslation();
  const page = useNavStore((s) => s.page);
  const trainingReturnPage = useNavStore((s) => s.trainingReturnPage);
  const navigate = useNavStore((s) => s.navigate);
  const locale = useLocaleStore();
  const lessonActive = useTrainingStore(
    (s) => !!s.session && s.loaded && s.session.state.phase !== "done",
  );
  const focused = page === "freeConversation" || (page === "training" && lessonActive);
  const sectionPage = page === "training" ? trainingReturnPage : page;
  const workspace = workspaces.find(({ pages }) => pages.some((item) => item === sectionPage))!;
  const atLibrary = libraryTabs.some((item) => item === sectionPage);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "hidden") void useLocaleStore.getState().refreshSystem();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("languagechange", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 30000);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("languagechange", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  useEffect(() => {
    // Idempotent content sync: refreshes bundled scenario templates on every
    // startup, never touches user data.
    void syncScenarioContent().catch((cause) => {
      console.error("scenario content sync failed", cause);
    });
  }, []);

  return (
    <div
      className={
        focused
          ? "flex h-dvh overflow-hidden bg-app text-ink"
          : "min-h-screen bg-app text-ink lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)]"
      }
    >
      {!focused && (
        <aside className="border-b border-line bg-sidebar px-4 py-3 sm:px-8 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0 lg:px-5 lg:py-8">
          <div className="flex items-center gap-3">
            <img src={saydenLogo} alt="" width={36} height={36} className="size-9 shrink-0" />
            <p className="font-semibold tracking-tight">{t("common:brand.name")}</p>
          </div>
          <nav
            aria-label={t("common:mainNavigation")}
            className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 mx-auto grid max-w-sm grid-cols-3 gap-1 rounded-3xl border border-line-strong bg-surface/95 p-1.5 shadow-lg backdrop-blur-md lg:static lg:mx-0 lg:mt-10 lg:max-w-none lg:grid-cols-1 lg:gap-2 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
          >
            {workspaces.map(({ id, pages }) => (
              <button
                key={id}
                type="button"
                onClick={() => navigate(pages[0])}
                aria-current={workspace.id === id ? "true" : undefined}
                className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center text-xs lg:items-start lg:rounded-lg lg:px-4 lg:py-2.5 lg:text-left lg:text-sm ${workspace.id === id ? "bg-brand-primary-soft font-semibold text-brand-ink ring-1 ring-brand-primary ring-inset hover:bg-selected-hover" : "button-ghost font-medium"}`}
              >
                <span className="workspace-icon lg:hidden" data-workspace={id} aria-hidden="true" />
                {t(`common:workspace.sections.${id}`)}
              </button>
            ))}
          </nav>
          <p className="mt-auto hidden text-xs text-ink-muted lg:block">
            {t("common:v001YourDataStaysOnThisDevice")}
          </p>
        </aside>
      )}

      <main
        className={
          focused
            ? "flex min-w-0 flex-1 flex-col"
            : `min-w-0 px-4 sm:px-8 lg:px-10 ${page === "plan" ? "pb-[calc(10rem+env(safe-area-inset-bottom))] lg:pb-24" : "pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-12"}`
        }
      >
        <div className={focused ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-6xl"}>
          {!focused && (
            <>
              <SectionNavigation
                label={t("common:workspace.sectionNavigation")}
                pages={workspace.id === "home" ? homeTabs : workspace.pages}
                current={atLibrary ? "scenarios" : sectionPage}
              />
              {atLibrary && (
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                  <SectionNavigation
                    label={t("common:workspace.libraryNavigation")}
                    pages={libraryTabs}
                    current={sectionPage}
                    library
                  />
                  {page !== "training" && <LibraryDifficultySelect />}
                </div>
              )}
            </>
          )}
          {locale.error && page !== "settings" && (
            <div
              role="status"
              className="mb-4 rounded border border-warning-line bg-chat-hint p-3 text-sm text-hint-ink"
            >
              {t(`common:locale.errors.${locale.error}`)}
              <button
                className="ml-2 underline"
                disabled={locale.loading || locale.saving}
                onClick={() => void locale.initialize()}
              >
                {t("common:locale.retry")}
              </button>
            </div>
          )}
          {PAGES[page]}
        </div>
      </main>
    </div>
  );
}
