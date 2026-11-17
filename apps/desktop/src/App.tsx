// Placeholder shell. Real pages (dashboard / scenarios / training / reports /
// settings) arrive with the first UI task.

import type { LessonPhase } from "@language-lab/core";

const currentPhase: LessonPhase = "setup";

export function App() {
  return (
    <main className="shell">
      <h1>Language Lab</h1>
      <p>Local-first AI language learning desktop app.</p>
      <p>
        Workspace wiring check — core package loaded, lesson phase: <code>{currentPhase}</code>
      </p>
    </main>
  );
}
