"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  value:      number;
  duration?:  number;
  formatter?: (v: number) => string;
}

export function AnimatedCounter({ value, duration = 1100, formatter }: Props) {
  const [display, setDisplay] = useState(value);
  const prevRef    = useRef(value);
  const rafRef     = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);

  useEffect(() => {
    const from = prevRef.current;
    const to   = value;
    if (from === to) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTsRef.current = null;

    const step = (ts: number) => {
      if (!startTsRef.current) startTsRef.current = ts;
      const elapsed  = ts - startTsRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        prevRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <>{formatter ? formatter(display) : display.toLocaleString("en-IN")}</>;
}