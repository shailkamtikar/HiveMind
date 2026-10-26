"use client";

import { useEffect } from "react";

/**
 * Smooth scrolling (Lenis) and entrance/scroll animation (GSAP) for the marketing pages only.
 * Both libraries are imported on demand from here, so they are never part of the chat pages' JavaScript.
 * Does nothing at all when the visitor prefers reduced motion: content stays visible and scrolling is native.
 *
 * Markup contract:
 *   [data-hero-word]    headline words that rise in one after another
 *   [data-reveal]       fades up when it scrolls into view (hidden by CSS until this runs)
 *   [data-preview-msg]  messages of the product preview that appear in sequence
 */
export function LandingMotion() {
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return;

    let cancelled = false;
    let cleanup = () => {};

    (async () => {
      const [{ gsap }, { ScrollTrigger }, { default: Lenis }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
        import("lenis"),
      ]);
      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);
      document.documentElement.classList.add("motion-ready");

      const lenis = new Lenis({ lerp: 0.12, wheelMultiplier: 0.9 });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (time: number) => lenis.raf(time * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      const ctx = gsap.context(() => {
        gsap.from("[data-hero-word]", {
          yPercent: 110,
          opacity: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.07,
          delay: 0.1,
        });
        gsap.from("[data-preview-msg]", {
          y: 14,
          opacity: 0,
          duration: 0.5,
          ease: "power2.out",
          stagger: 0.55,
          delay: 0.9,
        });
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
          gsap.to(el, {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 88%", once: true },
          });
        });
      });

      cleanup = () => {
        ctx.revert();
        gsap.ticker.remove(tick);
        lenis.destroy();
        ScrollTrigger.getAll().forEach((t) => t.kill());
        document.documentElement.classList.remove("motion-ready");
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  return null;
}
