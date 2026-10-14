"use client";

import confetti from "canvas-confetti";

export function playEffect(name: string, colors: string[] = ["#c8102e", "#facc15", "#16a34a", "#ffffff"]) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  switch (name) {
    case "confetti": {
      confetti({ particleCount: 140, spread: 90, startVelocity: 45, origin: { y: 0.6 }, colors, zIndex: 9999 });
      setTimeout(
        () => confetti({ particleCount: 80, spread: 120, startVelocity: 30, origin: { y: 0.5 }, colors, zIndex: 9999 }),
        250,
      );
      break;
    }
    case "snow": {
      const end = Date.now() + 2500;
      const frame = () => {
        confetti({
          particleCount: 3,
          startVelocity: 0,
          ticks: 300,
          gravity: 0.35,
          origin: { x: Math.random(), y: -0.05 },
          colors: ["#ffffff", "#e0f2fe"],
          shapes: ["circle"],
          scalar: 0.6 + Math.random() * 0.8,
          drift: Math.random() - 0.5,
          zIndex: 9999,
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
      break;
    }
    case "stars": {
      const opts = { spread: 360, ticks: 70, gravity: 0, decay: 0.94, startVelocity: 25, shapes: ["star"] as confetti.Shape[], colors: ["#fde68a", "#fbbf24", "#f59e0b"], zIndex: 9999 };
      [0, 120, 240].forEach((delay) =>
        setTimeout(() => {
          confetti({ ...opts, particleCount: 40, scalar: 1.2 });
          confetti({ ...opts, particleCount: 15, scalar: 0.75, shapes: ["circle"] });
        }, delay),
      );
      break;
    }
    case "fireworks": {
      const end = Date.now() + 2200;
      const interval = setInterval(() => {
        if (Date.now() > end) return clearInterval(interval);
        confetti({
          particleCount: 50,
          startVelocity: 30,
          spread: 360,
          ticks: 60,
          origin: { x: 0.15 + Math.random() * 0.7, y: Math.random() * 0.4 + 0.1 },
          colors,
          zIndex: 9999,
        });
      }, 280);
      break;
    }
    default:
      break;
  }
}
