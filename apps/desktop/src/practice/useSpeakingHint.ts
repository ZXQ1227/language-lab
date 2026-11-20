import { useEffect, useRef, useState } from "react";
import type { SpeakingHintRecord } from "./records";

export function useSpeakingHint(
  anchor: string,
  current: SpeakingHintRecord | undefined,
  request: (signal: AbortSignal) => Promise<void>,
) {
  const operation = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<{ anchor: string; phase: "loading" | "error" }>();
  const [hiddenAt, setHiddenAt] = useState<string>();

  function cancel() {
    operation.current?.abort();
    operation.current = null;
    setStatus(undefined);
  }

  useEffect(
    () => () => {
      operation.current?.abort();
      operation.current = null;
    },
    [anchor],
  );

  async function show() {
    if (operation.current) return;
    if (current) {
      setHiddenAt(undefined);
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setStatus({ anchor, phase: "loading" });
    try {
      await request(controller.signal);
      if (!controller.signal.aborted) {
        setStatus(undefined);
        setHiddenAt(undefined);
      }
    } catch {
      if (!controller.signal.aborted) setStatus({ anchor, phase: "error" });
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }

  return {
    phase: status?.anchor === anchor ? status.phase : undefined,
    current: hiddenAt === anchor ? undefined : current,
    hide: () => setHiddenAt(anchor),
    show,
    cancel,
  };
}
