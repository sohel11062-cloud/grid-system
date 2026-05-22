"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const LINES = [
  "INITIALIZING GRID KERNEL v1.0.0...",
  "LOADING NEURAL MESH TOPOLOGY...",
  "CONNECTING TO REWARD ENGINE...",
  "VERIFYING MEMBER IDENTITY NODES...",
  "CALIBRATING CREDIT PROTOCOLS...",
  "GRID SYSTEM: ONLINE.",
];

interface Props { onComplete: () => void; }

export function BootSequence({ onComplete }: Props) {
  const [lines, setLines]       = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [exiting, setExiting]   = useState(false);

  useEffect(() => {
    let idx = 0;
    let exitTid: ReturnType<typeof setTimeout> | undefined;
    let completeTid: ReturnType<typeof setTimeout> | undefined;
    const INTERVAL = 460;

    const id = setInterval(() => {
      if (idx < LINES.length) {
        setLines((p) => [...p, LINES[idx]]);
        setProgress(Math.round(((idx + 1) / LINES.length) * 100));
        idx++;
      } else {
        clearInterval(id);
        exitTid = setTimeout(() => {
          setExiting(true);
          completeTid = setTimeout(onComplete, 420);
        }, 250);
      }
    }, INTERVAL);

    return () => {
      clearInterval(id);
      if (exitTid) clearTimeout(exitTid);
      if (completeTid) clearTimeout(completeTid);
    };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {!exiting && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-grid-bg"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.42 } }}
        >
          <div className="boot-scan-line" aria-hidden />

          <div className="w-full max-w-lg px-8">
            <h1
              className="glitch-text mb-8 text-4xl font-bold uppercase tracking-[0.22em] text-white"
              data-text="THE GRID"
            >
              THE GRID
            </h1>

            <div className="mb-5 min-h-[120px] space-y-1.5 font-mono text-[11px]">
              {lines.map((line, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.18 }}
                  className={
                    i === lines.length - 1
                      ? "text-grid-cyan"
                      : "text-grid-muted/60"
                  }
                >
                  <span className="mr-2 text-grid-cyan/40">›</span>
                  {line}
                </motion.p>
              ))}
            </div>

            <div className="progress-track">
              <motion.div
                className="progress-fill"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.28, ease: "easeOut" }}
              >
                {progress > 2 && <span className="progress-orb" />}
              </motion.div>
            </div>

            <p className="mt-3 text-right font-mono text-[10px] text-grid-muted/50">
              {progress}% — INITIALIZING
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
