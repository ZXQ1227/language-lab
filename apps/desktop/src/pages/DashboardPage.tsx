import { useEffect } from "react";
import { useSystemStore } from "../stores/system";

// Landing page: system status at a glance + the path into the next training
// session (wired up when the teaching loop lands).

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-sm text-slate-800">{children}</div>
    </div>
  );
}

export function DashboardPage() {
  const { health, dbStatus, error, loading, refresh } = useSystemStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Dashboard" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Local-first AI English learning. Everything runs on this machine.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          System check failed: {error}
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-3 rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Retry
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">Checking system…</p>}

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label="App">
            {health ? (
              <>
                status <code className="rounded bg-slate-100 px-1">{health.status}</code>
                {" · "}v<code className="rounded bg-slate-100 px-1">{health.appVersion}</code>
              </>
            ) : (
              "unavailable"
            )}
          </StatCard>
          <StatCard label="Platform">
            {health ? (
              <>
                <code className="rounded bg-slate-100 px-1">{health.os}</code> /{" "}
                <code className="rounded bg-slate-100 px-1">{health.arch}</code>
              </>
            ) : (
              "unavailable"
            )}
          </StatCard>
          <StatCard label="Local database">
            {dbStatus ? (
              <>
                <code className="rounded bg-slate-100 px-1">{dbStatus.tables}</code> tables ·{" "}
                <code className="rounded bg-slate-100 px-1">{dbStatus.migrationsApplied}</code>{" "}
                migrations
              </>
            ) : (
              "unavailable"
            )}
          </StatCard>
          <StatCard label="Next session">
            <button
              type="button"
              disabled
              title="Arrives with the first teaching loop"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Start training (coming soon)
            </button>
          </StatCard>
        </div>
      )}
    </section>
  );
}
