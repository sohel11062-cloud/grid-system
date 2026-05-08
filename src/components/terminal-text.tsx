"use client";

import { useEffect, useState } from "react";

interface Props {
  text:       string;
  speed?:     number;
  delay?:     number;
  className?: string;
}

export function TerminalText({ text, speed = 38, delay = 0, className = "" }: Props) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone]           = useState(false);

  useEffect(() => {
    setDisplayed("");
    setDone(false);

    const t = setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        i++;
        setDisplayed(text.slice(0, i));
        if (i >= text.length) { clearInterval(id); setDone(true); }
      }, speed);
      return () => clearInterval(id);
    }, delay);

    return () => clearTimeout(t);
  }, [text, speed, delay]);

  return (
    <span className={className}>
      {displayed}
      <span className={`inline-block w-[2px] align-middle bg-current ${done ? "animate-terminalBlink" : ""}`}
        style={{ height: "0.85em", marginLeft: "1px" }} />
    </span>
  );
}
