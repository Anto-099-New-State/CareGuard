"use client";

import { useEffect } from "react";

/** Fades `.reveal` sections in as they scroll into view. Without JS (or with reduced motion) they're simply visible. */
export function Reveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".reveal").forEach((el) => {
      // Anything already on screen shows at once; only what's below the fold animates.
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add("in");
      io.observe(el);
    });
    root.classList.add("reveal-ready");
    return () => io.disconnect();
  }, []);
  return null;
}
