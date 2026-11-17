// Placeholder shell. Real pages (dashboard / scenarios / training / reports /
// settings) arrive with the first UI task.
//
// The health check call verifies the Tauri IPC bridge end to end: webview
// invoke -> Rust command -> serialized report back to React state.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LessonPhase } from "@language-lab/core";

interface HealthReport {
  status: string;
  appVersion: string;
  os: string;
  arch: string;
}

const currentPhase: LessonPhase = "setup";

export function App() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<HealthReport>("health_check")
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main className="shell">
      <h1>Language Lab</h1>
      <p>Local-first AI language learning desktop app.</p>
      <section>
        <h2>IPC health check</h2>
        {health ? (
          <ul>
            <li>
              status: <code>{health.status}</code>
            </li>
            <li>
              app version: <code>{health.appVersion}</code>
            </li>
            <li>
              platform: <code>
                {health.os} / {health.arch}
              </code>
            </li>
          </ul>
        ) : (
          <p>{error ? `IPC error: ${error}` : "calling health_check…"}</p>
        )}
      </section>
      <p>
        Workspace wiring check — core package loaded, lesson phase:{" "}
        <code>{currentPhase}</code>
      </p>
    </main>
  );
}
