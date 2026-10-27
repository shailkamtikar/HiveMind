"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const read = (): Theme => {
  const set = document.documentElement.dataset.theme;
  if (set === "light" || set === "dark") return set;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

function subscribe(callback: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const mo = new MutationObserver(callback);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  mq.addEventListener("change", callback);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", callback);
  };
}

/** Light/dark pill. The choice is remembered on this device; with no choice the system setting applies. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="pill"
      aria-label={`Switch to ${next} mode`}
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem("hm-theme", next);
        } catch {
          // Private mode: the choice just lasts until the page is closed.
        }
      }}
    >
      <span aria-hidden="true" className="inline-block size-2.5 rounded-full border border-current" style={{ background: theme === "dark" ? "currentColor" : "transparent" }} />
      <span suppressHydrationWarning>{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
