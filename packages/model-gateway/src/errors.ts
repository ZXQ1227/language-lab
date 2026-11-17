// Error taxonomy for every gateway failure. Teaching code catches
// GatewayError and branches on `kind` - never on provider-specific shapes.

export type GatewayErrorKind =
  /** Call exceeded its deadline (explicitly aborted with timeout). */
  | "timeout"
  /** Caller aborted via AbortSignal. */
  | "cancelled"
  /** Connection-level failure (DNS, refused, TLS). */
  | "network"
  /** Credentials missing, wrong or expired. */
  | "auth"
  | "rate_limit"
  /** Provider rejected the request shape (bad model, bad params). */
  | "invalid_request"
  /** Model output failed Zod validation in generateStructured. */
  | "schema_violation"
  /** Anything the provider returned that we could not classify. */
  | "provider_error";

export class GatewayError extends Error {
  readonly kind: GatewayErrorKind;
  readonly providerId: string;
  /** HTTP status when the error came from a provider response. */
  readonly statusCode?: number;
  /** Short detail safe for logs; never contains keys or audio content. */
  readonly detail?: string;
  /** Underlying cause for diagnostics; never serialized to UI. */
  readonly cause?: unknown;

  constructor(params: {
    kind: GatewayErrorKind;
    providerId: string;
    message: string;
    statusCode?: number;
    detail?: string;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "GatewayError";
    this.kind = params.kind;
    this.providerId = params.providerId;
    this.statusCode = params.statusCode;
    this.detail = params.detail;
    this.cause = params.cause;
  }

  get retryable(): boolean {
    return (
      this.kind === "timeout" ||
      this.kind === "network" ||
      this.kind === "rate_limit" ||
      (this.kind === "provider_error" && this.statusCode !== undefined && this.statusCode >= 500)
    );
  }
}

export function isGatewayError(value: unknown): value is GatewayError {
  return value instanceof GatewayError;
}

/** Normalizes any thrown value into a GatewayError. */
export function toGatewayError(value: unknown, providerId: string): GatewayError {
  if (isGatewayError(value)) return value;
  if (value instanceof DOMException && value.name === "AbortError") {
    return new GatewayError({ kind: "timeout", providerId, message: "call timed out" });
  }
  if (value instanceof Error && value.name === "AbortError") {
    return new GatewayError({ kind: "timeout", providerId, message: "call timed out" });
  }
  const message = value instanceof Error ? value.message : String(value);
  return new GatewayError({
    kind: "provider_error",
    providerId,
    message: message || "unknown provider failure",
    cause: value,
  });
}

const STATUS_KINDS: ReadonlyArray<readonly [number, GatewayErrorKind]> = [
  [401, "auth"],
  [403, "auth"],
  [404, "invalid_request"],
  [422, "invalid_request"],
  [429, "rate_limit"],
];

export function kindForStatus(status: number): GatewayErrorKind {
  const match = STATUS_KINDS.find(([min]) => status === min);
  if (match) return match[1];
  if (status >= 500) return "provider_error";
  return "invalid_request";
}
