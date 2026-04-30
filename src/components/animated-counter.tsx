"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number;
  formatter?: (value: number) => string;
  durationMs?: number;
}

export function AnimatedCounter({
  value,
  formatter = (next) => Math.round(next).toLocaleString("en-IN"),
  durationMs = 900
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const previousValue = previousValueRef.current;
    const difference = value - previousValue;
    const start = performance.now();
    let frameId = 0;

    function updateFrame(now: number) {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(previousValue + difference * eased);

      if (progress < 1) {
        frameId = requestAnimationFrame(updateFrame);
      }
    }

    frameId = requestAnimationFrame(updateFrame);
    previousValueRef.current = value;

    return () => cancelAnimationFrame(frameId);
  }, [durationMs, value]);

  return <>{formatter(displayValue)}</>;
}
