import { useEffect } from "react";
import { useSystemStore } from "../stores/system";
import { SpeechSettings } from "../components/SpeechSettings";

// System facts and speech configuration. Credentials use the OS keyring via
// the Rust core; conversation-model configuration stays with lesson setup.

export function SettingsPage() {
  const { dbStatus, error, refresh } = useSystemStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section aria-label="Settings" className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">System status and provider configuration.</p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          Could not read system status: {error}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Database</h2>
        <p className="mt-2 break-all text-sm text-slate-600">
          {dbStatus ? (
            <>
              Location: <code className="rounded bg-slate-100 px-1">{dbStatus.path}</code>
            </>
          ) : (
            "unavailable"
          )}
        </p>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">AI providers</h2>
        <p className="mt-2 text-sm text-slate-600">
          API keys are stored in the OS keyring through the Rust core. Configure the conversation
          model when starting a lesson; speech providers are configured below.
        </p>
      </div>
      <SpeechSettings />
    </section>
  );
}
