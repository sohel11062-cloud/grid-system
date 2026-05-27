"use client";

import {
  AnimatePresence,
  motion,
} from "framer-motion";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

const LINES = [
  "INITIALIZING GRID KERNEL v3.7.9...",
  "LOADING QUANTUM LOYALTY MATRIX...",
  "CONNECTING TO NEURAL REWARD ENGINE...",
  "VERIFYING MEMBER IDENTITY NODES...",
  "CALIBRATING CREDIT PROTOCOLS...",
  "LINKING CYBERNETIC LEDGER...",
  "SCANNING GLOBAL RANK NETWORK...",
  "STABILIZING REALITY INTERFACE...",
  "THE GRID SYSTEM: ONLINE.",
];

interface Props {
  onComplete: () => void;
}

export function BootSequence({
  onComplete,
}: Props) {

  const [
    lines,
    setLines,
  ] = useState<string[]>([]);

  const [
    progress,
    setProgress,
  ] = useState(0);

  const [
    exiting,
    setExiting,
  ] = useState(false);

  const [
    phase,
    setPhase,
  ] = useState<
    "BOOT" |
    "SYNC" |
    "ONLINE"
  >("BOOT");

  // ───────────────────────────────────────────────────────────────────────────
  // RANDOM SYSTEM VALUES
  // ───────────────────────────────────────────────────────────────────────────

  const metrics =
    useMemo(
      () => ({
        latency:
          (
            Math.random() * 8 +
            12
          ).toFixed(1),

        nodes:
          (
            Math.random() * 900 +
            1200
          ).toFixed(0),

        packets:
          (
            Math.random() * 9000 +
            22000
          ).toFixed(0),
      }),
      [],
    );

  // ───────────────────────────────────────────────────────────────────────────
  // BOOT FLOW
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {

    let idx = 0;

    let exitTid:
      | ReturnType<
          typeof setTimeout
        >
      | undefined;

    let completeTid:
      | ReturnType<
          typeof setTimeout
        >
      | undefined;

    const INTERVAL = 520;

    const id =
      setInterval(() => {

        if (
          idx <
          LINES.length
        ) {

          setLines(
            (prev) => [
              ...prev,
              LINES[idx],
            ],
          );

          const pct =
            Math.round(
              ((idx + 1) /
                LINES.length) *
                100,
            );

          setProgress(pct);

          // PHASES

          if (
            pct > 30 &&
            pct < 85
          ) {
            setPhase("SYNC");
          }

          if (
            pct >= 100
          ) {
            setPhase(
              "ONLINE",
            );
          }

          idx++;

        } else {

          clearInterval(id);

          exitTid =
            setTimeout(
              () => {

                setExiting(
                  true,
                );

                completeTid =
                  setTimeout(
                    onComplete,
                    700,
                  );
              },
              1200,
            );
        }

      }, INTERVAL);

    return () => {

      clearInterval(id);

      if (
        exitTid
      ) {
        clearTimeout(
          exitTid,
        );
      }

      if (
        completeTid
      ) {
        clearTimeout(
          completeTid,
        );
      }
    };

  }, [onComplete]);

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>

      {!exiting && (

        <motion.div
          className="
            fixed
            inset-0
            z-[999]
            overflow-hidden
            bg-[#02030a]
          "
          initial={{
            opacity: 1,
          }}
          exit={{
            opacity: 0,
            scale: 1.03,
            filter:
              "blur(10px)",
            transition: {
              duration: 0.7,
              ease: [
                0.22,
                1,
                0.36,
                1,
              ],
            },
          }}
        >

          {/* BACKGROUND */}

          <div className="absolute inset-0">

            {/* GRADIENT */}

            <div
              className="
                absolute
                inset-0
                opacity-90
              "
              style={{
                background:
                  `
                  radial-gradient(circle at 20% 20%, rgba(77,247,255,0.12), transparent 30%),
                  radial-gradient(circle at 80% 30%, rgba(167,139,250,0.12), transparent 35%),
                  radial-gradient(circle at 50% 80%, rgba(232,121,249,0.10), transparent 40%),
                  linear-gradient(180deg, #02030a 0%, #050816 100%)
                  `,
              }}
            />

            {/* GRID */}

            <div
              className="
                absolute
                inset-0
                opacity-[0.05]
                animate-gridDrift
              "
              style={{
                backgroundImage:
                  `
                  linear-gradient(rgba(77,247,255,0.22) 1px, transparent 1px),
                  linear-gradient(90deg, rgba(77,247,255,0.22) 1px, transparent 1px)
                  `,
                backgroundSize:
                  "100px 100px",
              }}
            />

            {/* SCANLINES */}

            <div
              className="
                absolute
                inset-0
                opacity-[0.04]
              "
              style={{
                background:
                  `
                  repeating-linear-gradient(
                    to bottom,
                    transparent 0px,
                    rgba(255,255,255,0.05) 1px,
                    transparent 2px
                  )
                  `,
              }}
            />

            {/* VIGNETTE */}

            <div
              className="
                absolute
                inset-0
              "
              style={{
                background:
                  `
                  radial-gradient(
                    circle at center,
                    transparent 40%,
                    rgba(0,0,0,0.72) 100%
                  )
                  `,
              }}
            />

          </div>

          {/* SCAN LINE */}

          <div
            className="
              boot-scan-line
            "
            aria-hidden
          />

          {/* CONTENT */}

          <div
            className="
              relative
              z-10
              flex
              min-h-screen
              items-center
              justify-center
              px-6
            "
          >

            <div
              className="
                w-full
                max-w-3xl
              "
            >

              {/* HEADER */}

              <motion.div
                initial={{
                  opacity: 0,
                  y: 18,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: 0.8,
                }}
              >

                <p
                  className="
                    panel-title
                    mb-4
                  "
                >
                  THE VIBE CANVAS —
                  CYBERNETIC REWARD OS
                </p>

                <h1
                  className="
                    glitch-text
                    text-5xl
                    font-black
                    uppercase
                    tracking-[0.22em]
                    text-white
                    sm:text-6xl
                    md:text-7xl
                  "
                  data-text="THE GRID"
                >
                  THE GRID
                </h1>

                <p
                  className="
                    mt-4
                    max-w-2xl
                    text-xs
                    uppercase
                    tracking-[0.34em]
                    text-grid-cyan/80
                  "
                >
                  REALITY INTERFACE ·
                  LOYALTY MATRIX ·
                  NEXT-GEN COMMERCE ENGINE
                </p>

              </motion.div>

              {/* TERMINAL */}

              <motion.div
                className="
                  panel-shell
                  mt-10
                  overflow-hidden
                  border
                  border-white/10
                  bg-black/30
                  p-6
                  backdrop-blur-2xl
                "
                initial={{
                  opacity: 0,
                  y: 30,
                }}
                animate={{
                  opacity: 1,
                  y: 0,
                }}
                transition={{
                  duration: 0.9,
                  delay: 0.1,
                }}
              >

                {/* TOP BAR */}

                <div
                  className="
                    mb-6
                    flex
                    items-center
                    justify-between
                    gap-4
                    border-b
                    border-white/10
                    pb-4
                  "
                >

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                    "
                  >

                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />

                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />

                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />

                  </div>

                  <div
                    className="
                      text-[10px]
                      uppercase
                      tracking-[0.32em]
                      text-grid-muted
                    "
                  >
                    Secure Neural Shell
                  </div>

                </div>

                {/* TERMINAL OUTPUT */}

                <div
                  className="
                    min-h-[260px]
                    space-y-2
                    font-mono
                    text-[12px]
                    leading-7
                  "
                >

                  {lines.map(
                    (
                      line,
                      i,
                    ) => (

                      <motion.div
                        key={i}
                        initial={{
                          opacity: 0,
                          x: -10,
                        }}
                        animate={{
                          opacity: 1,
                          x: 0,
                        }}
                        transition={{
                          duration: 0.22,
                        }}
                        className={`
                          flex
                          items-start
                          gap-3
                          ${
                            i ===
                            lines.length -
                              1
                              ? "text-grid-cyan"
                              : "text-grid-muted/70"
                          }
                        `}
                      >

                        <span className="text-grid-cyan/50">
                          ›
                        </span>

                        <span>
                          {line}
                        </span>

                      </motion.div>
                    ),
                  )}

                  {/* LIVE CURSOR */}

                  {!exiting && (

                    <motion.div
                      animate={{
                        opacity: [
                          1,
                          0,
                          1,
                        ],
                      }}
                      transition={{
                        repeat:
                          Infinity,
                        duration:
                          1,
                      }}
                      className="
                        ml-5
                        h-[14px]
                        w-[8px]
                        bg-grid-cyan
                      "
                    />
                  )}

                </div>

                {/* PROGRESS */}

                <div className="mt-8">

                  <div
                    className="
                      mb-3
                      flex
                      items-center
                      justify-between
                    "
                  >

                    <p
                      className="
                        text-[10px]
                        uppercase
                        tracking-[0.3em]
                        text-grid-muted
                      "
                    >
                      SYSTEM BOOT
                    </p>

                    <p
                      className="
                        text-[10px]
                        uppercase
                        tracking-[0.3em]
                        text-grid-cyan
                      "
                    >
                      {progress}%
                    </p>

                  </div>

                  <div className="progress-track h-2.5">

                    <motion.div
                      className="
                        progress-fill
                      "
                      initial={{
                        width: 0,
                      }}
                      animate={{
                        width: `${progress}%`,
                      }}
                      transition={{
                        duration: 0.35,
                        ease:
                          "easeOut",
                      }}
                    >

                      {progress >
                        3 && (
                        <span className="progress-orb" />
                      )}

                    </motion.div>

                  </div>

                </div>

                {/* STATUS */}

                <div
                  className="
                    mt-8
                    grid
                    gap-4
                    border-t
                    border-white/10
                    pt-6
                    sm:grid-cols-3
                  "
                >

                  <div>

                    <p className="panel-title">
                      LATENCY
                    </p>

                    <p
                      className="
                        mt-2
                        text-lg
                        font-semibold
                        text-white
                      "
                    >
                      {
                        metrics.latency
                      }
                      ms
                    </p>

                  </div>

                  <div>

                    <p className="panel-title">
                      NODES
                    </p>

                    <p
                      className="
                        mt-2
                        text-lg
                        font-semibold
                        text-white
                      "
                    >
                      {
                        metrics.nodes
                      }
                    </p>

                  </div>

                  <div>

                    <p className="panel-title">
                      PACKETS
                    </p>

                    <p
                      className="
                        mt-2
                        text-lg
                        font-semibold
                        text-white
                      "
                    >
                      {
                        metrics.packets
                      }
                    </p>

                  </div>

                </div>

              </motion.div>

              {/* PHASE */}

              <motion.div
                className="
                  mt-6
                  flex
                  items-center
                  justify-between
                  gap-4
                  text-[10px]
                  uppercase
                  tracking-[0.34em]
                "
                initial={{
                  opacity: 0,
                }}
                animate={{
                  opacity: 1,
                }}
                transition={{
                  delay: 0.4,
                }}
              >

                <div
                  className="
                    flex
                    items-center
                    gap-3
                  "
                >

                  <span
                    className={`
                      h-2
                      w-2
                      rounded-full
                      ${
                        phase ===
                        "ONLINE"
                          ? "bg-emerald-400"
                          : phase ===
                            "SYNC"
                          ? "bg-amber-400"
                          : "bg-cyan-400"
                      }
                    `}
                  />

                  <span className="text-grid-muted">
                    {phase}
                  </span>

                </div>

                <span className="text-grid-muted">
                  CYBERNETIC REWARD OS
                </span>

              </motion.div>

            </div>

          </div>

        </motion.div>
      )}

    </AnimatePresence>
  );
}