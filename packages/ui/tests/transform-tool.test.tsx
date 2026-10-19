import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransformTool, decodeShareState, encodeShareState, useShareableState, type OptionDef } from "../src";

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined), readText: vi.fn().mockResolvedValue("from clipboard") },
    configurable: true,
  });
});

const upper = (input: string, o: Record<string, unknown>) => (o.exclaim ? `${input.toUpperCase()}!` : input.toUpperCase());

describe("TransformTool", () => {
  it("transforms typed input into output", async () => {
    render(<TransformTool transform={(s) => s.toUpperCase()} inputLabel="Text in" outputLabel="Text out" />);
    await userEvent.type(screen.getByLabelText("Text in"), "hello");
    await waitFor(() => expect(screen.getByLabelText("Text out")).toHaveValue("HELLO"));
  });

  it("shows errors thrown by the transform and clears the output", async () => {
    render(
      <TransformTool
        transform={(s) => {
          if (s.includes("x")) throw new Error("No x allowed");
          return s;
        }}
      />,
    );
    await userEvent.type(screen.getByLabelText("Input"), "ax");
    expect(await screen.findByRole("alert")).toHaveTextContent("No x allowed");
    expect(screen.getByLabelText("Output")).toHaveValue("");
    await userEvent.clear(screen.getByLabelText("Input"));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("supports async transforms", async () => {
    render(<TransformTool transform={async (s) => `async:${s}`} />);
    await userEvent.type(screen.getByLabelText("Input"), "a");
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("async:a"));
  });

  it("passes option values to the transform and reacts to changes", async () => {
    const options: OptionDef[] = [
      { type: "toggle", key: "exclaim", label: "Add exclamation", default: false },
      { type: "select", key: "mode", label: "Mode", default: "a", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
      { type: "number", key: "n", label: "Count", default: 2, min: 1 },
      { type: "text", key: "sep", label: "Separator", default: "-" },
    ];
    const transform = vi.fn(upper);
    render(<TransformTool transform={transform} options={options} />);
    await userEvent.type(screen.getByLabelText("Input"), "hi");
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("HI"));
    expect(transform).toHaveBeenLastCalledWith("hi", { exclaim: false, mode: "a", n: 2, sep: "-" });

    await userEvent.click(screen.getByRole("switch", { name: "Add exclamation" }));
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("HI!"));

    await userEvent.selectOptions(screen.getByLabelText("Mode"), "b");
    await waitFor(() => expect(transform).toHaveBeenLastCalledWith("hi", expect.objectContaining({ mode: "b" })));
  });

  it("does not loop when options are passed inline", async () => {
    const transform = vi.fn((s: string) => s);
    render(<TransformTool transform={transform} options={[{ type: "toggle", key: "a", label: "A", default: false }]} />);
    await userEvent.type(screen.getByLabelText("Input"), "q");
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("q"));
    await new Promise((r) => setTimeout(r, 300));
    expect(transform.mock.calls.length).toBeLessThan(5);
  });

  it("loads a sample, clears, and uses output as input", async () => {
    render(<TransformTool transform={(s) => s + s} sample="ab" />);
    await userEvent.click(screen.getByRole("button", { name: /sample/i }));
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("abab"));
    await userEvent.click(screen.getByRole("button", { name: /use as input/i }));
    expect(screen.getByLabelText("Input")).toHaveValue("abab");
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByLabelText("Input")).toHaveValue("");
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue(""));
  });

  it("pastes from the clipboard", async () => {
    render(<TransformTool transform={(s) => s} />);
    await userEvent.click(screen.getByRole("button", { name: /paste/i }));
    expect(screen.getByLabelText("Input")).toHaveValue("from clipboard");
  });

  it("opens a text file", async () => {
    render(<TransformTool transform={(s) => s} acceptFile=".txt" />);
    await userEvent.upload(screen.getByLabelText("Open a file"), new File(["file body"], "a.txt", { type: "text/plain" }));
    await waitFor(() => expect(screen.getByLabelText("Input")).toHaveValue("file body"));
  });

  it("runs generators on empty input and can regenerate", async () => {
    let n = 0;
    render(<TransformTool transform={() => `value-${++n}`} runOnEmpty hideInput regenerate />);
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("value-1"));
    await userEvent.click(screen.getByRole("button", { name: /regenerate/i }));
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("value-2"));
    expect(screen.queryByLabelText("Input")).not.toBeInTheDocument();
  });

  it("renders extra content with the current context", async () => {
    render(<TransformTool transform={(s) => s.toUpperCase()} renderExtra={({ input, output }) => <p>{`${input.length}:${output}`}</p>} />);
    await userEvent.type(screen.getByLabelText("Input"), "ab");
    expect(await screen.findByText("2:AB")).toBeInTheDocument();
  });

  it("restores state from a shared link and updates the hash", async () => {
    window.history.replaceState(null, "", `/#s=${encodeShareState({ input: "shared", options: {} })}`);
    render(<TransformTool transform={(s) => s.toUpperCase()} />);
    await waitFor(() => expect(screen.getByLabelText("Input")).toHaveValue("shared"));
    await waitFor(() => expect(screen.getByLabelText("Output")).toHaveValue("SHARED"));

    await userEvent.clear(screen.getByLabelText("Input"));
    await userEvent.type(screen.getByLabelText("Input"), "new");
    await waitFor(() => expect(decodeShareState<{ input: string }>(window.location.hash.slice(3))?.input).toBe("new"), { timeout: 2000 });
    expect(await screen.findByRole("button", { name: /copy share link/i })).toBeInTheDocument();
  });

  it("does not touch the URL when sharing is disabled", async () => {
    render(<TransformTool transform={(s) => s} shareable={false} />);
    await userEvent.type(screen.getByLabelText("Input"), "private");
    await new Promise((r) => setTimeout(r, 600));
    expect(window.location.hash).toBe("");
  });
});

describe("share state helpers", () => {
  it("round-trips arbitrary JSON including unicode", () => {
    const value = { input: "héllo 🌍", options: { a: 1, b: true } };
    expect(decodeShareState(encodeShareState(value))).toEqual(value);
  });
  it("returns null for garbage", () => {
    expect(decodeShareState("***")).toBeNull();
    expect(decodeShareState("e30")).toEqual({});
  });
  it("useShareableState keeps the URL clean while state equals the initial value", async () => {
    const { result } = renderHook(() => useShareableState({ v: 1 }, { debounceMs: 10 }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(window.location.hash).toBe("");
    act(() => result.current.setState({ v: 2 }));
    await waitFor(() => expect(window.location.hash).toContain("s="));
    expect(result.current.shareUrl).toContain("#s=");
    act(() => result.current.setState({ v: 1 }));
    await waitFor(() => expect(window.location.hash).toBe(""));
  });
  it("never writes excluded keys to the URL, and ignores them when restoring", async () => {
    window.history.replaceState(null, "", `/#s=${encodeShareState({ label: "from-link", secret: "planted" })}`);
    const { result } = renderHook(() => useShareableState({ label: "", secret: "" }, { debounceMs: 10, exclude: ["secret"] }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    // The planted secret in the link is not loaded; the allowed key is.
    expect(result.current.state).toEqual({ label: "from-link", secret: "" });

    act(() => result.current.setState({ label: "shared", secret: "hunter2" }));
    await waitFor(() => expect(decodeShareState<Record<string, string>>(window.location.hash.slice(3))).toEqual({ label: "shared" }));
    expect(window.location.href).not.toContain("hunter2");
    expect(result.current.state.secret).toBe("hunter2"); // still available in memory
  });

  it("does not touch the URL when only an excluded key changes", async () => {
    const { result } = renderHook(() => useShareableState({ label: "", secret: "" }, { debounceMs: 10, exclude: ["secret"] }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setState((s) => ({ ...s, secret: "typed" })));
    await new Promise((r) => setTimeout(r, 60));
    expect(window.location.hash).toBe("");
    expect(result.current.shareUrl).toBeNull();
  });

  it("skips sharing when the state is too large for a link", async () => {
    const { result } = renderHook(() => useShareableState({ v: "" }, { debounceMs: 10 }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.setState({ v: "x".repeat(20000) }));
    await new Promise((r) => setTimeout(r, 80));
    expect(window.location.hash).toBe("");
    expect(result.current.shareUrl).toBeNull();
  });
});
