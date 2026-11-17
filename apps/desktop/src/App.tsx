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

const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "scenarios", label: "Scenarios" },
  { id: "training", label: "Training" },
  { id: "memory", label: "Learning memory" },
  { id: "reports", label: "Reports" },
  { id: "review", label: "Review" },
  { id: "settings", label: "Settings" },
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
  const page = useNavStore((s) => s.page);
  const navigate = useNavStore((s) => s.navigate);

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
          <p className="text-base font-semibold tracking-tight">Language Lab</p>
          <p className="mt-0.5 text-xs text-slate-500">Local-first English learning</p>
        </div>
        <nav aria-label="Main navigation" className="mt-8 space-y-1">
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
              {item.label}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-2 text-xs text-slate-400">
          v0.0.1 · your data stays on this device
        </p>
      </aside>

      <main className="flex-1 px-10 py-8">{PAGES[page]}</main>
    </div>
  );
}
