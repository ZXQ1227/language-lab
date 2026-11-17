// @language-lab/shared
// Cross-package primitive types, ids and result types.
// Keep this package dependency-light: only zod, no internal deps.
// (Zod schemas for shared payloads land here once the first data model exists.)

/** Branded id types keep cross-package references explicit. */
export type UserId = string & { readonly __brand: "UserId" };
export type LessonId = string & { readonly __brand: "LessonId" };
export type ConversationId = string & { readonly __brand: "ConversationId" };

export const brandId = <T extends string>(value: string) =>
  value as string & { readonly __brand: T };

export interface Result<T, E = string> {
  readonly ok: boolean;
  readonly value?: T;
  readonly error?: E;
}

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error });
