import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTool, tools } from "@toolwright/tools";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CommandPalette, SearchButton } from "../src/components/command-palette";
import { ThemeToggle, THEME_INIT_SCRIPT, THEME_KEY, applyTheme } from "../src/components/theme-toggle";
import { Ledger, catalogueNumber } from "../src/components/ledger";
import { JsonLd } from "../src/components/json-ld";
import { FAVORITES_KEY, RECENTS_KEY, clearList, pushRecent, toggleFavorite } from "../src/lib/local-list";

beforeEach(() => {
  push.mockClear();
  window.localStorage.clear();
  document.documentElement.className = "";
  act(() => {
    clearList(FAVORITES_KEY);
    clearList(RECENTS_KEY);
  });
});

describe("CommandPalette", () => {
  const open = async () => {
    render(
      <>
        <SearchButton label="Open search">x</SearchButton>
        <CommandPalette />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open search" }));
    return screen.findByRole("dialog");
  };

  it("opens from a button, shows popular tools and pages, and closes with Escape", async () => {
    const dialog = await open();
    expect(within(dialog).getByPlaceholderText(`Search ${tools.length} tools…`)).toBeInTheDocument();
    expect(within(dialog).getByText("Popular")).toBeInTheDocument();
    expect(within(dialog).getByText("Merge PDF")).toBeInTheDocument();
    expect(within(dialog).getByText("Request a tool")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens with Ctrl+K and with the / key (but not while typing in a field)", async () => {
    render(
      <>
        <input aria-label="field" />
        <CommandPalette />
      </>,
    );
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    screen.getByLabelText("field").focus();
    fireEvent.keyDown(screen.getByLabelText("field"), { key: "/" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(window, { key: "/" });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("searches, ranks, and navigates to the selected tool", async () => {
    const dialog = await open();
    await userEvent.type(within(dialog).getByRole("combobox"), "merge pdf");
    const options = await within(dialog).findAllByRole("option");
    expect(options[0]).toHaveTextContent("Merge PDF");
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith("/tools/merge-pdf");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("matches categories and pages, and offers to request a missing tool", async () => {
    const dialog = await open();
    const input = within(dialog).getByRole("combobox");
    await userEvent.type(input, "privacy");
    expect(await within(dialog).findByText("How privacy works")).toBeInTheDocument();
    await userEvent.clear(input);
    await userEvent.type(input, "zzzzqqq");
    await userEvent.click(await within(dialog).findByRole("button", { name: "Request it" }));
    expect(push).toHaveBeenCalledWith("/requests");
  });

  it("surfaces favorites and recently used tools", async () => {
    act(() => {
      toggleFavorite("qr-code-generator");
      pushRecent("word-counter");
    });
    const dialog = await open();
    expect(within(dialog).getByText("Favorites")).toBeInTheDocument();
    // It appears under Favorites and again under Popular.
    expect(within(dialog).getAllByText("QR Code Generator")).toHaveLength(2);
    expect(within(dialog).getByText("Recent")).toBeInTheDocument();
    expect(within(dialog).getByText("Word & Character Counter")).toBeInTheDocument();
  });
});

describe("ThemeToggle", () => {
  it("starts on light paper and cycles light → dark → system, applying the class and remembering the choice", async () => {
    render(<ThemeToggle />);
    const button = () => screen.getByRole("button", { name: /theme/i });
    await waitFor(() => expect(button()).toHaveAccessibleName(/^Light theme/));
    expect(document.documentElement).not.toHaveClass("dark");
    await userEvent.click(button());
    expect(button()).toHaveAccessibleName(/^Dark theme/);
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("dark");
    await userEvent.click(button());
    expect(button()).toHaveAccessibleName(/^Match system theme/);
    expect(window.localStorage.getItem(THEME_KEY)).toBe("system");
    await userEvent.click(button());
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
  });

  it("restores a saved theme on mount", async () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    render(<ThemeToggle />);
    await waitFor(() => expect(screen.getByRole("button")).toHaveAccessibleName(/^Dark theme/));
  });

  it("applyTheme respects the OS preference in system mode", () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes("dark"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    applyTheme("system");
    expect(document.documentElement).toHaveClass("dark");
    applyTheme("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("first-time visitors get light paper even when the OS prefers dark", () => {
    window.matchMedia = ((query: string) => ({ matches: query.includes("dark"), media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    document.documentElement.classList.add("dark");
    new Function(THEME_INIT_SCRIPT)(); // no saved choice
    expect(document.documentElement).not.toHaveClass("dark");
    window.localStorage.setItem(THEME_KEY, "system");
    new Function(THEME_INIT_SCRIPT)(); // explicit "match system" follows the OS
    expect(document.documentElement).toHaveClass("dark");
  });

  it("the pre-paint script is valid JavaScript that sets the class", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).toHaveClass("dark");
    window.localStorage.setItem(THEME_KEY, "light");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("Ledger", () => {
  const sample = ["merge-pdf", "json-formatter", "qr-code-generator"].map((slug) => getTool(slug)!);

  it("renders an ordered list with one link per tool, numbered 01, 02…", () => {
    render(<Ledger tools={sample} />);
    expect(screen.getByRole("list")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByRole("link", { name: "Merge PDF" })).toHaveAttribute("href", "/tools/merge-pdf");
    expect(within(items[0]!).getByText("01")).toBeInTheDocument();
    expect(within(items[2]!).getByText("03")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("can show catalogue numbers instead of row numbers", () => {
    render(<Ledger tools={[getTool("hash-generator")!]} sequential={false} />);
    expect(screen.getByText(catalogueNumber("hash-generator"))).toBeInTheDocument();
    expect(catalogueNumber("hash-generator")).toMatch(/^\d{3}$/);
  });

  it("shows the category by default and can hide it", () => {
    const { rerender } = render(<Ledger tools={[getTool("merge-pdf")!]} />);
    expect(screen.getByText("PDF")).toBeInTheDocument();
    rerender(<Ledger tools={[getTool("merge-pdf")!]} showCategory={false} />);
    expect(screen.queryByText("PDF")).not.toBeInTheDocument();
  });

  it("gives every row a favorite button that is separate from the row link", async () => {
    render(<Ledger tools={sample} />);
    const star = screen.getByRole("button", { name: "Add Merge PDF to favorites" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(star);
    expect(screen.getByRole("button", { name: "Remove Merge PDF from favorites" })).toHaveAttribute("aria-pressed", "true");
  });

  it("draws a glyph for featured tools and falls back to the icon for others (decorative, hidden from assistive tech)", () => {
    const { container } = render(<Ledger tools={[getTool("merge-pdf")!, getTool("chmod-calculator")!]} glyphs />);
    const glyphs = container.querySelectorAll('span[aria-hidden="true"] svg');
    expect(glyphs.length).toBeGreaterThanOrEqual(2);
  });
});

describe("JsonLd", () => {
  it("escapes < so data cannot break out of the script tag", () => {
    const { container } = render(<JsonLd data={{ name: "</script><script>alert(1)</script>" }} />);
    const script = container.querySelector('script[type="application/ld+json"]')!;
    expect(script.innerHTML).not.toContain("</script>");
    expect(JSON.parse(script.textContent!)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
