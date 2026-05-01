"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  formatter?: (v: number) => string;
  durationMs?: number;
}

export function AnimatedCounter({
  value,
  formatter = (v) => Math.round(v).toLocaleString("en-IN"),
  durationMs = 900,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const rafRef  = useRef(0);

  useEffect(() => {
    const from = prevRef.current;
    const diff = value - from;
    const start = performance.now();

    cancelAnimationFrame(rafRef.current);

    function tick(now: number) {
      const p = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + diff * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    prevRef.current = value;

    return () => cancelAnimationFrame(rafRef.current);
  }, [value, durationMs]);

  return <>{formatter(display)}</>;
}