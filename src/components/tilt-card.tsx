"use client";

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

interface Props {
  children: ReactNode;
  intensity?: number;
  className?: string;
}

export function TiltCard({
  children,
  intensity = 6,
  className = "",
}: Props) {

  const ref = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReduced, setPrefersReduced] =
    useState(false);
  const [isEnabled, setIsEnabled] = useState(true);

  /* CHECK DEVICE & PREFERENCES */
  useEffect(() => {
    const isMobileDevice =
      typeof window !== "undefined" &&
      window.innerWidth < 768;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

    setIsMobile(isMobileDevice);
    setPrefersReduced(prefersReducedMotion);
    setIsEnabled(
      !isMobileDevice && !prefersReducedMotion,
    );
  }, []);

  /* ROTATION - ONLY IF ENABLED */
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);

  const rotateX = useSpring(rawX, {
    stiffness: 180,
    damping: 20,
    mass: 0.8,
  });

  const rotateY = useSpring(rawY, {
    stiffness: 180,
    damping: 20,
    mass: 0.8,
  });

  /* CURSOR POSITION */
  const mouseX = useMotionValue(50);
  const mouseY = useMotionValue(50);

  /* SPOTLIGHT GRADIENT */
  const spotlight = useMotionTemplate`
    radial-gradient(
      400px circle at ${mouseX}% ${mouseY}%,
      rgba(201,169,97,0.10),
      rgba(127,107,143,0.05) 25%,
      transparent 60%
    )
  `;

  /* THROTTLE MOUSE MOVEMENT */
  const throttleRef = useRef<NodeJS.Timeout | null>(null);
  const lastUpdateRef = useRef<number>(0);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!isEnabled || !ref.current) return;

    const now = Date.now();

    /* THROTTLE: 16ms = ~60fps */
    if (now - lastUpdateRef.current < 16) {
      return;
    }

    lastUpdateRef.current = now;

    const rect = ref.current.getBoundingClientRect();
    if (!rect) return;

    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    rawY.set((px - 0.5) * intensity * 1.6);
    rawX.set((py - 0.5) * -intensity * 1.6);

    mouseX.set(px * 100);
    mouseY.set(py * 100);
  }

  /* RESET ON LEAVE */
  function onLeave() {
    if (!isEnabled) return;

    if (throttleRef.current) {
      clearTimeout(throttleRef.current);
    }

    /* DEBOUNCE RESET */
    throttleRef.current = setTimeout(() => {
      rawX.set(0);
      rawY.set(0);
      mouseX.set(50);
      mouseY.set(50);
    }, 50);
  }

  /* CLEANUP */
  useEffect(() => {
    return () => {
      if (throttleRef.current) {
        clearTimeout(throttleRef.current);
      }
    };
  }, []);

  return (
    <motion.div
      ref={ref}
      onMouseMove={isEnabled ? onMove : undefined}
      onMouseLeave={isEnabled ? onLeave : undefined}
      className={`
        group
        relative
        will-change-transform
        transform-gpu
        ${className}
      `}
      style={{
        rotateX: isEnabled ? rotateX : 0,
        rotateY: isEnabled ? rotateY : 0,
        transformStyle: "preserve-3d",
        perspective: 2200,
      }}
      whileHover={
        isEnabled
          ? { y: -4, scale: 1.01 }
          : {}
      }
      transition={{
        type: "spring",
        stiffness: 180,
        damping: 18,
      }}
    >

      {/* MAIN PANEL */}
      <div
        className="
          panel-shell
          relative
          overflow-hidden
          rounded-lg
        "
      >

        {/* SPOTLIGHT (DESKTOP ONLY) */}
        {isEnabled && (
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
        )}

        {/* GLASS REFLECTION */}
        <motion.div
          className="
            pointer-events-none
            absolute
            inset-0
            z-[3]
            opacity-30
          "
          style={{
            background: `
              linear-gradient(
                120deg,
                rgba(255,255,255,0.08),
                transparent 30%,
                transparent 70%,
                rgba(255,255,255,0.02)
              )
            `,
          }}
        />

        {/* INNER EDGE */}
        <div
          className="
            pointer-events-none
            absolute
            inset-0
            rounded-lg
            border
            border-white/[0.04]
            shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]
          "
        />

        {/* CONTENT */}
        <div
          className="
            relative
            z-[5]
            h-full
          "
          style={{
            transform: "translateZ(40px)",
          }}
        >
          {children}
        </div>
      </div>
    </motion.div>
  );
}