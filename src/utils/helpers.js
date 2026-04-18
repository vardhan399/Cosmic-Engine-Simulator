export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const fmt = (n, d = 2) => Number(n).toFixed(d);
export const fmtExp = (n, d = 2) => {
  if (Math.abs(n) < 1e-3 || Math.abs(n) > 1e5) return n.toExponential(d);
  return n.toFixed(d);
};
export const randRange = (lo, hi) => lo + Math.random() * (hi - lo);
