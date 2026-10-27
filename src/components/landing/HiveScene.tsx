"use client";

import { useEffect, useRef, useState } from "react";
import type { HiveInfo } from "./hiveEngine";

const IDLE = "FIG. 1 · Four friends and one AI, drawn live. Drag to turn them. Click a cell.";

/**
 * Interactive 3D honeycomb for the landing hero. The three.js scene (`hiveEngine`) is loaded on demand: as soon as the
 * visitor touches the page, or once the page has been idle for a few seconds, so it never competes with the first
 * paint. `fallback` (a flat drawing of the same comb) is what shows until then, and stays when WebGL is unavailable
 * or the visitor prefers reduced motion.
 */
export function HiveScene({ fallback }: { fallback: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<HiveInfo>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let disposed = false;
    let started = false;
    let stop = () => {};
    let timer = 0;
    const triggers = ["pointermove", "pointerdown", "scroll", "keydown", "touchstart"];

    const start = async () => {
      if (started || disposed) return;
      started = true;
      for (const type of triggers) window.removeEventListener(type, start);
      window.removeEventListener("load", arm);
      window.clearTimeout(timer);
      try {
        const { startHive } = await import("./hiveEngine");
        if (disposed) return;
        stop = startHive(el, setInfo);
        setReady(true);
      } catch {
        // No WebGL: the flat drawing stays.
      }
    };
    // Otherwise wait until the page has loaded and gone quiet.
    function arm() {
      timer = window.setTimeout(() => {
        if ("requestIdleCallback" in window) window.requestIdleCallback(() => void start(), { timeout: 2000 });
        else void start();
      }, 3500);
    }

    for (const type of triggers) window.addEventListener(type, start, { passive: true });
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });

    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("load", arm);
      for (const type of triggers) window.removeEventListener(type, start);
      stop();
    };
  }, []);

  return (
    <figure
      className="hive-figure group relative m-0 outline-offset-4"
      tabIndex={0}
      aria-label="Four friends and one AI, drawn as a honeycomb. Use the left and right arrow keys to turn it."
      data-ready={ready}
    >
      <div className="hive-stage relative aspect-[5/4] w-full overflow-hidden border border-border bg-surface-2">
        <div className={`absolute inset-0 transition-opacity duration-700 ${ready ? "opacity-0" : "opacity-100"}`} aria-hidden={ready}>
          {fallback}
        </div>
        <div ref={host} className="absolute inset-0" />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border bg-background/85 px-4 py-3 backdrop-blur-sm"
          aria-live="polite"
          data-testid="hive-info"
        >
          {info ? (
            <p className="flex items-baseline gap-3">
              <span className="font-mono text-[11px] uppercase tracking-wide text-accent-text">{info.label}</span>
              <span className="text-sm leading-snug">{info.text}</span>
            </p>
          ) : (
            <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{IDLE}</p>
          )}
        </div>
      </div>
    </figure>
  );
}
