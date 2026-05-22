"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { type ReactNode, useRef }             from "react";

interface Props {
  children:   ReactNode;
  intensity?: number;
  className?: string;
}

export function TiltCard({ children, intensity = 7, className = "" }: Props) {
  const ref  = useRef<HTMLDivElement>(null);
  const rotX = useSpring(useMotionValue(0), { stiffness: 280, damping: 28 });
  const rotY = useSpring(useMotionValue(0), { stiffness: 280, damping: 28 });
  const spotX = useMotionValue(50);
  const spotY = useMotionValue(50);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = (e.clientX - rect.left) / rect.width;
    const cy = (e.clientY - rect.top)  / rect.height;
    rotY.set((cx - 0.5) *  intensity * 2);
    rotX.set((cy - 0.5) * -intensity * 2);
    spotX.set(cx * 100);
    spotY.set(cy * 100);
  }

  function onLeave() {
    rotX.set(0);
    rotY.set(0);
    spotX.set(50);
    spotY.set(50);
  }

  return (
    <motion.div
      ref={ref}
      className={`panel-shell ${className}`}
      style={{
        rotateX:          rotX,
        rotateY:          rotY,
        transformStyle:   "preserve-3d",
        transformPerspective: 800,
      }}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
    >
      {/* Cursor spotlight */}
      <motion.div
        className="pointer-events-none absolute inset-0 rounded-[28px] opacity-0 transition-opacity duration-300 hover:opacity-100"
        style={{
          background: `radial-gradient(200px circle at ${spotX.get()}% ${spotY.get()}%, rgba(77,247,255,0.06), transparent 60%)`,
        }}
        whileHover={{ opacity: 1 }}
      />
      {children}
    </motion.div>
  );
}