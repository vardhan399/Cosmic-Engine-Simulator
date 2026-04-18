// Reality module — pure physics & reasoning helpers.
// Isolated from rendering so the laws can be unit-tested and reused.

// ────────────────────────────────────────────────────────────────────────────
//  Variable-exponent N-body acceleration
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute accelerations for N bodies under a variable-exponent gravitational
 * law: F ∝ 1 / r^exponent (default 2 = Newtonian).
 *
 * Returns [{x, y, z}] array — one accel per body.
 *
 * This is intentionally NOT a reuse of physics/engine.nbodyAccel because the
 * user needs to be able to violate Newton's law here (that's the whole point
 * of the Reality Lab).
 */
export function nbodyVariableAccel(bodies, G, exponent, softening = 0.25) {
  const n = bodies.length;
  const acc = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0 }));
  const soft2 = softening * softening;
  const halfExp = exponent / 2; // we compute (r² + soft)^(exp/2+0.5) below
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const dz = bodies[j].z - bodies[i].z;
      const r2 = dx * dx + dy * dy + dz * dz + soft2;
      // F / m = G * m_other / r² for Newton. General: F ∝ 1/r^exp
      // With force direction: a_i = G * m_j * (r̂ji) / r^exp
      //   = G * m_j * (r_ji) / r^(exp+1)
      const invR = Math.pow(r2, -(halfExp + 0.5));
      const fi = G * bodies[j].mass * invR;
      const fj = G * bodies[i].mass * invR;
      acc[i].x += dx * fi;
      acc[i].y += dy * fi;
      acc[i].z += dz * fi;
      acc[j].x -= dx * fj;
      acc[j].y -= dy * fj;
      acc[j].z -= dz * fj;
    }
  }
  return acc;
}

// ────────────────────────────────────────────────────────────────────────────
//  Scenario presets — deterministic initial conditions
// ────────────────────────────────────────────────────────────────────────────

/**
 * Return an array of {pos, vel, mass} objects for a named scenario.
 * The `bodies` argument is a count hint; presets may enforce a specific count.
 */
export function buildPresetSystem(preset, bodies = 5) {
  if (preset === 'threebody') {
    // Classic three-body chaos starting near the figure-eight unstable point
    return [
      { pos: [ 2.0, 0, 0], vel: [ 0.0, 0, 0.65], mass: 1.0 },
      { pos: [-2.0, 0, 0], vel: [ 0.0, 0,-0.65], mass: 1.0 },
      { pos: [ 0.0, 0, 0.2], vel: [ 0.0, 0, 0], mass: 1.0 },
    ];
  }
  if (preset === 'resonance') {
    // Central heavy body + 3 planets in 2:1 / 3:2 resonance ratios
    const out = [{ pos: [0, 0, 0], vel: [0, 0, 0], mass: 40 }];
    const radii = [5, 7.94, 10.4]; // ratios ≈ 1 : 2^(2/3) : 2 (period ratios)
    for (let i = 0; i < 3; i++) {
      const r = radii[i];
      const v = Math.sqrt(40 / r);
      const theta = i * 0.8;
      out.push({
        pos: [r * Math.cos(theta), 0, r * Math.sin(theta)],
        vel: [-v * Math.sin(theta), 0, v * Math.cos(theta)],
        mass: 0.3 + i * 0.1,
      });
    }
    return out;
  }
  if (preset === 'nearmiss') {
    // Two orbits on collision course
    return [
      { pos: [-6, 0, -2], vel: [ 0.9, 0, 0.15], mass: 3 },
      { pos: [ 6, 0,  2], vel: [-0.9, 0,-0.15], mass: 3 },
      { pos: [ 0, 0, 9], vel: [ 0.2, 0, 0], mass: 0.5 },
    ];
  }
  // Default: stable circular orbits distributed around a central mass
  const out = [{ pos: [0, 0, 0], vel: [0, 0, 0], mass: 20 }];
  const n = Math.max(2, bodies - 1);
  for (let i = 0; i < n; i++) {
    const r = 4 + i * 2.5;
    const theta = (i / n) * Math.PI * 2;
    const v = Math.sqrt(20 / r);
    out.push({
      pos: [r * Math.cos(theta), 0, r * Math.sin(theta)],
      vel: [-v * Math.sin(theta), 0, v * Math.cos(theta)],
      mass: 0.3 + Math.random() * 0.5,
    });
  }
  return out;
}

export const REALITY_PRESETS = [
  { key: 'stable',     label: 'Stable System',  desc: 'Closed orbits around a central mass.' },
  { key: 'threebody',  label: 'Three-Body',     desc: 'Classically unsolvable — chaotic divergence.' },
  { key: 'resonance',  label: 'Resonant',       desc: 'Planets in 2:1 / 3:2 period ratios.' },
  { key: 'nearmiss',   label: 'Near-Collision', desc: 'Objects on intersecting trajectories.' },
];

// ────────────────────────────────────────────────────────────────────────────
//  Divergence explanation — reactive text based on current state
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns {tone, lines[]} explaining WHY the system is stable / diverging /
 * chaotic. Each line is a short sentence; UI colors them by tone.
 */
export function explainDivergence({ divergence, params, philosophy }) {
  const reasons = [];

  // Tone derived from divergence magnitude
  let tone;
  if (divergence < 0.01) tone = 'success';
  else if (divergence < 0.5) tone = 'amber';
  else tone = 'danger';

  // Deterministic case
  if (philosophy === 'deterministic') {
    reasons.push('Pure Newtonian mechanics — no stochastic term.');
    if (params.gravityExponent !== 2) {
      reasons.push(`Force law F ∝ 1/r^${params.gravityExponent.toFixed(2)} — violates inverse-square, breaks Bertrand's theorem (orbits not guaranteed closed).`);
    }
    if (params.dissipation > 0) {
      reasons.push(`Energy dissipation ${(params.dissipation * 100).toFixed(1)}%/frame — system is not energy-conserving.`);
    }
    return { tone, lines: reasons.length ? reasons : ['System evolves deterministically from initial conditions.'] };
  }

  // Probabilistic case
  if (philosophy === 'probabilistic') {
    reasons.push('Gaussian noise added to velocities each frame — outcomes become statistical.');
    reasons.push('Twin universes slowly diverge due to accumulating micro-jitter.');
    if (divergence > 0.3) reasons.push('Divergence growing approximately linearly — typical random-walk behavior.');
    return { tone, lines: reasons };
  }

  // Chaos case
  if (philosophy === 'chaos') {
    if (params.gravityExponent !== 2) {
      reasons.push(`Non-Newtonian exponent (1/r^${params.gravityExponent.toFixed(2)}) — Bertrand's theorem violated.`);
    }
    if (params.chaosIntensity > 0.6) {
      reasons.push(`High chaos intensity (${(params.chaosIntensity * 100).toFixed(0)}%) — perturbations drive exponential separation.`);
    } else if (params.chaosIntensity > 0) {
      reasons.push(`Moderate chaos intensity — slow Lyapunov growth.`);
    }
    if (params.G > 1.8) reasons.push('High gravitational constant — close encounters amplify sensitivity.');
    if (divergence > 1.5) reasons.push('Trajectories effectively independent — prediction horizon exceeded.');
    if (reasons.length === 0) reasons.push('System is chaotic: tiny input differences lead to exponentially different futures.');
    return { tone, lines: reasons };
  }

  return { tone, lines: ['Philosophy not recognized.'] };
}

// ────────────────────────────────────────────────────────────────────────────
//  Simple forward prediction — used to draw a ghost trajectory
// ────────────────────────────────────────────────────────────────────────────

/**
 * Integrate body[idx] forward `steps` frames under deterministic Newton
 * physics starting from the system's current state. Returns an array of
 * [x, y, z] points for drawing a predicted path.
 *
 * Used to show "what would happen WITHOUT the chaotic perturbations".
 * Because chaotic systems diverge from this baseline, the gap between
 * predicted and actual path is a visual Lyapunov indicator.
 */
export function predictTrajectory(system, idx, G, steps = 120, dt = 0.03) {
  const clones = system.map((b) => ({
    pos: [b.pos[0], b.pos[1], b.pos[2]],
    vel: [b.vel[0], b.vel[1], b.vel[2]],
    mass: b.mass,
  }));
  const out = [];
  for (let s = 0; s < steps; s++) {
    const fmt = clones.map((b) => ({ x: b.pos[0], y: b.pos[1], z: b.pos[2], mass: b.mass }));
    const acc = nbodyVariableAccel(fmt, G, 2, 0.25);
    for (let i = 0; i < clones.length; i++) {
      clones[i].vel[0] += acc[i].x * dt;
      clones[i].vel[1] += acc[i].y * dt;
      clones[i].vel[2] += acc[i].z * dt;
      clones[i].pos[0] += clones[i].vel[0] * dt;
      clones[i].pos[1] += clones[i].vel[1] * dt;
      clones[i].pos[2] += clones[i].vel[2] * dt;
    }
    out.push([clones[idx].pos[0], clones[idx].pos[1], clones[idx].pos[2]]);
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
//  Reality signature — classify the universe's dynamic identity
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given live system stats, return a {label, tone} identity.
 * Priority: reality-breaking events first, then drift/collision composite.
 */
export function computeRealitySignature({
  divergence, energy, prevEnergy, collisions, bodyCount,
  params, philosophy, escapedCount = 0,
}) {
  const energyDrift = prevEnergy ? Math.abs(energy - prevEnergy) / (Math.abs(prevEnergy) + 1e-9) : 0;

  // Explosive / runaway
  if (escapedCount >= 2) {
    return { label: 'HIGH ENERGY EXPLOSIVE SYSTEM', tone: 'danger' };
  }
  // Dissipative
  if (params.dissipation > 0.015) {
    return { label: 'DISSIPATIVE COLLAPSE UNIVERSE', tone: 'amber' };
  }
  // Collision-heavy
  if (collisions >= 2) {
    return { label: 'FRAGMENTING SYSTEM', tone: 'amber' };
  }
  // Non-Newtonian
  if (params.gravityExponent > 2.4) {
    return { label: 'STRONG-FORCE COLLAPSING UNIVERSE', tone: 'danger' };
  }
  if (params.gravityExponent < 1.7) {
    return { label: 'WEAK-FORCE DRIFTING UNIVERSE', tone: 'amber' };
  }
  // Philosophy + divergence driven
  if (philosophy === 'chaos' || divergence > 1.5) {
    return { label: 'CHAOTIC DIVERGENT SYSTEM', tone: 'danger' };
  }
  if (philosophy === 'probabilistic' && divergence > 0.3) {
    return { label: 'STOCHASTIC DRIFTING SYSTEM', tone: 'amber' };
  }
  if (energyDrift > 0.25) {
    return { label: 'ENERGY-UNSTABLE SYSTEM', tone: 'amber' };
  }
  if (divergence < 0.05 && energyDrift < 0.03) {
    return { label: 'STABLE ORBITAL SYSTEM', tone: 'success' };
  }
  return { label: 'QUASI-STABLE SYSTEM', tone: 'cyan' };
}

// ────────────────────────────────────────────────────────────────────────────
//  Fate prediction — project trends into short-term future outcomes
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns an array of short future-projection strings. Designed to be
 * refreshed every couple of seconds — reads TRENDS from a history buffer.
 *
 *   divHistory: recent divergence samples (last ~10s)
 *   energyHistory: recent total-energy samples
 *   closestApproach: distance between closest pair currently
 */
export function predictFate({ divHistory, energyHistory, closestApproach, params, philosophy, bodyCount }) {
  const out = [];
  const dn = divHistory.length;
  const en = energyHistory.length;

  if (dn >= 4) {
    const firstDiv = divHistory[0];
    const lastDiv = divHistory[dn - 1];
    const divTrend = lastDiv - firstDiv;
    if (divTrend > 0.3)       out.push('Orbit instability increasing rapidly.');
    else if (divTrend > 0.05) out.push('Orbit instability slowly increasing.');
    else if (divTrend < -0.1) out.push('System settling toward equilibrium.');
  }

  if (en >= 4) {
    const firstE = energyHistory[0];
    const lastE  = energyHistory[en - 1];
    const delta  = (lastE - firstE) / (Math.abs(firstE) + 1e-9);
    if (delta > 0.2)       out.push('Total energy rising — injecting kinetic energy into the system.');
    else if (delta < -0.2) out.push('Total energy decaying — approaching bound state.');
  }

  // Collision risk from closest approach
  if (closestApproach < 0.6 && bodyCount > 1) {
    const etaSeconds = Math.max(3, Math.floor(closestApproach * 120));
    out.push(`Collision likely in ~${etaSeconds}s.`);
  } else if (closestApproach < 1.5) {
    out.push('Close encounter ahead — expect orbit perturbation.');
  }

  // Dissipation fate
  if (params.dissipation > 0.015) {
    out.push('Dissipation dominant — all orbits will spiral inward.');
  }

  // Exponent-driven fate
  if (params.gravityExponent > 2.3) {
    out.push('Force law too strong — orbits cannot remain closed (Bertrand).');
  } else if (params.gravityExponent < 1.8) {
    out.push('Force law too weak — bodies drift apart over long horizon.');
  }

  // Chaos horizon
  if (philosophy === 'chaos' && dn >= 2) {
    const lastDiv = divHistory[dn - 1];
    if (lastDiv > 2) out.push('Prediction horizon exceeded — future is no longer knowable.');
  }

  if (out.length === 0) out.push('System evolution within normal bounds.');
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
//  Event detection — identify discrete physics events each frame
// ────────────────────────────────────────────────────────────────────────────

/**
 * Pure function: inspects system state and returns array of event descriptors
 * {kind, text, severity}. Caller dedupes against recently-fired events so
 * we don't spam the notification feed.
 *
 *   prevState: snapshot from last check (bodies' radii etc.)
 */
export function detectEvents({ bodies, prevRadii = [], params, philosophy }) {
  const events = [];
  if (!bodies || bodies.length === 0) return events;

  // Compute current radii and closest-pair distance
  const radii = bodies.map((b) => Math.hypot(b.pos[0], b.pos[1], b.pos[2]));
  let closestPairDist = Infinity;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[i].pos[0] - bodies[j].pos[0];
      const dy = bodies[i].pos[1] - bodies[j].pos[1];
      const dz = bodies[i].pos[2] - bodies[j].pos[2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < closestPairDist) closestPairDist = d;
    }
  }

  // Orbit decay — body's radius halved over recent comparison
  for (let i = 1; i < bodies.length; i++) {
    if (prevRadii[i] && prevRadii[i] > 3 && radii[i] < prevRadii[i] * 0.5) {
      events.push({ kind: 'decay', text: `Body ${i}: orbit decayed rapidly`, severity: 'warn' });
    }
  }

  // Escape velocity — body moved past a large radius
  for (let i = 1; i < bodies.length; i++) {
    if (radii[i] > 40 && prevRadii[i] && prevRadii[i] <= 40) {
      events.push({ kind: 'escape', text: `Body ${i}: escape velocity achieved`, severity: 'info' });
    }
  }

  // Collision imminent
  if (closestPairDist < 0.6) {
    events.push({ kind: 'collision', text: 'Collision imminent', severity: 'danger' });
  }

  // Resonance — simplified: pair of bodies with period ratio near 3:2 or 2:1
  // Using radii as proxy for period (T ∝ r^1.5)
  for (let i = 1; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (radii[i] < 0.5 || radii[j] < 0.5) continue;
      const T1 = Math.pow(radii[i], 1.5);
      const T2 = Math.pow(radii[j], 1.5);
      const ratio = Math.max(T1, T2) / Math.min(T1, T2);
      for (const [rNum, rDen, label] of [[2,1,'2:1'],[3,2,'3:2'],[4,3,'4:3']]) {
        const target = rNum / rDen;
        if (Math.abs(ratio - target) / target < 0.03) {
          events.push({ kind: 'resonance', text: `Bodies ${i} & ${j}: ${label} resonance`, severity: 'info' });
          break;
        }
      }
    }
  }

  return { events, radii, closestPairDist };
}

// ────────────────────────────────────────────────────────────────────────────
//  Cause → Effect annotations
// ────────────────────────────────────────────────────────────────────────────

/**
 * Explain what a user-driven parameter change will do to the system.
 * Called from React when a slider moves; returns one concise sentence.
 */
export function explainChange(paramName, oldVal, newVal) {
  const delta = newVal - oldVal;
  const up = delta > 0;
  if (paramName === 'G') {
    return up
      ? '↑ Gravity → stronger attraction → orbits tighten and accelerate.'
      : '↓ Gravity → weaker attraction → orbits loosen and slow down.';
  }
  if (paramName === 'gravityExponent') {
    if (Math.abs(newVal - 2) < 0.05) return '≈ Newtonian — orbits guaranteed closed.';
    return up
      ? `↑ Force exponent (1/r^${newVal.toFixed(2)}) → falls off steeper → strong pull at short range, weak at long range.`
      : `↓ Force exponent (1/r^${newVal.toFixed(2)}) → falls off slower → long-range attraction dominates.`;
  }
  if (paramName === 'dissipation') {
    return up
      ? '↑ Dissipation → kinetic energy leaks → orbits spiral inward.'
      : '↓ Dissipation → energy conserved → orbits stabilize.';
  }
  if (paramName === 'chaosIntensity') {
    return up
      ? '↑ Chaos → stronger perturbations → divergence accelerates.'
      : '↓ Chaos → calmer perturbations → predictability improves.';
  }
  if (paramName === 'timeScale') {
    return up ? '↑ Time scale → simulation accelerates.' : '↓ Time scale → motion slows.';
  }
  if (paramName === 'timeDirection') {
    return newVal < 0 ? '◄ Time reversed — system rewinds its own history.' : '► Time forward — normal evolution.';
  }
  if (paramName === 'bodies') {
    return up ? '↑ More bodies → richer dynamics, higher chance of chaos.' : '↓ Fewer bodies → simpler dynamics.';
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
//  Reality DNA — serialize / parse compact config string
// ────────────────────────────────────────────────────────────────────────────

const DNA_FIELDS = [
  ['G', 'G', 2],
  ['gravityExponent', 'exp', 2],
  ['c', 'c', 2],
  ['chaosIntensity', 'chaos', 2],
  ['dissipation', 'diss', 3],
  ['forceDelay', 'delay', 2],
  ['bodies', 'bodies', 0],
  ['timeScale', 'ts', 2],
  ['preset', 'preset', null],
  ['multiverse', 'mv', 0],
];

/** Serialize the reality state + philosophy into a compact one-liner. */
export function serializeDNA(reality, philosophy) {
  const parts = [`phil=${philosophy}`];
  for (const [key, short, decimals] of DNA_FIELDS) {
    const v = reality[key];
    if (v === undefined || v === null) continue;
    if (decimals === null) parts.push(`${short}=${v}`);
    else if (decimals === 0) parts.push(`${short}=${v|0}`);
    else parts.push(`${short}=${Number(v).toFixed(decimals)}`);
  }
  return parts.join(' | ');
}

/** Parse a DNA string back into {reality patch, philosophy}. Tolerant of whitespace. */
export function parseDNA(dna) {
  const out = { reality: {}, philosophy: null };
  const parts = dna.split(/[|;,]/).map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    const [rawKey, rawVal] = part.split('=').map((s) => s.trim());
    if (!rawKey || rawVal === undefined) continue;
    if (rawKey === 'phil' || rawKey === 'philosophy') {
      out.philosophy = rawVal;
      continue;
    }
    // Find the field
    const field = DNA_FIELDS.find((f) => f[1] === rawKey || f[0] === rawKey);
    if (!field) continue;
    const [key, , decimals] = field;
    if (decimals === null) out.reality[key] = rawVal;
    else {
      const n = Number(rawVal);
      if (!Number.isNaN(n)) out.reality[key] = n;
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
//  Single-body inspection metrics
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given a selected body + the rest of the system, return kinematic and
 * energetic read-outs for the inspection panel.
 */
export function inspectBody(body, allBodies, G) {
  const vel2 = body.vel[0] ** 2 + body.vel[1] ** 2 + body.vel[2] ** 2;
  const speed = Math.sqrt(vel2);
  const kinetic = 0.5 * body.mass * vel2;
  let potential = 0;
  for (const other of allBodies) {
    if (other === body || !other.alive) continue;
    const dx = body.pos[0] - other.pos[0];
    const dy = body.pos[1] - other.pos[1];
    const dz = body.pos[2] - other.pos[2];
    const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
    potential -= (G * body.mass * other.mass) / r;
  }
  const total = kinetic + potential;
  // Stability score: bound (E<0) + low |E|/m = stable; E>0 means escape
  let stability;
  if (total > 0) stability = 'ESCAPING';
  else if (Math.abs(total) / body.mass > 10) stability = 'TIGHTLY BOUND';
  else if (Math.abs(total) / body.mass > 1) stability = 'BOUND';
  else stability = 'LOOSELY BOUND';
  const radius = Math.hypot(body.pos[0], body.pos[1], body.pos[2]);
  return { speed, kinetic, potential, total, stability, radius };
}
