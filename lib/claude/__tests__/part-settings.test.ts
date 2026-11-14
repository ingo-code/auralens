// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { CLAUDE_MODEL, partSettings } from "@/lib/claude/client";

const VARS = ["ANTHROPIC_MODEL_MARKET", "ANTHROPIC_EFFORT_MARKET", "ANTHROPIC_EFFORT_PROMPTS"];

describe("partSettings", () => {
  afterEach(() => {
    for (const name of VARS) delete process.env[name];
    vi.restoreAllMocks();
  });

  it("nimmt ohne Vorgaben das Standardmodell mit Effort high", () => {
    expect(partSettings("consistency")).toEqual({ model: CLAUDE_MODEL, effort: "high" });
    expect(partSettings("image")).toEqual({ model: CLAUDE_MODEL, effort: "high" });
  });

  it("liest Modell und Effort pro Teil aus der Umgebung", () => {
    process.env.ANTHROPIC_MODEL_MARKET = "claude-sonnet-5-5";
    process.env.ANTHROPIC_EFFORT_MARKET = "low";

    expect(partSettings("market")).toEqual({ model: "claude-sonnet-5-5", effort: "low" });
    // Other parts are unaffected.
    expect(partSettings("consistency")).toEqual({ model: CLAUDE_MODEL, effort: "high" });
  });

  it("ignoriert eine ungültige Effort-Stufe mit Warnung", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.ANTHROPIC_EFFORT_PROMPTS = "turbo";

    expect(partSettings("prompts").effort).toBe("high");
    expect(warn).toHaveBeenCalledOnce();
  });
});
