// Universe module — structural & semantic helpers. Pure functions only
// so they can be unit-tested and reused outside the rendering loop.

// ────────────────────────────────────────────────────────────────────────────
//  Cosmic web — nodes + filaments
// ────────────────────────────────────────────────────────────────────────────

/**
 * Generate `count` galaxy-cluster nodes distributed over a sphere of `radius`,
 * avoiding the exact center (so a preset like Big Bang starts from a visible
 * expansion) and biasing away from each other to avoid overlap. Also assigns
 * each node a "mass" (cluster weight) and a galaxy type.
 *
 * Determinism: callers can pass a seed for repeatability.
 */
export function generateNodes(count, radius, seed = 1) {
  // Simple mulberry32 seeded RNG — matches common js snippets
  let s = (seed * 2654435761) >>> 0;
  const rand = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };

  const nodes = [];
  const MIN_SEP = radius * 0.35; // filaments can be long but nodes shouldn't collide
  let attempts = 0;
  while (nodes.length < count && attempts < count * 40) {
    attempts++;
    // Clustered radial profile — more toward the middle
    const r = Math.pow(rand(), 0.55) * radius;
    const u = rand(), v = rand();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    const x = r * Math.sin(ph) * Math.cos(th);
    const y = r * Math.sin(ph) * Math.sin(th) * 0.6; // slight disc flattening
    const z = r * Math.cos(ph);

    // Reject if too close to an existing node
    let tooClose = false;
    for (const n of nodes) {
      const dx = n.x - x, dy = n.y - y, dz = n.z - z;
      if (dx * dx + dy * dy + dz * dz < MIN_SEP * MIN_SEP * 0.3) { tooClose = true; break; }
    }
    if (tooClose) continue;

    nodes.push({
      x, y, z,
      mass: 0.6 + rand() * 1.6,                  // relative cluster weight
      type: rand() < 0.55 ? 'spiral' : 'elliptical',
      age: rand(),                               // 0=young (blue), 1=old (red)
      spin: rand() * Math.PI * 2,
      tilt: (rand() - 0.5) * 0.8,
      armCount: 2 + Math.floor(rand() * 3),      // 2-4 arms for spirals
      size: 0.8 + rand() * 1.4,
    });
  }
  return nodes;
}

/**
 * Compute filament edges — each node connects to its k nearest neighbors.
 * Returns a de-duplicated list of {i, j, length, weight} pairs.
 * Weight is higher for shorter filaments (inverse distance).
 */
export function generateFilaments(nodes, kNearest = 3) {
  const edges = [];
  const seen = new Set();
  for (let i = 0; i < nodes.length; i++) {
    // Distance to every other node, sorted
    const dists = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[j].x - nodes[i].x;
      const dy = nodes[j].y - nodes[i].y;
      const dz = nodes[j].z - nodes[i].z;
      dists.push({ j, d: Math.sqrt(dx * dx + dy * dy + dz * dz) });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let k = 0; k < Math.min(kNearest, dists.length); k++) {
      const j = dists[k].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ i, j, length: dists[k].d, weight: 1 / (1 + dists[k].d * 0.05) });
    }
  }
  return edges;
}

/**
 * Find nearest node index for a given position. Used to bias particle
 * starting positions toward the cosmic web at generation time and to apply
 * clustering forces at runtime.
 */
export function nearestNodeIndex(x, y, z, nodes) {
  let best = -1, bestD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i].x - x, dy = nodes[i].y - y, dz = nodes[i].z - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// ────────────────────────────────────────────────────────────────────────────
//  Epoch — phase of universe evolution (driven by expansion × time)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Classify which of three epochs the universe is currently in.
 *   early → dense, chaotic
 *   mid   → clustering, filament formation
 *   late  → expansion dominates, voids grow
 *
 * Uses cumulative expansion + the current mean particle radius as a proxy
 * for "how stretched out" the universe has become.
 */
export function classifyEpoch({ meanDist, expansion, maxDist }) {
  if (meanDist < 15) return 'early';
  if (meanDist < 60) return 'mid';
  return 'late';
}

// ────────────────────────────────────────────────────────────────────────────
//  Cosmic fate — richer than prior version, with narrative
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns {label, explanation}. Inputs are the raw expansion / force settings
 * plus stats. Called each frame so the text reads as the current prediction.
 */
export function classifyFate({ expansion, forceType, darkMatter, meanDist, maxDist }) {
  // Repulsive or very high expansion → heat death
  if (forceType === 'repulsive' && expansion > 2) {
    return {
      label: 'HEAT DEATH',
      lines: [
        'Expansion rate exceeds gravitational binding.',
        'Galaxies drift apart; voids grow unopposed.',
        'Energy spreads toward maximum entropy.',
      ],
    };
  }
  if (expansion > 3) {
    return {
      label: 'HEAT DEATH',
      lines: [
        'Dark-energy-dominated expansion.',
        'Temperature asymptotes to zero.',
        'No new structure forms.',
      ],
    };
  }
  // Strong attraction with weak expansion → big crunch
  if (forceType === 'attractive' && expansion < 0.3) {
    return {
      label: 'BIG CRUNCH',
      lines: [
        'Gravity exceeds expansion.',
        'Matter converges toward a singular collapse.',
        'All structure merges; space contracts.',
      ],
    };
  }
  // Balanced / mixed
  if (expansion > 0.6 && expansion <= 2.5) {
    return {
      label: 'OPEN EXPANSION',
      lines: [
        'Expansion slightly exceeds attraction.',
        'Clusters remain bound; distances grow between them.',
        'Star formation continues for many epochs.',
      ],
    };
  }
  return {
    label: 'STEADY-STATE',
    lines: [
      'Gravitational attraction balances cosmic expansion.',
      'Average density is approximately conserved.',
      'Structure evolves quasi-statically.',
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Presets — realistic-ish named configurations
// ────────────────────────────────────────────────────────────────────────────

export const UNIVERSE_PRESETS = {
  'milky-way': {
    clusters: 1, particles: 4500, G: 1.4, expansion: 0.5, forceType: 'attractive',
    darkMatter: true, webStrength: 1.3, showCosmicWeb: false, showGalaxies: true,
  },
  'andromeda': {
    clusters: 1, particles: 5500, G: 1.6, expansion: 0.45, forceType: 'attractive',
    darkMatter: true, webStrength: 1.4, showCosmicWeb: false, showGalaxies: true,
  },
  'great-attractor': {
    clusters: 12, particles: 5000, G: 2.2, expansion: 0.4, forceType: 'attractive',
    darkMatter: true, webStrength: 1.8, showCosmicWeb: true, showGalaxies: true,
  },
  'cosmic-void': {
    clusters: 4, particles: 1800, G: 0.3, expansion: 3.2, forceType: 'repulsive',
    darkMatter: false, webStrength: 0.3, showCosmicWeb: true, showGalaxies: false,
  },
  'galaxy-cluster': {
    clusters: 16, particles: 6000, G: 1.8, expansion: 0.6, forceType: 'attractive',
    darkMatter: true, webStrength: 1.6, showCosmicWeb: true, showGalaxies: true,
  },
  'big-bang': {
    clusters: 10, particles: 5000, G: 1, expansion: 1.2, forceType: 'attractive',
    darkMatter: true, webStrength: 1, showCosmicWeb: true, showGalaxies: true,
  },
};
