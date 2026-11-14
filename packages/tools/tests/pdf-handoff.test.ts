// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getTool } from "../src";
import { canHandOff, handOffPdf, HANDOFF_TARGETS, registerToolNavigator, takePdfHandoff } from "../src/shared/pdf-handoff";

const TOOLS = join(import.meta.dirname, "..", "src", "tools");

afterEach(() => registerToolNavigator(null));

describe("Continue with… hand-off", () => {
  it("only lists real PDF tools, once each", () => {
    const slugs = HANDOFF_TARGETS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(getTool(slug)?.category, slug).toBe("pdf");
  });

  it("lists only tools that pick the file up", () => {
    for (const { slug } of HANDOFF_TARGETS) {
      const src = readFileSync(join(TOOLS, slug, "Tool.tsx"), "utf8");
      expect(/usePdfSource\(|usePdfHandoff\(/.test(src), slug).toBe(true);
    }
  });

  it("does nothing until the site registers a navigator", () => {
    expect(canHandOff()).toBe(false);
    expect(handOffPdf("compress-pdf", "a.pdf", new Uint8Array([1]))).toBe(false);
    expect(takePdfHandoff("compress-pdf")).toBeNull();
  });

  it("navigates to the tool and hands the file over exactly once", () => {
    const navigate = vi.fn();
    registerToolNavigator(navigate);
    const bytes = new Uint8Array([37, 80, 68, 70]);
    expect(handOffPdf("sign-pdf", "contract.pdf", bytes)).toBe(true);
    expect(navigate).toHaveBeenCalledWith("/tools/sign-pdf");
    expect(takePdfHandoff("compress-pdf")).toBeNull();
    expect(takePdfHandoff("sign-pdf")).toEqual({ to: "sign-pdf", name: "contract.pdf", bytes });
    expect(takePdfHandoff("sign-pdf")).toBeNull();
  });
});
