"use client";

import { useEffect, useRef, useState } from "react";

interface TerminalTextProps {
  text: string;
  speed?: number;
  delay?: number;
  cursor?: boolean;
  className?: string;
}

export function TerminalText({
  text,
  speed = 38,
  delay = 400,
  cursor = true,
  className = "",
}: TerminalTextProps) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone]           = useState(false);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDisplayed("");
    setDone(false);

    startRef.current = setTimeout(() => {
      let i = 0;
      timerRef.current = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          if (timerRef.current) clearInterval(timerRef.current);
          setDone(true);
        }
      }, 1000 / speed);
    }, delay);

    return () => {
      if (startRef.current) clearTimeout(startRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [text, speed, delay]);

  return (
    <span className={className}>
      {displayed}
      {cursor && (
        <span
          className={[
            "ml-px inline-block h-[0.85em] w-0.5 translate-y-[0.06em] align-middle bg-grid-cyan",
            done ? "animate-terminal-blink" : "opacity-100",
          ].join(" ")}
        />
      )}
    </span>
  );
}