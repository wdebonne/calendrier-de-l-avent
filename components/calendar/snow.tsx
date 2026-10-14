"use client";

import { useEffect, useState } from "react";

type Flake = { left: number; size: number; duration: number; delay: number; drift: number; opacity: number };

export function Snow({ count = 50, symbol = "❄" }: { count?: number; symbol?: string }) {
  // Generated after mount so server and client markup match.
  const [flakes, setFlakes] = useState<Flake[]>([]);
  useEffect(() => {
    setFlakes(
      Array.from({ length: count }, () => ({
        left: Math.random() * 100,
        size: 8 + Math.random() * 14,
        duration: 8 + Math.random() * 12,
        delay: -Math.random() * 20,
        drift: Math.random() * 80 - 40,
        opacity: 0.4 + Math.random() * 0.6,
      })),
    );
  }, [count]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {flakes.map((f, i) => (
        <span
          key={i}
          className="snowflake"
          style={
            {
              left: `${f.left}%`,
              fontSize: f.size,
              opacity: f.opacity,
              animationDuration: `${f.duration}s`,
              animationDelay: `${f.delay}s`,
              "--drift": `${f.drift}px`,
            } as React.CSSProperties
          }
        >
          {symbol}
        </span>
      ))}
    </div>
  );
}
