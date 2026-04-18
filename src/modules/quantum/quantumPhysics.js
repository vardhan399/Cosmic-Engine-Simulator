// Quantum module — pure physics & reasoning helpers.
// Kept isolated from rendering so the scene file stays focused on Three.js.

// ────────────────────────────────────────────────────────────────────────────
//  N-slit interference pattern
// ────────────────────────────────────────────────────────────────────────────

/**
 * Compute the intensity (0..1) at screen position x for an N-slit setup.
 *   slitCount: number of slits (1..5)
 *   slitSep:   spacing between adjacent slits (sim units)
 *   slitWidth: width of each slit (controls single-slit envelope)
 *   lambda:    wavelength
 *   L:         slit-to-screen distance
 *
 *   I(x) = sinc²(π·x·w / (λ·L)) × (sin(N·α) / sin(α))²   where α = π·x·d / (λ·L)
 */
export function nSlitIntensity(x, { slitCount = 2, slitSep = 0.4, slitWidth = 0.25, lambda = 0.1, L = 16 }) {
  const N = Math.max(1, slitCount);
  const envArg = (Math.PI * x * slitWidth) / (lambda * L);
  const envelope = Math.abs(envArg) < 1e-6 ? 1 : Math.sin(envArg) / envArg;
  const env2 = envelope * envelope;
  if (N === 1) return env2;
  const alpha = (Math.PI * x * slitSep) / (lambda * L);
  const sinAlpha = Math.sin(alpha);
  const interf = Math.abs(sinAlpha) < 1e-6
    ? N * N
    : Math.pow(Math.sin(N * alpha) / sinAlpha, 2);
  // Normalize interference by N² so value stays in [0..1]
  return env2 * (interf / (N * N));
}

// ────────────────────────────────────────────────────────────────────────────
//  Rejection-sampled target on the screen
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns a screen-x sample drawn from the N-slit intensity distribution,
 * with optional mixing toward a collapsed delta (observer measured which slit).
 *   observerMix: 0 = pure wave (full interference), 1 = full collapse to slit image
 *   slitCenters: array of slit x-positions (used when observer mix > 0)
 */
export function sampleScreenX({ screenWidth = 18, maxIter = 60, observerMix = 0, slitCenters = [0], ...params }) {
  // Collapsed branch: pick a slit, smear normally around its geometric image
  if (observerMix > 0.999) {
    const c = slitCenters[Math.floor(Math.random() * slitCenters.length)];
    return c * 1.5 + (Math.random() - 0.5) * 1.2;
  }
  // Rejection-sample from intensity
  for (let i = 0; i < maxIter; i++) {
    const cand = (Math.random() - 0.5) * screenWidth;
    const p = nSlitIntensity(cand, params);
    if (Math.random() < p) {
      if (observerMix <= 0.001) return cand;
      // Interpolate between wave-sample and collapsed-sample
      const c = slitCenters[Math.floor(Math.random() * slitCenters.length)];
      const collapsed = c * 1.5 + (Math.random() - 0.5) * 1.2;
      return cand * (1 - observerMix) + collapsed * observerMix;
    }
  }
  return (Math.random() - 0.5) * screenWidth;
}

// ────────────────────────────────────────────────────────────────────────────
//  Slit geometry helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given slit count and separation, return array of x positions for slit centers.
 * Slits are centered on x=0 and evenly distributed.
 */
export function slitCenters(slitCount, slitSep) {
  const N = Math.max(1, Math.min(5, slitCount));
  const arr = [];
  const offset = (N - 1) / 2;
  for (let i = 0; i < N; i++) arr.push((i - offset) * slitSep * 2);
  return arr;
}

// ────────────────────────────────────────────────────────────────────────────
//  Quantum tunneling — probability of transmission through a rectangular barrier
// ────────────────────────────────────────────────────────────────────────────

/**
 * Transmission coefficient for a simple rectangular barrier.
 * barrierHeight: 0..1 (mapped to ratio V/E)
 *
 * T ≈ exp(-2 * κ * L)  where κ grows with barrier strength.
 * Returned as a probability in [0..1].
 */
export function tunnelProbability(barrierHeight) {
  const kappa = 2.5 * Math.max(0, barrierHeight);
  return Math.exp(-kappa);
}

// ────────────────────────────────────────────────────────────────────────────
//  Interpretation meta
// ────────────────────────────────────────────────────────────────────────────

export const INTERPRETATIONS = {
  copenhagen: {
    label: 'Copenhagen',
    summary: 'Wavefunction collapses on measurement. Reality is defined by observation.',
    visualCue: 'Emphasizes collapse — measured particles pulse violet.',
  },
  manyworlds: {
    label: 'Many Worlds',
    summary: 'No collapse. Each outcome branches into a parallel universe.',
    visualCue: 'Ghost paths persist after measurement — all branches shown faintly.',
  },
  pilot: {
    label: 'Pilot Wave',
    summary: 'Particles follow deterministic trajectories guided by a physical wave.',
    visualCue: 'Wavefunction stays visible even during particle trajectories.',
  },
};

// ────────────────────────────────────────────────────────────────────────────
//  Smart explanation — reactive text based on state and recent deltas
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns an array of {kind, text} insights. Panel renders them with colored bars.
 *
 * kinds:
 *   effect       — what the user just caused
 *   phenomenon   — description of the visible pattern
 *   meta         — interpretation commentary
 */
export function explainQuantum({ params, totalHits }) {
  const out = [];

  // Primary phenomenon
  if (params.observer && !params.superposition) {
    out.push({ kind: 'effect', text: 'Detector engaged — wavefunction collapsed. Interference pattern replaced by two-slit geometric image.' });
  } else if (params.superposition) {
    out.push({ kind: 'phenomenon', text: 'Superposition active — particle occupies multiple trajectories simultaneously until observation.' });
  } else if (params.slitCount === 1) {
    out.push({ kind: 'phenomenon', text: 'Single slit — no interference, only diffraction envelope.' });
  } else {
    out.push({ kind: 'phenomenon', text: `${params.slitCount}-slit diffraction — ${params.slitCount - 1} dark fringes between each principal maximum.` });
  }

  // Parameter-driven details
  if (params.wavelength > 0.3) {
    out.push({ kind: 'effect', text: 'Long wavelength — interference fringes widely spaced; diffraction envelope broad.' });
  } else if (params.wavelength < 0.08) {
    out.push({ kind: 'effect', text: 'Short wavelength — fringes closely packed; approaches classical behavior.' });
  }

  if (params.delayedChoice) {
    out.push({ kind: 'effect', text: 'Delayed-choice mode — detector switched after slit passage. Interference dissolves retroactively; history is defined by observation.' });
  }

  if (params.entanglement) {
    out.push({ kind: 'phenomenon', text: 'Entangled pair emitted — measuring one particle determines its partner regardless of separation.' });
  }

  if (params.tunneling) {
    const T = tunnelProbability(params.tunnelBarrier);
    out.push({ kind: 'phenomenon', text: `Tunneling active — transmission probability ≈ ${(T * 100).toFixed(1)}%. Some particles pass through a classically forbidden barrier.` });
  }

  if (params.uncertainty < 0.3) {
    out.push({ kind: 'effect', text: 'Position precision high — momentum spread broad. Trajectories fan out.' });
  } else if (params.uncertainty > 0.7) {
    out.push({ kind: 'effect', text: 'Momentum precision high — position uncertain. Particles blur at source.' });
  }

  if (params.fluctuations) {
    out.push({ kind: 'phenomenon', text: 'Vacuum fluctuations visible — virtual particle pairs briefly appear from the vacuum.' });
  }

  // Interpretation commentary
  const interp = INTERPRETATIONS[params.interpretation];
  if (interp) {
    out.push({ kind: 'meta', text: `${interp.label}: ${interp.visualCue}` });
  }

  if (totalHits > 500 && !params.observer && params.slitCount >= 2) {
    out.push({ kind: 'phenomenon', text: `${totalHits} hits recorded — interference pattern statistically resolved.` });
  }

  return out;
}
