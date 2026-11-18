import { LocalizedError } from "./LocalizedError";
import { formatNumber } from "../i18n";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useSystemStore } from "../stores/system";

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-2 text-sm text-slate-800">{children}</div>
    </div>
  );
}

export function SystemStatus() {
  const { t } = useTranslation();
  const { health, dbStatus, error, loading, refresh } = useSystemStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label={t("common:workspace.diagnostics")} className="space-y-4">
      <h2 className="font-semibold">{t("common:workspace.diagnostics")}</h2>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {t("dashboard:systemCheckFailed")}
          <LocalizedError error={error} />
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-3 rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            {t("dashboard:retry")}
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">{t("dashboard:checkingSystem")}</p>}

      {!loading && !error && (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard label={t("dashboard:app")}>
            {health ? (
              <>
                {t("dashboard:status")}
                <code className="rounded bg-slate-100 px-1">{health.status}</code>
                {" · "}
                {t("dashboard:v")}
                <code className="rounded bg-slate-100 px-1">{health.appVersion}</code>
              </>
            ) : (
              t("dashboard:unavailable")
            )}
          </StatCard>
          <StatCard label={t("dashboard:platform")}>
            {health ? (
              <>
                <code className="rounded bg-slate-100 px-1">{health.os}</code> /{" "}
                <code className="rounded bg-slate-100 px-1">{health.arch}</code>
              </>
            ) : (
              t("dashboard:unavailable")
            )}
          </StatCard>
          <StatCard label={t("dashboard:localDatabase")}>
            {dbStatus ? (
              <>
                <code className="rounded bg-slate-100 px-1">{formatNumber(dbStatus.tables)}</code>{" "}
                {t("dashboard:tables")}{" "}
                <code className="rounded bg-slate-100 px-1">
                  {formatNumber(dbStatus.migrationsApplied)}
                </code>{" "}
                {t("dashboard:migrations")}
                <p className="mt-2 break-all">
                  {t("settings:location")}
                  <code>{dbStatus.path}</code>
                </p>
              </>
            ) : (
              t("dashboard:unavailable")
            )}
          </StatCard>
        </div>
      )}
    </section>
  );
}
