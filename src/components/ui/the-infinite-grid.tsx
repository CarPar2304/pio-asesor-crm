import React from "react";
import { cn } from "@/lib/utils";
import {
  motion,
  useMotionValue,
  useMotionTemplate,
  useAnimationFrame,
} from "framer-motion";

interface InfiniteGridBackgroundProps {
  children?: React.ReactNode;
  className?: string;
}

export function InfiniteGridBackground({ children, className }: InfiniteGridBackgroundProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const handleMouseMove = (e: React.MouseEvent) => {
    const { left, top } = e.currentTarget.getBoundingClientRect();
    mouseX.set(e.clientX - left);
    mouseY.set(e.clientY - top);
  };

  const gridOffsetX = useMotionValue(0);
  const gridOffsetY = useMotionValue(0);

  useAnimationFrame(() => {
    gridOffsetX.set((gridOffsetX.get() + 0.5) % 40);
    gridOffsetY.set((gridOffsetY.get() + 0.5) % 40);
  });

  const maskImage = useMotionTemplate`radial-gradient(300px circle at ${mouseX}px ${mouseY}px, black, transparent)`;

  return (
    <div
      onMouseMove={handleMouseMove}
      className={cn("relative overflow-hidden", className)}
    >
      {/* Base grid */}
      <div className="absolute inset-0">
        <GridPattern offsetX={gridOffsetX} offsetY={gridOffsetY} />
      </div>

      {/* Mouse-reveal active grid */}
      <motion.div className="absolute inset-0" style={{ maskImage, WebkitMaskImage: maskImage }}>
        <GridPattern offsetX={gridOffsetX} offsetY={gridOffsetY} active />
      </motion.div>

      {/* Gradient overlays */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-transparent to-background/80" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/60 via-transparent to-background/60" />
        <div className="absolute bottom-0 h-32 w-full bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

function GridPattern({ offsetX, offsetY, active }: { offsetX: any; offsetY: any; active?: boolean }) {
  return (
    <svg className="absolute inset-0 h-full w-full">
      <defs>
        <motion.pattern
          id={active ? "grid-active" : "grid-base"}
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
          style={{ x: offsetX, y: offsetY }}
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke={active ? "hsl(var(--primary))" : "hsl(var(--border))"}
            strokeWidth={active ? "1.5" : "0.5"}
            strokeOpacity={active ? 0.4 : 0.3}
          />
        </motion.pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${active ? "grid-active" : "grid-base"})`} />
    </svg>
  );
}
