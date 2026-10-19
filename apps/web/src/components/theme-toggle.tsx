"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@toolwright/ui";

export type Theme = "light" | "dark" | "system";
export const THEME_KEY = "tw-theme";
/** First-time visitors get the signature light paper look; dark and "match my system" are one click away. */
export const DEFAULT_THEME: Theme = "light";

/** Runs before first paint (see layout.tsx) so there is no flash of the wrong theme. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}")||"${DEFAULT_THEME}";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export function applyTheme(theme: Theme): void {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const ORDER: Theme[] = ["light", "dark", "system"];
const LABELS: Record<Theme, string> = { light: "Light theme", dark: "Dark theme", system: "Match system theme" };
const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "light" || saved === "dark" || saved === "system") setTheme(saved);
    } catch {
      /* storage unavailable */
    }
    setMounted(true);
  }, []);

  // Follow the OS while in "system" mode.
  useEffect(() => {
    if (theme !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [theme]);

  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length] as Theme;
  const Icon = ICONS[theme];

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={mounted ? `${LABELS[theme]}. Switch to ${LABELS[next].toLowerCase()}` : "Change theme"}
      title={mounted ? LABELS[theme] : "Theme"}
      onClick={() => {
        setTheme(next);
        applyTheme(next);
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          /* ignore */
        }
      }}
    >
      <Icon aria-hidden />
    </Button>
  );
}
