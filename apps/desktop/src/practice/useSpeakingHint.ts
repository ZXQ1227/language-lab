import { useEffect, useRef, useState } from "react";
import { isGatewayError } from "@language-lab/model-gateway";
import type { SpeakingHintRecord } from "./records";

type HintFailure = "save" | "timeout" | "network" | "auth" | "rateLimit" | "format" | "unknown";

function hintFailure(error: unknown): HintFailure {
  if (error instanceof DOMException && error.name === "TimeoutError") return "timeout";
  if (!isGatewayError(error)) return "unknown";
  switch (error.kind) {
    case "timeout":
    case "network":
    case "auth":
      return error.kind;
    case "rate_limit":
      return "rateLimit";
    case "schema_violation":
    case "invalid_request":
      return "format";
    default:
      return "unknown";
  }
}

export function useSpeakingHint(
  anchor: string,
  current: SpeakingHintRecord | undefined,
  request: (signal: AbortSignal) => Promise<void | "saveFailed">,
) {
  const operation = useRef<AbortController | null>(null);
  const [status, setStatus] = useState<
    { anchor: string; phase: "loading" } | { anchor: string; phase: "error"; failure: HintFailure }
  >();
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
      const result = await request(controller.signal);
      if (!controller.signal.aborted) {
        setStatus(
          result === "saveFailed" ? { anchor, phase: "error", failure: "save" } : undefined,
        );
        if (result !== "saveFailed") setHiddenAt(undefined);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus({ anchor, phase: "error", failure: hintFailure(error) });
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }

  return {
    phase: status?.anchor === anchor ? status.phase : undefined,
    failure: status?.anchor === anchor && status.phase === "error" ? status.failure : undefined,
    current: hiddenAt === anchor ? undefined : current,
    hide: () => setHiddenAt(anchor),
    show,
    cancel,
  };
}
