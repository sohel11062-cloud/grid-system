"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";

import {
  type ReactNode,
  useRef,
} from "react";

interface Props {
  children: ReactNode;
  intensity?: number;
  className?: string;
}

export function TiltCard({
  children,
  intensity = 10,
  className = "",
}: Props) {

  const ref =
    useRef<HTMLDivElement>(null);

  /* ─────────────────────────────────────────────
     ROTATION
  ───────────────────────────────────────────── */

  const rawX =
    useMotionValue(0);

  const rawY =
    useMotionValue(0);

  const rotateX =
    useSpring(rawX, {
      stiffness: 180,
      damping: 20,
      mass: 0.8,
    });

  const rotateY =
    useSpring(rawY, {
      stiffness: 180,
      damping: 20,
      mass: 0.8,
    });

  /* ─────────────────────────────────────────────
     CURSOR POSITION
  ───────────────────────────────────────────── */

  const mouseX =
    useMotionValue(50);

  const mouseY =
    useMotionValue(50);

  /* ─────────────────────────────────────────────
     DYNAMIC SPOTLIGHT
  ───────────────────────────────────────────── */

  const spotlight =
    useMotionTemplate`
      radial-gradient(
        500px circle at ${mouseX}% ${mouseY}%,
        rgba(77,247,255,0.16),
        rgba(139,92,246,0.10) 25%,
        transparent 65%
      )
    `;

  /* ─────────────────────────────────────────────
     DYNAMIC BORDER
  ───────────────────────────────────────────── */

  const borderGlow =
    useMotionTemplate`
      radial-gradient(
        280px circle at ${mouseX}% ${mouseY}%,
        rgba(77,247,255,0.38),
        transparent 70%
      )
    `;

  /* ─────────────────────────────────────────────
     MOUSE MOVE
  ───────────────────────────────────────────── */

  function onMove(
    e: React.MouseEvent<HTMLDivElement>,
  ) {
    const rect =
      ref.current?.getBoundingClientRect();

    if (!rect) return;

    const px =
      (e.clientX - rect.left) /
      rect.width;

    const py =
      (e.clientY - rect.top) /
      rect.height;

    rawY.set(
      (px - 0.5) *
        intensity *
        1.6,
    );

    rawX.set(
      (py - 0.5) *
        -intensity *
        1.6,
    );

    mouseX.set(px * 100);
    mouseY.set(py * 100);
  }

  /* ─────────────────────────────────────────────
     RESET
  ───────────────────────────────────────────── */

  function onLeave() {
    rawX.set(0);
    rawY.set(0);

    mouseX.set(50);
    mouseY.set(50);
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`
        group
        relative
        will-change-transform
        transform-gpu
        ${className}
      `}
      style={{
        rotateX,
        rotateY,

        transformStyle:
          "preserve-3d",

        perspective:
          2200,
      }}
      whileHover={{
        y: -6,
        scale: 1.01,
      }}
      transition={{
        type: "spring",
        stiffness: 180,
        damping: 18,
      }}
    >

      {/* ─────────────────────────────────────
         MAIN PANEL
      ───────────────────────────────────── */}

      <div
        className="
          panel-shell
          relative
          overflow-hidden
          rounded-[32px]
        "
      >

        {/* ─────────────────────────────────
           GALAXY AURORA
        ───────────────────────────────── */}

        <motion.div
          className="
            pointer-events-none
            absolute
            inset-[-20%]
            opacity-40
            mix-blend-screen
          "
          animate={{
            rotate: 360,
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear",
          }}
          style={{
            background:
              `
              conic-gradient(
                from 180deg,
                transparent,
                rgba(77,247,255,0.12),
                transparent,
                rgba(167,139,250,0.10),
                transparent,
                rgba(255,79,216,0.10),
                transparent
              )
              `,
          }}
        />

        {/* ─────────────────────────────────
           SPOTLIGHT
        ───────────────────────────────── */}

        <motion.div
          className="
            pointer-events-none
            absolute
            inset-0
            z-[2]
            opacity-0
            transition-opacity
            duration-300
            group-hover:opacity-100
          "
          style={{
            background: spotlight,
          }}
        />

        {/* ─────────────────────────────────
           BORDER GLOW
        ───────────────────────────────── */}

        <motion.div
          className="
            pointer-events-none
            absolute
            inset-0
            rounded-[32px]
            opacity-0
            transition-opacity
            duration-300
            group-hover:opacity-100
          "
          style={{
            background: borderGlow,
          }}
        />

        {/* ─────────────────────────────────
           GLASS REFLECTION
        ───────────────────────────────── */}

        <motion.div
          className="
            pointer-events-none
            absolute
            inset-0
            z-[3]
            opacity-40
          "
          style={{
            background:
              `
              linear-gradient(
                120deg,
                rgba(255,255,255,0.12),
                transparent 30%,
                transparent 70%,
                rgba(255,255,255,0.04)
              )
              `,
          }}
        />

        {/* ─────────────────────────────────
           INNER EDGE LIGHT
        ───────────────────────────────── */}

        <div
          className="
            pointer-events-none
            absolute
            inset-0
            rounded-[32px]
            border
            border-white/[0.06]
            shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]
          "
        />

        {/* ─────────────────────────────────
           FLOATING PARTICLES
        ───────────────────────────────── */}

        <div className="pointer-events-none absolute inset-0 overflow-hidden">

          <div className="particle particle-sm left-[10%] top-[20%] animate-starDrift" />

          <div className="particle left-[80%] top-[70%] animate-starDrift" />

          <div className="particle particle-lg left-[60%] top-[10%] animate-starDrift" />

        </div>

        {/* ─────────────────────────────────
           CONTENT
        ───────────────────────────────── */}

        <div
          className="
            relative
            z-[5]
            h-full
          "
          style={{
            transform:
              "translateZ(40px)",
          }}
        >
          {children}
        </div>
      </div>
    </motion.div>
  );
}