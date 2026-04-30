"use client";

import { useEffect, useRef, useState } from "react";

interface TerminalTextProps {
  text: string;
  /** Characters per second */
  speed?: number;
  className?: string;
  cursor?: boolean;
  /** Delay before typing starts, ms */
  delay?: number;
}

export function TerminalText({
  text,
  speed = 38,
  className = "",
  cursor = true,
  delay = 400,
}: TerminalTextProps) {
  const [displayed, setDisplayed] = useState("");
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDisplayed("");
    setFinished(false);

    const start = setTimeout(() => {
      let i = 0;
      intervalRef.current = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setFinished(true);
        }
      }, 1000 / speed);
    }, delay);

    return () => {
      clearTimeout(start);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, speed, delay]);

  return (
    <span className={className}>
      {displayed}
      {cursor && (
        <span
          className={[
            "ml-0.5 inline-block h-[0.9em] w-0.5 translate-y-[0.05em] align-middle",
            "bg-grid-cyan",
            finished ? "animate-terminal-blink" : "opacity-100",
          ].join(" ")}
        />
      )}
    </span>
  );
}
