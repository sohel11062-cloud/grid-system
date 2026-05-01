"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
} from "framer-motion";

interface TiltCardProps {
  children: React.ReactNode;
  className?: string;
  intensity?: number;
  /** Disable tilt (e.g. on mobile) */
  disabled?: boolean;
}

export function TiltCard({
  children,
  className = "",
  intensity = 7,
  disabled = false,
}: TiltCardProps) {
  const ref  = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0.5);
  const rawY = useMotionValue(0.5);

  const springCfg = { stiffness: 140, damping: 22, mass: 0.55 };
  const x = useSpring(rawX, springCfg);
  const y = useSpring(rawY, springCfg);

  const rotateY = useTransform(x, [0, 1], [-intensity, intensity]);
  const rotateX = useTransform(y, [0, 1], [intensity, -intensity]);

  const spotX = useTransform(x, [0, 1], ["0%", "100%"]);
  const spotY = useTransform(y, [0, 1], ["0%", "100%"]);
  const spot  = useMotionTemplate`radial-gradient(200px circle at ${spotX} ${spotY}, rgba(77,247,255,0.08), transparent 70%)`;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    rawX.set((e.clientX - r.left) / r.width);
    rawY.set((e.clientY - r.top) / r.height);
  }

  function onLeave() {
    rawX.set(0.5);
    rawY.set(0.5);
  }

  if (disabled) {
    return <div className={`panel-shell ${className}`}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 1000,
        transformStyle: "preserve-3d",
      }}
      whileHover={{ scale: 1.012 }}
      transition={{ scale: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      className={`panel-shell ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[26px]"
        style={{ background: spot }}
      />
      {children}
    </motion.div>
  );
}