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
import { ToolCard, ToolGrid } from "../src/components/tool-card";
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
  it("cycles system → light → dark, applies the class and remembers the choice", async () => {
    render(<ThemeToggle />);
    const button = () => screen.getByRole("button", { name: /theme/i });
    await waitFor(() => expect(button()).toHaveAccessibleName(/Match system theme/));
    await userEvent.click(button());
    expect(button()).toHaveAccessibleName(/^Light theme/);
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("light");
    await userEvent.click(button());
    expect(button()).toHaveAccessibleName(/^Dark theme/);
    expect(document.documentElement).toHaveClass("dark");
    await userEvent.click(button());
    expect(window.localStorage.getItem(THEME_KEY)).toBe("system");
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

  it("the pre-paint script is valid JavaScript that sets the class", () => {
    window.localStorage.setItem(THEME_KEY, "dark");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).toHaveClass("dark");
    window.localStorage.setItem(THEME_KEY, "light");
    new Function(THEME_INIT_SCRIPT)();
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("ToolCard", () => {
  const tool = getTool("merge-pdf")!;

  it("is one link to the tool, with the category and a favorite button", () => {
    render(<ToolCard tool={tool} />);
    const link = screen.getByRole("link", { name: "Merge PDF" });
    expect(link).toHaveAttribute("href", "/tools/merge-pdf");
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText(tool.tagline)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Merge PDF to favorites" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("can hide the category badge", () => {
    render(<ToolCard tool={tool} showCategory={false} />);
    expect(screen.queryByText("PDF")).not.toBeInTheDocument();
  });

  it("ToolGrid renders every tool it is given", () => {
    render(<ToolGrid tools={tools.slice(0, 5)} />);
    expect(screen.getAllByRole("article")).toHaveLength(5);
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
