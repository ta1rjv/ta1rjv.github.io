// Shared scroll-path helpers (pure functions, no dependencies).
// "p" is the scene progress in 0..1 (hero 0-0.2, fall 0.2-0.4, universe 0.4-0.55, flight 0.55-1).

export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Scene progress values assigned to the DOM section boundaries:
// [hero top, fall top, universe top, about top, document end]
export const SCENE_MARKS = [0, 0.2, 0.4, 0.55, 1];

// Camera distance from the singularity in units of the Schwarzschild radius (Rs).
export function cameraDistance(p) {
  const hero = clamp(p / 0.2, 0, 1);
  const base = 19 - 2 * hero; // 19 -> 17 Rs during the hero phase (smaller hole on screen)
  const t = clamp((p - 0.2) / 0.19, 0, 1);
  return base * Math.pow(1.02 / base, t); // continuous exponential plunge to 1.02 Rs
}
