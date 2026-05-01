"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const LINES = [
  { text: "[SYS]  Neural core initializing...",          delay: 0 },
  { text: "[NET]  Wix Headless handshake — OK",          delay: 480 },
  { text: "[DB]   MongoDB loyalty ledger mounted.",      delay: 900 },
  { text: "[AUTH] Encrypted session engine ready.",      delay: 1300 },
  { text: "[CRED] Cred + tier engine calibrated.",       delay: 1660 },
  { text: "[UI]   Holographic renderer online.",         delay: 1980 },
  { text: "[GRID] ██████████ ALL SYSTEMS ONLINE.",       delay: 2300 },
];

export function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [lines, setLines]   = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting]   = useState(false);

  const exit = useCallback(() => {
    setExiting(true);
    setTimeout(onComplete, 650);
  }, [onComplete]);

  // Reveal lines
  useEffect(() => {
    const timers = LINES.map(({ text, delay }) =>
      setTimeout(() => setLines((p) => [...p, text]), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Progress bar
  useEffect(() => {
    let v = 0;
    const id = setInterval(() => {
      v = Math.min(v + Math.random() * 12 + 5, 100);
      setProgress(Math.round(v));
      if (v >= 100) clearInterval(id);
    }, 90);
    return () => clearInterval(id);
  }, []);

  // Auto exit
  useEffect(() => {
    const t = setTimeout(exit, 3100);
    return () => clearTimeout(t);
  }, [exit]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          className="fixed inset-0 z-[300] flex flex-col items-center justify-center overflow-hidden bg-[#000307]"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.012 }}
          transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Scan line */}
          <div className="boot-scan-line" />

          {/* Scanlines overlay */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(77,247,255,0.022)_1px,transparent_1px)] bg-[size:100%_4px]" />

          {/* Corner decorations */}
          <div className="corner-tl" /><div className="corner-tr" />
          <div className="corner-bl" /><div className="corner-br" />

          {/* Content */}
          <div className="relative z-10 w-full max-w-lg px-8">
            <motion.p
              className="mb-2 font-mono text-[10px] uppercase tracking-[0.45em] text-grid-cyan/45"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
            >
              THE GRID — LOYALTY OS v1.0.0
            </motion.p>

            {/* Glitch heading */}
            <motion.h1
              className="glitch-text mb-7 text-[clamp(2.8rem,7.5vw,5.5rem)] uppercase leading-none tracking-[0.14em] text-white"
              data-text="THE GRID"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              THE GRID
            </motion.h1>

            {/* Log lines */}
            <div className="mb-6 h-36 space-y-1 overflow-hidden font-mono text-[11px]">
              {lines.map((line, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2 }}
                  className={i === lines.length - 1 ? "text-grid-cyan" : "text-grid-muted/65"}
                >
                  {line}
                </motion.p>
              ))}
              <span className="inline-block h-[10px] w-0.5 animate-terminal-blink bg-grid-cyan align-middle" />
            </div>

            {/* Progress */}
            <div className="relative h-px w-full bg-white/10">
              <motion.div
                className="absolute left-0 top-0 h-full"
                animate={{ width: `${progress}%` }}
                style={{ background: "linear-gradient(90deg,#4df7ff,#2c8bff,#ff4fd8)" }}
                transition={{ duration: 0.08 }}
              />
              <motion.div
                className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-grid-cyan"
                animate={{ left: `${Math.min(progress, 99.5)}%` }}
                transition={{ duration: 0.08 }}
                style={{ boxShadow: "0 0 10px 3px rgba(77,247,255,0.9)" }}
              />
            </div>

            <div className="mt-2 flex justify-between">
              <span className="font-mono text-[10px] tracking-widest text-grid-muted/40">GRID://BOOT</span>
              <span className="font-mono text-[10px] tracking-widest text-grid-cyan/65">{progress}%</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}