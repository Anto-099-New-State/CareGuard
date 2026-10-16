"use client";

import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "./icons";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.dataset.theme === "dark");
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    try {
      localStorage.setItem("cg-theme", next ? "dark" : "light");
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="a-icon btn flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink"
    >
      {dark ? <SunIcon key="sun" /> : <MoonIcon key="moon" />}
    </button>
  );
}
