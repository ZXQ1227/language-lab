// Central skill registry: registration, lookup and validated invocation.
//
// The registry is the enforcement point for the schema boundary rule -
// no skill output reaches the orchestrator unvalidated, and no malformed
// input ever reaches a skill's execute().

import type { z } from "zod";
import type { SkillContext } from "./context";
import type { AnySkillDefinition, SkillDefinition } from "./contract";

export class SkillValidationError extends Error {
  constructor(
    readonly skillId: string,
    readonly boundary: "input" | "output",
    readonly issues: readonly z.ZodIssue[],
  ) {
    super(
      `skill ${skillId} ${boundary} validation failed: ${issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ")}`,
    );
    this.name = "SkillValidationError";
  }
}

export class UnknownSkillError extends Error {
  constructor(readonly skillId: string) {
    super(`unknown skill: ${skillId}`);
    this.name = "UnknownSkillError";
  }
}

export class DuplicateSkillError extends Error {
  constructor(readonly skillId: string) {
    super(`skill already registered: ${skillId}`);
    this.name = "DuplicateSkillError";
  }
}

export class SkillRegistry {
  private readonly defs = new Map<string, AnySkillDefinition>();

  register<TInput, TOutput>(def: SkillDefinition<TInput, TOutput>): void {
    if (this.defs.has(def.id)) throw new DuplicateSkillError(def.id);
    this.defs.set(def.id, def as unknown as AnySkillDefinition);
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  get(id: string): AnySkillDefinition | undefined {
    return this.defs.get(id);
  }

  require(id: string): AnySkillDefinition {
    const def = this.defs.get(id);
    if (!def) throw new UnknownSkillError(id);
    return def;
  }

  list(): readonly AnySkillDefinition[] {
    return [...this.defs.values()];
  }

  ids(): readonly string[] {
    return [...this.defs.keys()];
  }

  /**
   * Validated invocation. Input is parsed before execute(); output is parsed
   * before returning. Both failures surface as SkillValidationError.
   */
  async call<TOutput>(id: string, input: unknown, context: SkillContext): Promise<TOutput> {
    const def = this.require(id);
    const parsedInput = def.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new SkillValidationError(id, "input", parsedInput.error.issues);
    }
    const rawOutput = await def.execute(parsedInput.data, context);
    const parsedOutput = def.outputSchema.safeParse(rawOutput);
    if (!parsedOutput.success) {
      throw new SkillValidationError(id, "output", parsedOutput.error.issues);
    }
    return parsedOutput.data as TOutput;
  }
}
