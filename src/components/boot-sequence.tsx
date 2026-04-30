"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const MESSAGES = [
  { text: "[SYS]  Initializing neural core...",         delay: 0 },
  { text: "[NET]  Wix Headless handshake complete.",    delay: 520 },
  { text: "[DB]   Loading MongoDB loyalty ledger...",   delay: 980 },
  { text: "[AUTH] Verifying encrypted session...",      delay: 1380 },
  { text: "[CRED] Cred engine calibrated.",             delay: 1750 },
  { text: "[UI]   Rendering holographic interface...", delay: 2080 },
  { text: "[GRID] ALL SYSTEMS ONLINE.",                 delay: 2450 },
];

interface BootSequenceProps {
  onComplete: () => void;
}

export function BootSequence({ onComplete }: BootSequenceProps) {
  const [visibleMessages, setVisibleMessages] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting] = useState(false);

  const triggerExit = useCallback(() => {
    setExiting(true);
    const t = setTimeout(onComplete, 700);
    return () => clearTimeout(t);
  }, [onComplete]);

  // Reveal messages sequentially
  useEffect(() => {
    const timers = MESSAGES.map(({ text, delay }) =>
      setTimeout(() => setVisibleMessages((p) => [...p, text]), delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Progress bar
  useEffect(() => {
    let p = 0;
    const tick = setInterval(() => {
      p = Math.min(p + Math.random() * 14 + 4, 100);
      setProgress(Math.round(p));
      if (p >= 100) clearInterval(tick);
    }, 110);
    return () => clearInterval(tick);
  }, []);

  // Auto-exit after all messages shown
  useEffect(() => {
    const t = setTimeout(triggerExit, 3100);
    return () => clearTimeout(t);
  }, [triggerExit]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-[#000308] overflow-hidden"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.015 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Moving scan line */}
          <div className="boot-scan-line" />

          {/* Scanlines overlay */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(77,247,255,0.025)_1px,transparent_1px)] bg-[size:100%_4px]" />

          {/* Corner decorations */}
          <div className="corner-tl" />
          <div className="corner-tr" />
          <div className="corner-bl" />
          <div className="corner-br" />

          {/* Main content */}
          <div className="relative z-10 w-full max-w-xl px-8">
            <motion.p
              className="mb-2 font-mono text-[10px] uppercase tracking-[0.45em] text-grid-cyan/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
            >
              THE GRID LOYALTY OS — BUILD 1.0.0
            </motion.p>

            {/* Glitch heading */}
            <motion.h1
              className="glitch-text mb-6 text-[clamp(3rem,8vw,6rem)] uppercase leading-none tracking-[0.15em] text-white animation-boot-flicker"
              data-text="THE GRID"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              THE GRID
            </motion.h1>

            {/* Messages */}
            <div className="mb-6 h-40 space-y-1.5 overflow-hidden font-mono text-[11px]">
              {visibleMessages.map((msg, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25 }}
                  className={
                    i === visibleMessages.length - 1
                      ? "text-grid-cyan"
                      : "text-grid-muted/70"
                  }
                >
                  {msg}
                </motion.p>
              ))}

              {/* Blinking cursor on the last active line */}
              <span className="inline-block h-[10px] w-0.5 animate-terminal-blink bg-grid-cyan align-middle" />
            </div>

            {/* Progress bar */}
            <div className="relative h-px w-full overflow-visible bg-white/10">
              <motion.div
                className="absolute left-0 top-0 h-full"
                animate={{ width: `${progress}%` }}
                style={{
                  background: "linear-gradient(90deg, #4df7ff, #2c8bff, #ff4fd8)",
                }}
                transition={{ duration: 0.1 }}
              />
              {/* Leading glow dot */}
              <motion.div
                className="absolute -top-[3px] h-[7px] w-[7px] rounded-full bg-grid-cyan"
                animate={{ left: `${progress}%` }}
                transition={{ duration: 0.1 }}
                style={{ boxShadow: "0 0 10px 3px rgba(77,247,255,0.9)" }}
              />
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <p className="font-mono text-[10px] tracking-widest text-grid-muted/50">
                GRID://BOOT
              </p>
              <p className="font-mono text-[10px] tracking-widest text-grid-cyan/70">
                {progress}%
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
