// Solar-specific physics helpers.
// Reuses shared primitives from ../../physics/engine.js so there's no duplication
// across the Planet and Solar modules.

import { equilibriumTemp, surfaceGravity, classifyHabitability } from '../../physics/engine';

// ────────────────────────────────────────────────────────────────────────────
//  Keplerian orbit initialization
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given a central mass M, a desired semi-major axis a, an eccentricity e
 * (0 = circle), and orbital inclination inc (radians), compute an initial
 * (pos, vel) pair placing the body at periapsis of the rotated ellipse.
 *
 *   - Specific angular momentum at periapsis:  h = sqrt(G*M * a*(1-e²))
 *   - Periapsis distance:                      rp = a*(1-e)
 *   - Velocity at periapsis (perpendicular):   vp = h / rp
 *
 * The orbit is then rotated by `argumentOfPeriapsis` around Y and tilted
 * by `inc` around the X axis so we get ellipse + inclination + randomized
 * orientation — giving a visually imperfect, physically consistent system.
 */
export function keplerianInit({ G = 1, M, a, e = 0, inc = 0, argOfPeri = 0, phase = 0 }) {
  const rp = a * (1 - e);
  const h = Math.sqrt(G * M * a * (1 - e * e));
  const vp = h / rp;

  // Position at periapsis in the orbital plane (x-axis)
  let px = rp, py = 0, pz = 0;
  let vx = 0, vy = 0, vz = vp;

  // Apply phase (mean anomaly offset for visual variety across planets)
  const cosP = Math.cos(phase), sinP = Math.sin(phase);
  let rx = px * cosP - pz * sinP;
  let rz = px * sinP + pz * cosP;
  let rvx = vx * cosP - vz * sinP;
  let rvz = vx * sinP + vz * cosP;
  px = rx; pz = rz; vx = rvx; vz = rvz;

  // Apply argument of periapsis (rotate around Y)
  const cosA = Math.cos(argOfPeri), sinA = Math.sin(argOfPeri);
  rx = px * cosA - pz * sinA;
  rz = px * sinA + pz * cosA;
  rvx = vx * cosA - vz * sinA;
  rvz = vx * sinA + vz * cosA;
  px = rx; pz = rz; vx = rvx; vz = rvz;

  // Apply inclination (tilt around X)
  const cosI = Math.cos(inc), sinI = Math.sin(inc);
  const pyOut = py * cosI - pz * sinI;
  const pzOut = py * sinI + pz * cosI;
  const vyOut = vy * cosI - vz * sinI;
  const vzOut = vy * sinI + vz * cosI;

  return { pos: [px, pyOut, pzOut], vel: [vx, vyOut, vzOut] };
}

// ────────────────────────────────────────────────────────────────────────────
//  Star lifecycle — full 7-stage evolution
// ────────────────────────────────────────────────────────────────────────────

/**
 * Each stage defines the VISUAL parameters used to render the star. Stages are
 * designed to be interpolable (every field numeric or a color) so the scene can
 * lerp smoothly between them during Run Evolution.
 *
 *   sizeMult:    size multiplier vs. user's base starMass sphere
 *   tempK:       blackbody-ish color temperature used for core color
 *   lumMult:     light intensity multiplier
 *   turbulence:  0..1 surface convection amplitude (flares, bright patches)
 *   pulseRate:   Hz of breathing oscillation
 *   pulseAmp:    amplitude of breathing oscillation
 *   coronaMult:  corona size multiplier vs. baseline
 *   isBlackHole: if true, scene renders accretion disk + dark core
 *   isNebula:    if true, scene renders diffuse particle cloud instead of a star
 *   isSupernova: if true, scene renders expanding blast wave + flash
 */
export const STAR_LIFECYCLE = {
  nebula:     { sizeMult: 8.0,  tempK: 2400,  lumMult: 0.15, turbulence: 0.05, pulseRate: 0.3, pulseAmp: 0.02, coronaMult: 0.3, isNebula: true },
  protostar:  { sizeMult: 2.4,  tempK: 3200,  lumMult: 0.5,  turbulence: 1.0,  pulseRate: 2.4, pulseAmp: 0.12, coronaMult: 1.6 },
  main:       { sizeMult: 1.0,  tempK: 5778,  lumMult: 1.0,  turbulence: 0.4,  pulseRate: 0.9, pulseAmp: 0.025, coronaMult: 1.0 },
  giant:      { sizeMult: 4.0,  tempK: 3800,  lumMult: 2.8,  turbulence: 0.8,  pulseRate: 0.5, pulseAmp: 0.08, coronaMult: 2.2 },
  supernova:  { sizeMult: 6.5,  tempK: 14000, lumMult: 10,   turbulence: 1.0,  pulseRate: 3.0, pulseAmp: 0.25, coronaMult: 3.5, isSupernova: true },
  whitedwarf: { sizeMult: 0.28, tempK: 11000, lumMult: 0.7,  turbulence: 0.15, pulseRate: 1.4, pulseAmp: 0.02, coronaMult: 0.5 },
  blackhole:  { sizeMult: 0.45, tempK: 20000, lumMult: 0,    turbulence: 0,    pulseRate: 0,   pulseAmp: 0,    coronaMult: 0,   isBlackHole: true },
};

/**
 * Given star mass (M☉) decide the END stage after a supernova trigger.
 *   > 3    → black hole
 *   > 1.4  → (treated as black hole here — scene shows accretion disk dim)
 *   else   → white dwarf
 * We simplify (no neutron star visual stage; spec only names BH / WD).
 */
export function endStageForMass(M) {
  return M > 3 ? 'blackhole' : 'whitedwarf';
}

/**
 * The autopilot timeline for Run Evolution. Each step is a {stage, weight}
 * pair — weight determines relative duration. Progress 0..1 maps across
 * total weight; scene reads which stage we're in + transition alpha to the
 * NEXT stage, allowing smooth parameter interpolation.
 *
 * High-mass path includes supernova → blackhole.
 * Low-mass path skips supernova → whitedwarf.
 */
export function lifecycleTimeline(starMass) {
  const ends = endStageForMass(starMass);
  if (ends === 'blackhole') {
    return [
      { stage: 'nebula',     weight: 1 },
      { stage: 'protostar',  weight: 1.5 },
      { stage: 'main',       weight: 3 },
      { stage: 'giant',      weight: 1.5 },
      { stage: 'supernova',  weight: 0.6 },
      { stage: 'blackhole',  weight: 2.4 },
    ];
  }
  return [
    { stage: 'nebula',     weight: 1 },
    { stage: 'protostar',  weight: 1.5 },
    { stage: 'main',       weight: 4 },
    { stage: 'giant',      weight: 2 },
    { stage: 'whitedwarf', weight: 1.5 },
  ];
}

/**
 * Resolve 0..1 progress to {current, next, alpha} — the two stages to
 * interpolate between plus 0..1 alpha within the transition.
 */
export function resolveLifecycle(progress, timeline) {
  const total = timeline.reduce((s, step) => s + step.weight, 0);
  const p = Math.max(0, Math.min(0.9999, progress)) * total;
  let acc = 0;
  for (let i = 0; i < timeline.length; i++) {
    const w = timeline[i].weight;
    if (p < acc + w) {
      const alpha = (p - acc) / w;
      const current = timeline[i].stage;
      const next = timeline[Math.min(i + 1, timeline.length - 1)].stage;
      return { current, next, alpha };
    }
    acc += w;
  }
  return { current: timeline[timeline.length - 1].stage, next: timeline[timeline.length - 1].stage, alpha: 1 };
}

/**
 * Interpolate two lifecycle-parameter objects. Booleans are held from the
 * CURRENT stage (no half-states for isBlackHole etc.).
 */
export function blendLifecycle(a, b, alpha) {
  return {
    sizeMult:    a.sizeMult    + (b.sizeMult    - a.sizeMult)    * alpha,
    tempK:       a.tempK       + (b.tempK       - a.tempK)       * alpha,
    lumMult:     a.lumMult     + (b.lumMult     - a.lumMult)     * alpha,
    turbulence:  a.turbulence  + (b.turbulence  - a.turbulence)  * alpha,
    pulseRate:   a.pulseRate   + (b.pulseRate   - a.pulseRate)   * alpha,
    pulseAmp:    a.pulseAmp    + (b.pulseAmp    - a.pulseAmp)    * alpha,
    coronaMult:  a.coronaMult  + (b.coronaMult  - a.coronaMult)  * alpha,
    isNebula:    alpha < 0.5 ? !!a.isNebula    : !!b.isNebula,
    isSupernova: alpha < 0.5 ? !!a.isSupernova : !!b.isSupernova,
    isBlackHole: alpha < 0.5 ? !!a.isBlackHole : !!b.isBlackHole,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Resonance detection — find near-integer period ratios (2:1, 3:2, 4:3)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given an array of orbital periods, flag pairs whose ratio is close to a
 * small-integer fraction. Returns a list of {i, j, ratio, label}.
 *
 * Real Solar-system example: Neptune:Pluto 3:2, Io:Europa 2:1.
 */
export function detectResonances(periods, tolerance = 0.04) {
  const pairs = [];
  const targets = [
    [2, 1, '2:1'], [3, 2, '3:2'], [4, 3, '4:3'], [3, 1, '3:1'], [5, 2, '5:2'],
  ];
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const r = Math.max(periods[i], periods[j]) / Math.min(periods[i], periods[j]);
      for (const [a, b, label] of targets) {
        const target = a / b;
        if (Math.abs(r - target) / target < tolerance) {
          pairs.push({ i, j, ratio: r, label });
          break;
        }
      }
    }
  }
  return pairs;
}

/**
 * Derived orbital period for a circular orbit (in sim time units).
 * T = 2π √(a³ / (G*M))
 */
export function orbitalPeriod(a, M, G = 1) {
  return 2 * Math.PI * Math.sqrt((a * a * a) / (G * M));
}

// ────────────────────────────────────────────────────────────────────────────
//  Focus-planet physics reuse (thin wrappers around shared engine)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute the standard habitability / temperature read-out for a planet in
 * this solar system. Wraps the shared physics engine so the Solar module
 * never duplicates formulas.
 */
export function computeFocusMetrics({ starLum, distance, albedo = 0.3, radiusKm = 6371, massE24 = 5.972 }) {
  const Teq = equilibriumTemp(distance, starLum, albedo);
  const gravity = surfaceGravity(massE24, radiusKm);
  const hab = classifyHabitability({
    tempK: Teq, gravity, waterPct: 40, o2Pct: 18, co2Pct: 0.5,
  });
  return { Teq, gravity, habitability: hab };
}

// ────────────────────────────────────────────────────────────────────────────
//  Habitable zone — simple band where a G-analog planet would be liquid water
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given effective luminosity (approximated as starMass for main-sequence stars,
 * modulated by lifecycle lumMult), return the inner and outer habitable-zone
 * radii in SCENE UNITS — matching the simulation's semi-major-axis scaling
 * where planet 0 sits at a = 7.
 *
 * Formula (simplified Kopparapu): r_hab ∝ √L. For L=1 (sun-like) we place the
 * band roughly at a = 10..16 sim units so it visibly overlays the inner planets.
 */
export function habitableZone(effectiveLum) {
  const L = Math.max(0.01, effectiveLum);
  const inner = 10 * Math.sqrt(L) * 0.85;
  const outer = 10 * Math.sqrt(L) * 1.45;
  return { inner, outer };
}

// ────────────────────────────────────────────────────────────────────────────
//  System personality — derive a human-readable identity from current state
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given analytics + params, return a {label, tone} identity for the system.
 *
 * Priorities (first match wins):
 *   BLACK HOLE EVENT → supernova/blackhole/chaos
 *   severe drift     → "Chaotic Collapse"
 *   unstable         → "Unstable Resonance" (if resonances) or "Drifting System"
 *   multi-star       → "Binary Dance" / "Ternary Weave"
 *   resonant         → "Harmonic Chorus"
 *   stable           → "Stable Harmony"
 */
export function systemPersonality({ stability, drift, resonances = [], multiStar = 1, lifecycleStage = 'main', chaos = false }) {
  if (lifecycleStage === 'supernova')  return { label: 'Supernova Cascade', tone: 'violet' };
  if (lifecycleStage === 'blackhole')  return { label: 'Gravitational Abyss', tone: 'violet' };
  if (lifecycleStage === 'nebula')     return { label: 'Nascent Cloud', tone: 'cyan' };
  if (lifecycleStage === 'protostar')  return { label: 'Emerging Star', tone: 'amber' };

  if (chaos && drift > 0.3) return { label: 'Chaotic Collapse', tone: 'danger' };
  if (chaos)                return { label: 'Turbulent Flow', tone: 'danger' };

  if (drift > 0.35)         return { label: 'Chaotic Collapse', tone: 'danger' };
  if (drift > 0.12 && resonances.length > 0) return { label: 'Unstable Resonance', tone: 'amber' };
  if (drift > 0.12)         return { label: 'Drifting System', tone: 'amber' };

  if (multiStar === 2)      return { label: 'Binary Dance', tone: 'violet' };
  if (multiStar === 3)      return { label: 'Ternary Weave', tone: 'violet' };

  if (resonances.length >= 2) return { label: 'Harmonic Chorus', tone: 'success' };
  if (resonances.length >= 1) return { label: 'Quiet Resonance',  tone: 'success' };

  return { label: 'Stable Harmony', tone: 'success' };
}

// ────────────────────────────────────────────────────────────────────────────
//  AI explanation — narrative text from observed state
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns an array of short explanatory sentences about the current system.
 * Each is prefixed with a type marker ('stability' | 'orbits' | 'future')
 * so the panel can color-code them.
 */
export function explainSystem({ analytics, params }) {
  const out = [];
  const { stability, drift, resonances = [], planetAlive, focusBody, lifecycleStage } = analytics;
  const { multiStar, starMass, chaos } = params;

  // Stability
  if (stability === 'STABLE') {
    out.push({ kind: 'stability', text: 'Energy is conserved — orbits will remain closed indefinitely at current time scale.' });
  } else if (stability === 'BINARY ORBIT STABLE') {
    out.push({ kind: 'stability', text: `Planets orbit the barycenter of ${multiStar} stars. Configuration is gravitationally balanced.` });
  } else if (stability === 'APPROACHING INSTABILITY') {
    out.push({ kind: 'stability', text: `Energy drift at ${(drift * 100).toFixed(1)}% — small perturbations are compounding.` });
  } else if (stability === 'UNSTABLE' || stability === 'CHAOTIC DRIFT') {
    out.push({ kind: 'stability', text: 'Orbital binding is failing. Expect ejections within the next several periods.' });
  } else if (stability === 'SUPERNOVA EVENT') {
    out.push({ kind: 'stability', text: 'Shock wave expanding from the core. Planets receive outward impulse proportional to inverse distance.' });
  } else if (stability === 'BLACK HOLE FORMED') {
    out.push({ kind: 'stability', text: 'Accretion disk orbiting an event horizon. Nearby objects experience extreme spacetime curvature.' });
  }

  // Orbital relationships
  if (resonances.length > 0) {
    const labels = resonances.map((r) => r.label).join(', ');
    out.push({ kind: 'orbits', text: `Resonance detected: ${labels}. These small-integer period ratios stabilize orbits (seen in Io-Europa, Neptune-Pluto).` });
  } else if (planetAlive >= 2) {
    out.push({ kind: 'orbits', text: 'No integer-period resonances. Orbits are independent but decoupled.' });
  }

  if (multiStar > 1) {
    out.push({ kind: 'orbits', text: `${multiStar} stars orbit their mutual center of mass — planets feel the combined field.` });
  }

  if (focusBody) {
    out.push({ kind: 'orbits', text: `Focused planet eccentricity ${focusBody.eccentricity.toFixed(3)}; orbit ${focusBody.eccentricity < 0.05 ? 'near-circular' : focusBody.eccentricity < 0.15 ? 'mildly elliptical' : 'notably eccentric'}.` });
  }

  // Future prediction
  if (chaos) {
    out.push({ kind: 'future', text: 'Chaos mode active — random velocity kicks will eventually scatter the system. No long-term prediction possible.' });
  } else if (lifecycleStage === 'giant' && starMass > 3) {
    out.push({ kind: 'future', text: `Star mass > 3 M☉ — endpoint will be a black hole. Inner planets will be engulfed when the envelope expands further.` });
  } else if (lifecycleStage === 'giant') {
    out.push({ kind: 'future', text: 'Star mass < 3 M☉ — endpoint will be a white dwarf. Outer planets may survive; inner ones will not.' });
  } else if (drift < 0.05 && planetAlive >= 2 && stability === 'STABLE') {
    out.push({ kind: 'future', text: 'Integrator conserves energy — orbits repeat over millions of cycles without drift.' });
  }

  return out;
}
