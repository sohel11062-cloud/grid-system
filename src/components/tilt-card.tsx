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
  /** Max rotation degrees */
  intensity?: number;
  disabled?: boolean;
}

export function TiltCard({
  children,
  className = "",
  intensity = 7,
  disabled = false,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Normalized cursor position 0→1
  const rawX = useMotionValue(0.5);
  const rawY = useMotionValue(0.5);

  const spring = { stiffness: 130, damping: 20, mass: 0.6 };
  const x = useSpring(rawX, spring);
  const y = useSpring(rawY, spring);

  // Rotation
  const rotateY = useTransform(x, [0, 1], [-intensity, intensity]);
  const rotateX = useTransform(y, [0, 1], [intensity, -intensity]);

  // Dynamic spotlight following cursor
  const spotX = useTransform(x, [0, 1], ["0%", "100%"]);
  const spotY = useTransform(y, [0, 1], ["0%", "100%"]);
  const spotlight = useMotionTemplate`radial-gradient(220px circle at ${spotX} ${spotY}, rgba(77,247,255,0.09), transparent 70%)`;

  // Subtle scale + shadow intensification on hover managed by state
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (disabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    rawX.set((e.clientX - r.left) / r.width);
    rawY.set((e.clientY - r.top) / r.height);
  }

  function onMouseLeave() {
    rawX.set(0.5);
    rawY.set(0.5);
  }

  if (disabled) {
    return <div className={`panel-shell ${className}`}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformPerspective: 950,
        transformStyle: "preserve-3d",
      }}
      whileHover={{ scale: 1.012 }}
      transition={{ scale: { duration: 0.3, ease: [0.22, 1, 0.36, 1] } }}
      className={`panel-shell ${className}`}
    >
      {/* Spotlight layer */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[28px]"
        style={{ background: spotlight }}
      />
      {children}
    </motion.div>
  );
}
