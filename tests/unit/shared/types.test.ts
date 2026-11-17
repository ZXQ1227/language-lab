// Shared primitive types: branded ids and Result.

import { describe, expect, it } from "vitest";
import { brandId, err, ok, type UserId } from "@language-lab/shared";

describe("brandId", () => {
  it("returns a branded id for a plain string", () => {
    const id = brandId<UserId>("user-1");
    expect(id).toBe("user-1");
    // Branded types are string-compatible at runtime; the branding is
    // compile-time only.
    const lesson = brandId<"LessonId">("lesson-1");
    expect(lesson).toBe("lesson-1");
  });
});

describe("Result", () => {
  it("ok wraps a value with ok: true", () => {
    const result = ok(42);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it("err wraps an error with ok: false", () => {
    const result = err("boom");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("boom");
    expect(result.value).toBeUndefined();
  });
});
