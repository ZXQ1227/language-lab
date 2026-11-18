import { useTranslation } from "react-i18next";
// App shell: sidebar navigation + active page.
// Navigation is Zustand-driven (no router dependency for the desktop shell).

import { useEffect } from "react";
import { useNavStore, type PageId } from "./stores/nav";
import { syncScenarioContent } from "./content/syncScenarios";
import { DashboardPage } from "./pages/DashboardPage";
import { ScenariosPage } from "./pages/ScenariosPage";
import { TrainingPage } from "./pages/TrainingPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReviewPage } from "./pages/ReviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { LearningMemoryPage } from "./pages/LearningMemoryPage";
import { useLocaleStore } from "./stores/locale";

const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: "dashboard", label: "common:nav.dashboard" },
  { id: "scenarios", label: "common:nav.scenarios" },
  { id: "training", label: "common:nav.training" },
  { id: "memory", label: "common:nav.memory" },
  { id: "reports", label: "common:nav.reports" },
  { id: "review", label: "common:nav.review" },
  { id: "settings", label: "common:nav.settings" },
];

const PAGES: Record<PageId, React.ReactNode> = {
  dashboard: <DashboardPage />,
  scenarios: <ScenariosPage />,
  training: <TrainingPage />,
  reports: <ReportsPage />,
  review: <ReviewPage />,
  settings: <SettingsPage />,
  memory: <LearningMemoryPage />,
};

export function App() {
  const { t } = useTranslation();
  const page = useNavStore((s) => s.page);
  const navigate = useNavStore((s) => s.navigate);
  const locale = useLocaleStore();
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
    <div className="flex min-h-screen bg-slate-100 text-slate-900">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <div className="px-2">
          <p className="text-base font-semibold tracking-tight">{t("common:languageLab")}</p>
          <p className="mt-0.5 text-xs text-slate-500">{t("common:localFirstEnglishLearning")}</p>
        </div>
        <nav aria-label={t("common:mainNavigation")} className="mt-8 space-y-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => navigate(item.id)}
              aria-current={page === item.id ? "page" : undefined}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                page === item.id
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {t(item.label)}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-2 text-xs text-slate-400">
          {t("common:v001YourDataStaysOnThisDevice")}
        </p>
      </aside>

      <main className="flex-1 px-10 py-8">
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
      </main>
    </div>
  );
}
