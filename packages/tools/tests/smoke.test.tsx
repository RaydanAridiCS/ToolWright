import { render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toolLoaders } from "../src/loaders.generated";
import { tools } from "../src";

// Every tool must mount without crashing or logging React errors.
describe("tool smoke tests", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    window.history.replaceState(null, "", "/");
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it("has a loader for every tool", () => {
    expect(Object.keys(toolLoaders).sort()).toEqual(tools.map((t) => t.slug).sort());
  });

  it.each(tools.map((t) => t.slug))("%s mounts", async (slug) => {
    const loader = toolLoaders[slug];
    expect(loader).toBeDefined();
    const mod = await (loader as NonNullable<typeof loader>)();
    expect(typeof mod.default).toBe("function");
    const { container, unmount } = render(createElement(mod.default));
    await waitFor(() => expect(container.firstElementChild).not.toBeNull());
    // Give mount effects a tick to run (generators, clocks, defaults).
    await new Promise((r) => setTimeout(r, 30));
    expect(container.textContent?.length ?? 0).toBeGreaterThan(0);
    unmount();
    const reactErrors = errorSpy.mock.calls.filter((call) => /Warning|Error:|Uncaught|act\(/.test(String(call[0])));
    expect(reactErrors, `console.error output from ${slug}`).toEqual([]);
  });
});

describe("tool behaviour", () => {
  beforeEach(() => window.history.replaceState(null, "", "/"));

  async function mount(slug: string) {
    const mod = await (toolLoaders[slug] as NonNullable<(typeof toolLoaders)[string]>)();
    return render(createElement(mod.default));
  }

  it("password generator produces a password of the chosen length", async () => {
    await mount("password-generator");
    const el = await screen.findByTestId("generated");
    await waitFor(() => expect(el.textContent).toHaveLength(20));
  });

  it("tip calculator splits the bill", async () => {
    await mount("tip-calculator");
    // 86.40 + 18% = 101.952 → /3 = 33.984
    expect((await screen.findByTestId("per-person")).textContent).toBe("$33.98");
  });

  it("loan calculator shows the standard 30-year payment", async () => {
    await mount("loan-calculator");
    // $250,000 at 6.5% for 30 years
    expect((await screen.findByTestId("payment")).textContent).toBe("$1,580.17");
  });

  it("compound interest calculator projects growth", async () => {
    await mount("compound-interest-calculator");
    const value = (await screen.findByTestId("future-value")).textContent ?? "";
    expect(Number(value.replace(/[$,]/g, ""))).toBeGreaterThan(100_000);
  });

  it("unit converter converts 1 meter to feet by default", async () => {
    await mount("unit-converter");
    expect((await screen.findByTestId("unit-result")).textContent).toBe("3.280839895 ft");
  });

  it("json formatter formats input", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    await mount("json-formatter");
    await userEvent.click(screen.getByRole("button", { name: /sample/i }));
    await waitFor(() => expect((screen.getByLabelText("Result") as HTMLTextAreaElement).value).toContain('"name": "Toolwright"'));
    expect(await screen.findByText(/Valid JSON/)).toBeInTheDocument();
  });

  it("json formatter reports the line and column of an error", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    await mount("json-formatter");
    await userEvent.click(screen.getByLabelText("JSON"));
    await userEvent.paste('{\n  "a": 1,\n  "b": }');
    expect(await screen.findByRole("alert")).toHaveTextContent(/line 3/);
  });

  it("case converter converts to camelCase", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    await mount("case-converter");
    await userEvent.type(screen.getByLabelText("Text"), "hello big world");
    await waitFor(() => expect((screen.getByLabelText("Converted") as HTMLTextAreaElement).value).toBe("helloBigWorld"));
  });

  it("word counter counts as you type", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    await mount("word-counter");
    await userEvent.type(screen.getByLabelText("Your text"), "one two three");
    await waitFor(() => expect(screen.getByText("Words").nextElementSibling?.textContent).toBe("3"));
  });

  it("chmod calculator keeps octal and symbolic in sync", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    await mount("chmod-calculator");
    expect(screen.getByLabelText("Octal")).toHaveValue("755");
    await userEvent.click(screen.getByLabelText("Others execute"));
    expect(screen.getByLabelText("Octal")).toHaveValue("754");
    expect(screen.getByLabelText("Symbolic")).toHaveValue("rwxr-xr--");
  });

  it("http status reference filters by search", async () => {
    const { default: userEvent } = await import("@testing-library/user-event");
    await mount("http-status-codes");
    await userEvent.type(screen.getByLabelText("Search status codes"), "teapot");
    expect(await screen.findByText("I'm a teapot")).toBeInTheDocument();
    expect(screen.queryByText("Not Found")).not.toBeInTheDocument();
  });
});
