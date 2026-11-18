// Landing page: theme switch and the 14-second logo assembly.
import { initThemeToggles } from "./theme.js";

initThemeToggles();

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());

const stage = document.getElementById("stage");
const emblem = document.getElementById("emblem");

// A slow or data-saving device gets the still, assembled version (N-2).
const conn = navigator.connection || {};
const slowDevice =
  conn.saveData === true ||
  /(^|-)2g$/.test(conn.effectiveType || "") ||
  (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 1);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

if (stage && emblem) {
  if (slowDevice) stage.classList.add("still");

  // Cut the logo into a 4 x 4 grid. Each piece starts somewhere off to the side
  // and drifts into place. Offsets are fixed (not random) so the motion feels
  // composed and is the same on every visit.
  const scatter = [
    [-150, -90, -24], [-40, -150, 18], [60, -160, -12], [170, -80, 30],
    [-190, -20, 14], [-70, -60, -30], [80, -50, 22], [200, 10, -16],
    [-180, 60, -20], [-60, 120, 26], [90, 140, -28], [190, 80, 12],
    [-130, 170, 30], [-20, 190, -14], [70, 200, 20], [160, 160, -26],
  ];
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 16; i++) {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const el = document.createElement("span");
    el.className = "piece";
    el.style.left = `${col * 25}%`;
    el.style.top = `${row * 25}%`;
    el.style.backgroundPosition = `${(col / 3) * 100}% ${(row / 3) * 100}%`;
    const [x, y, r] = scatter[i];
    el.style.setProperty("--x", `${x}%`);
    el.style.setProperty("--y", `${y}%`);
    el.style.setProperty("--r", `${r}deg`);
    // a small stagger so the pieces don't move as one block
    el.style.animationDelay = `${(i % 5) * -0.08}s`;
    frag.appendChild(el);
  }
  emblem.appendChild(frag);
  emblem.classList.add("pieces");

  // Pause the loop while the hero is off screen, to save battery.
  if (!reducedMotion && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(([entry]) => {
      stage.querySelectorAll(".piece, .door-pop").forEach((el) => {
        el.style.animationPlayState = entry.isIntersecting ? "running" : "paused";
      });
    });
    io.observe(stage);
  }
}
