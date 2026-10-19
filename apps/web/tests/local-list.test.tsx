import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FAVORITES_KEY, RECENTS_KEY, clearList, parseList, pushRecent, toggleFavorite, useLocalList, writeList } from "../src/lib/local-list";
import { FavoriteButton } from "../src/components/favorite-button";

beforeEach(() => {
  window.localStorage.clear();
  act(() => clearList(FAVORITES_KEY));
  act(() => clearList(RECENTS_KEY));
});

describe("parseList", () => {
  it("accepts string arrays and rejects everything else", () => {
    expect(parseList('["a","b"]')).toEqual(["a", "b"]);
    expect(parseList('["a",1,null,"b"]')).toEqual(["a", "b"]);
    expect(parseList("{}")).toEqual([]);
    expect(parseList("not json")).toEqual([]);
    expect(parseList(null)).toEqual([]);
    expect(parseList("")).toEqual([]);
  });
});

describe("favorites and recents", () => {
  it("toggles favorites and persists them", () => {
    act(() => toggleFavorite("merge-pdf"));
    act(() => toggleFavorite("json-formatter"));
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY)!)).toEqual(["merge-pdf", "json-formatter"]);
    act(() => toggleFavorite("merge-pdf"));
    expect(JSON.parse(window.localStorage.getItem(FAVORITES_KEY)!)).toEqual(["json-formatter"]);
  });

  it("keeps the most recent first, without duplicates, capped at 8", () => {
    for (const slug of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) act(() => pushRecent(slug));
    act(() => pushRecent("e"));
    const recents = JSON.parse(window.localStorage.getItem(RECENTS_KEY)!) as string[];
    expect(recents).toHaveLength(8);
    expect(recents[0]).toBe("e");
    expect(new Set(recents).size).toBe(8);
    expect(recents).not.toContain("a");
  });

  it("does nothing when the same tool is visited twice in a row", () => {
    act(() => pushRecent("x"));
    const spy = vi.spyOn(Storage.prototype, "setItem");
    act(() => pushRecent("x"));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("useLocalList reacts to changes and returns a stable snapshot between them", () => {
    const { result } = renderHook(() => useLocalList(FAVORITES_KEY));
    const first = result.current;
    expect(first).toEqual([]);
    act(() => writeList(FAVORITES_KEY, ["x"]));
    expect(result.current).toEqual(["x"]);
    const second = result.current;
    expect(renderHook(() => useLocalList(FAVORITES_KEY)).result.current).toBe(second);
  });

  it("syncs across tabs via the storage event", () => {
    const { result } = renderHook(() => useLocalList(RECENTS_KEY));
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(["from-other-tab"]));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: RECENTS_KEY }));
    });
    expect(result.current).toEqual(["from-other-tab"]);
  });

  it("keeps working in memory when storage is blocked", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useLocalList(FAVORITES_KEY));
    expect(result.current).toEqual([]);
    expect(() => act(() => toggleFavorite("anything"))).not.toThrow();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe("FavoriteButton", () => {
  it("icon-only button has a descriptive name and toggles aria-pressed", async () => {
    render(<FavoriteButton slug="merge-pdf" name="Merge PDF" />);
    const button = screen.getByRole("button", { name: "Add Merge PDF to favorites" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Remove Merge PDF from favorites" })).toHaveAttribute("aria-pressed", "true");
  });

  it("labelled button keeps its visible text as the accessible name (WCAG 2.5.3)", async () => {
    render(<FavoriteButton slug="merge-pdf" name="Merge PDF" withLabel />);
    const button = screen.getByRole("button", { name: "Favorite" });
    expect(button).not.toHaveAttribute("aria-label");
    await userEvent.click(button);
    expect(screen.getByRole("button", { name: "Favorite" })).toHaveAttribute("aria-pressed", "true");
  });

  it("does not trigger a clickable parent (the whole card is a link)", async () => {
    const onClick = vi.fn();
    render(
      <div onClick={onClick}>
        <FavoriteButton slug="x" name="X" />
      </div>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
