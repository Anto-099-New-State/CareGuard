"use client";

import { useEffect, useState } from "react";

/** Eases a number from 0 to `to` once on mount, shown as prefix + en-US digits + suffix. Respects reduced motion. */
export function CountUp({ to, prefix = "", suffix = "", delay = 500, duration = 1600 }: { to: number; prefix?: string; suffix?: string; delay?: number; duration?: number }) {
  const [value, setValue] = useState(to);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      const p = Math.min(Math.max((now - start) / duration, 0), 1);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, delay, duration]);

  return <>{prefix}{value.toLocaleString("en-US")}{suffix}</>;
}
