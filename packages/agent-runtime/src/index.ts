// @language-lab/agent-runtime
// The single Teaching Agent: receives student input, loads state and memory,
// routes analysis to skills, makes the teaching decision deterministically,
// generates the reply and persists the new state.
//
// Boundary rules (blueprint 3.1 / Task 06):
// - The orchestrator decides and schedules; skills execute.
// - Skills are always invoked through the SkillRegistry (schema-validated).
// - Persistence goes through injected ports, never direct DB access.

export * from "./events";
export * from "./types";
export * from "./ports";
export * from "./orchestrator";
