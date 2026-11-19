import { useTranslation } from "react-i18next";
// App shell: sidebar navigation + active page.
// Navigation is Zustand-driven (no router dependency for the desktop shell).

import { useEffect } from "react";
import { useNavStore, workspaces, type PageId } from "./stores/nav";
import { syncScenarioContent } from "./content/syncScenarios";
import { PlanPage, ConversationPage, ListeningPage, ProfilePage } from "./pages/LearningWorkspaces";
import { ScenariosPage } from "./pages/ScenariosPage";
import { TrainingPage } from "./pages/TrainingPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LearningMemoryPage } from "./pages/LearningMemoryPage";
import { useLocaleStore } from "./stores/locale";
import { useTrainingStore } from "./stores/training";

const PAGES: Record<PageId, React.ReactNode> = {
  plan: <PlanPage />,
  scenarios: <ScenariosPage />,
  conversation: <ConversationPage />,
  training: <TrainingPage />,
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

export function App() {
  const { t } = useTranslation();
  const page = useNavStore((s) => s.page);
  const navigate = useNavStore((s) => s.navigate);
  const locale = useLocaleStore();
  const lessonActive = useTrainingStore(
    (s) => !!s.session && s.loaded && s.session.state.phase !== "done",
  );
  const focused = page === "training" && lessonActive;
  const workspace = workspaces.find(({ pages }) => pages.some((item) => item === page))!;
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
          ? "flex h-dvh overflow-hidden bg-stone-50 text-slate-900"
          : "min-h-screen bg-stone-50 text-slate-900 lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)]"
      }
    >
      {!focused && (
        <aside className="border-b border-emerald-950/15 bg-[#11332f] px-4 py-5 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:px-5 lg:py-8">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#def3ad] text-sm font-bold text-emerald-950"
            >
              {t("common:brand.monogram")}
            </span>
            <p className="font-semibold tracking-tight">{t("common:brand.name")}</p>
          </div>
          <nav
            aria-label={t("common:mainNavigation")}
            className="mt-5 grid grid-cols-4 gap-2 lg:mt-10 lg:grid-cols-1"
          >
            {workspaces.map(({ id, pages }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (workspace.id !== id) navigate(pages[0]);
                }}
                aria-current={workspace.id === id ? "true" : undefined}
                className={`rounded-lg px-1 py-2.5 text-xs font-medium sm:px-3 sm:text-sm lg:px-4 lg:text-left ${workspace.id === id ? "bg-[#def3ad] text-emerald-950" : "text-emerald-50 hover:bg-white/10"}`}
              >
                {t(`common:workspace.sections.${id}`)}
              </button>
            ))}
          </nav>
          <p className="mt-auto hidden text-xs text-emerald-100/70 lg:block">
            {t("common:v001YourDataStaysOnThisDevice")}
          </p>
        </aside>
      )}

      <main
        className={focused ? "flex min-w-0 flex-1 flex-col" : "min-w-0 px-4 pb-12 sm:px-8 lg:px-10"}
      >
        <div className={focused ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-6xl"}>
          {!focused && (
            <nav
              aria-label={t("common:workspace.sectionNavigation")}
              className="mb-7 flex flex-wrap gap-x-5 gap-y-1 border-b border-stone-200 pt-3 sm:mb-9 sm:pt-5"
            >
              {workspace.pages.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => navigate(item)}
                  aria-current={page === item ? "page" : undefined}
                  className={`border-b-2 py-3 text-sm font-semibold ${page === item ? "border-emerald-700 text-emerald-900" : "border-transparent text-slate-600 hover:text-emerald-900"}`}
                >
                  {t(`common:workspace.pages.${item}`)}
                </button>
              ))}
            </nav>
          )}
          {locale.error && page !== "settings" && (
            <div
              role="status"
              className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm"
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
