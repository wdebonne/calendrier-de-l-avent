"use client";

import { motion, type TargetAndTransition } from "framer-motion";
import { Check, Lock } from "lucide-react";
import type { CalendarTheme } from "@/lib/calendar/theme";
import { cn } from "@/lib/utils";

export type DoorState = "locked" | "available" | "opening" | "opened";

const fontClass: Record<CalendarTheme["font"], string> = {
  festive: "font-festive",
  sans: "font-sans",
  serif: "font-serif",
  handwritten: "font-hand",
};

function shapeClass(theme: CalendarTheme, index: number) {
  switch (theme.doorShape) {
    case "square":
      return "rounded-md";
    case "circle":
      return "rounded-full";
    case "mixed":
      return ["rounded-2xl", "rounded-full", "rounded-md", "rounded-[2rem]"][index % 4];
    default:
      return "rounded-2xl";
  }
}

/** Front panel animation for each door effect. */
function openingAnimation(kind: string): { animate: TargetAndTransition; origin: string } {
  switch (kind) {
    case "flip":
      return { animate: { rotateY: 180, opacity: [1, 1, 0], transition: { duration: 0.7 } }, origin: "50% 50%" };
    case "slide":
      return { animate: { y: "-110%", transition: { duration: 0.55, ease: [0.65, 0, 0.35, 1] } }, origin: "50% 50%" };
    case "zoom":
      return { animate: { scale: [1, 1.15, 1.6], opacity: [1, 1, 0], transition: { duration: 0.6 } }, origin: "50% 50%" };
    case "shake":
      return {
        animate: { rotate: [0, -8, 8, -6, 6, 0, 0], scale: [1, 1, 1, 1, 1, 1.2, 0], transition: { duration: 0.8 } },
        origin: "50% 50%",
      };
    case "gift":
      return {
        animate: { y: [0, -12, -140], rotate: [0, -6, -25], opacity: [1, 1, 0], transition: { duration: 0.75 } },
        origin: "50% 100%",
      };
    case "unwrap":
      return { animate: { scaleX: [1, 1.05, 0], opacity: [1, 1, 0], transition: { duration: 0.6 } }, origin: "50% 50%" };
    default:
      return { animate: { rotateY: -115, transition: { duration: 0.75, ease: [0.33, 1, 0.68, 1] } }, origin: "0% 50%" };
  }
}

export function Door({
  number,
  label,
  cover,
  state,
  theme,
  animation,
  index,
  big,
  wide,
  hasChallenge,
  onClick,
  onOpened,
  shakeKey,
}: {
  number: number;
  label?: string | null;
  cover?: string | null;
  state: DoorState;
  theme: CalendarTheme;
  animation: string;
  index: number;
  big?: boolean;
  wide?: boolean;
  hasChallenge?: boolean;
  onClick: () => void;
  onOpened?: () => void;
  shakeKey?: number;
}) {
  const shape = shapeClass(theme, index);
  const anim = openingAnimation(animation);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={`${number}${label ? ` – ${label}` : ""}`}
      className={cn(
        "perspective group relative w-full select-none outline-none focus-visible:ring-4 focus-visible:ring-white/70",
        shape,
        big ? "col-span-2 row-span-2" : wide ? "col-span-2" : "aspect-square",
      )}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1, x: shakeKey ? [0, -8, 8, -5, 5, 0] : 0 }}
      transition={{ delay: shakeKey ? 0 : Math.min(index * 0.025, 0.6), duration: shakeKey ? 0.4 : 0.35 }}
      whileHover={state !== "opening" ? { y: -3 } : undefined}
      whileTap={{ scale: 0.97 }}
    >
      {/* Inside of the door, visible once the front panel moves away */}
      <div
        className={cn("absolute inset-0 grid place-items-center overflow-hidden shadow-inner", shape)}
        style={{
          background: `radial-gradient(circle at 50% 40%, ${theme.primary}55, rgba(0,0,0,0.55))`,
        }}
      >
        <span className={cn("text-3xl sm:text-4xl", state === "opened" && "opacity-90")}>{state === "opened" ? "🎁" : "✨"}</span>
        {state === "opened" && (
          <span
            className={cn("absolute bottom-1.5 right-1.5 grid h-5 w-5 place-items-center rounded-full text-white shadow", fontClass.sans)}
            style={{ background: theme.primary }}
          >
            <Check className="h-3 w-3" style={{ color: theme.doorText }} />
          </span>
        )}
        {state === "opened" && theme.showNumbers && (
          <span className={cn("absolute left-2 top-1 text-sm font-bold text-white/80", fontClass[theme.font])}>{number}</span>
        )}
      </div>

      {/* Front panel */}
      {state !== "opened" && (
        <motion.div
          className={cn(
            "preserve-3d absolute inset-0 flex flex-col items-center justify-center overflow-hidden border shadow-lg transition-shadow group-hover:shadow-xl",
            shape,
          )}
          style={{
            transformOrigin: anim.origin,
            background: cover ? `center/cover no-repeat url("${cover}")` : theme.door,
            borderColor: `${theme.doorText}22`,
            color: theme.doorText,
          }}
          animate={state === "opening" ? anim.animate : { rotateY: 0, y: 0, scale: 1, opacity: 1, rotate: 0, scaleX: 1 }}
          onAnimationComplete={() => {
            if (state === "opening") onOpened?.();
          }}
        >
          {cover && <div className="absolute inset-0 bg-black/25" />}
          {animation === "gift" && (
            <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2" style={{ background: theme.primary, opacity: 0.85 }} />
          )}
          {animation === "gift" && (
            <div className="absolute inset-y-0 left-1/2 w-2 -translate-x-1/2" style={{ background: theme.primary, opacity: 0.85 }} />
          )}
          {animation === "swing" && (
            <span className="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full shadow" style={{ background: theme.primary }} />
          )}
          {theme.showNumbers && (
            <span
              className={cn(
                "relative font-bold leading-none drop-shadow-sm",
                fontClass[theme.font],
                big ? "text-6xl sm:text-7xl" : "text-3xl sm:text-4xl",
                cover && "text-white",
              )}
            >
              {number}
            </span>
          )}
          {label && big && <span className="relative mt-2 px-2 text-center text-xs font-medium opacity-80">{label}</span>}
          {state === "locked" && <Lock className={cn("absolute bottom-1.5 right-1.5 h-3.5 w-3.5 opacity-40", cover && "text-white")} />}
          {hasChallenge && state === "available" && <span className="absolute left-1.5 top-1 text-xs">🧩</span>}
        </motion.div>
      )}
    </motion.button>
  );
}
