"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

interface Props {
  value: number;
  duration?: number;
  formatter?: (v: number) => string;
  decimals?: number;
  glow?: boolean;
  pulse?: boolean;
  prefix?: string;
  suffix?: string;
}

function easeOutExpo(x: number) {
  return x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
}

export function AnimatedCounter({
  value,
  duration = 1200,
  formatter,
  decimals = 0,
  glow = true,
  pulse = true,
  prefix = "",
  suffix = "",
}: Props) {

  const [display, setDisplay] =
    useState(value);

  const [isAnimating, setIsAnimating] =
    useState(false);

  const [prefersReduced, setPrefersReduced] =
    useState(false);

  const prevRef = useRef(value);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number | null>(null);

  /* CHECK MOTION PREFERENCES */
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    setPrefersReduced(prefersReducedMotion);
  }, []);

  /* ANIMATION */
  useEffect(() => {

    const from = prevRef.current;
    const to = value;

    if (from === to) {
      return;
    }

    /* INSTANT UPDATE IF MOTION REDUCED */
    if (prefersReduced) {
      setDisplay(to);
      prevRef.current = to;
      return;
    }

    setIsAnimating(true);

    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    startTsRef.current = null;

    const step = (ts: number) => {

      if (!startTsRef.current) {
        startTsRef.current = ts;
      }

      const elapsed =
        ts - startTsRef.current;

      const progress =
        Math.min(elapsed / duration, 1);

      const eased = easeOutExpo(progress);

      const current =
        from + (to - from) * eased;

      const rounded = Number(
        current.toFixed(decimals),
      );

      setDisplay(rounded);

      if (progress < 1) {

        rafRef.current =
          requestAnimationFrame(step);

      } else {

        setDisplay(to);
        prevRef.current = to;
        setIsAnimating(false);
      }
    };

    rafRef.current =
      requestAnimationFrame(step);

    return () => {

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };

  }, [
    value,
    duration,
    decimals,
    prefersReduced,
  ]);

  /* FORMAT */
  const formatted = formatter
    ? formatter(display)
    : display.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  /* RENDER */
  return (
    <span
      className={`
        relative
        inline-flex
        items-center
        transition-all
        duration-500
        ${glow ? "text-shadow-cyan" : ""}
        ${
          pulse && isAnimating && !prefersReduced
            ? "animate-counterPulse"
            : ""
        }
      `}
    >

      {/* GLOW LAYER */}
      {glow && !prefersReduced && (
        <span
          className="
            pointer-events-none
            absolute
            inset-0
            blur-lg
            opacity-30
          "
          aria-hidden="true"
        >
          {prefix}
          {formatted}
          {suffix}
        </span>
      )}

      {/* MAIN VALUE */}
      <span
        className="
          relative
          z-10
          font-semibold
          tracking-tight
        "
      >
        {prefix}
        {formatted}
        {suffix}
      </span>

      {/* PULSE DOT */}
      {isAnimating &&
        !prefersReduced && (
          <span
            className="
              ml-2
              inline-block
              h-1.5
              w-1.5
              rounded-full
              bg-grid-gold
              animate-pulse
            "
          />
        )}

    </span>
  );
}