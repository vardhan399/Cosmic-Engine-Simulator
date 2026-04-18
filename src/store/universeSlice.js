import { createSlice } from '@reduxjs/toolkit';
import { loadLocal, decodeURLState } from '../utils/urlState';

const defaultState = {
  activeModule: 'planet',
  paused: false,
  philosophy: 'probabilistic', // deterministic | probabilistic | chaos
  planet: {
    radius: 6371,
    mass: 5.972,
    o2: 21,
    co2: 0.04,
    albedo: 0.3,
    water: 71,
    ice: 10,
    distanceAU: 1.0,
    starLum: 1.0,
    moonCount: 1,
    moonOrbit: 3.5,
    moonSize: 0.25,
    clouds: 50,         // % cloud coverage
    surfaceView: false, // toggle space ↔ surface camera
    autoRotate: false,
    chaos: false,       // chaos mode flickers visuals
    timeScale: 1.0,     // animation speed multiplier
    axisTilt: 23.5,     // degrees, like Earth
    terrainHeight: 1.0, // 0..2 multiplier on mountain displacement
    cityLights: true,   // night-side lights
    rings: { enabled: false, radius: 3.2, thickness: 0.6, density: 1500 },
  },
  solar: {
    starMass: 1.0,
    starTemp: 5778,
    planetCount: 4,
    timeScale: 1.0,
    showTrails: true,
    showOrbits: true,
    chaos: false,
    multiStar: 1,              // 1 | 2 | 3
    lifecycle: 'main',         // nebula | protostar | main | giant | supernova | blackhole | whitedwarf
    eccentricity: 0.04,
    inclination: 0.03,
    collisions: true,
    evolving: false,           // autopilots the lifecycle timeline
    lifecycleProgress: 0,      // 0..1 position along full lifecycle, used when evolving
    focusBodyId: null,
    belts: [                   // up to 3 asteroid belts
      { id: 'b1', enabled: true,  radius: 22, thickness: 4, density: 700, spread: 0.6 },
      { id: 'b2', enabled: false, radius: 40, thickness: 6, density: 500, spread: 0.8 },
      { id: 'b3', enabled: false, radius: 60, thickness: 4, density: 300, spread: 0.5 },
    ],
    supernovaTrigger: 0,       // incremented by UI → scene detects change and plays explosion
    showHabitableZone: true,   // green ring around star marking habitable-temp band
    showGravityField: true,    // bent grid visualizing space curvature
    observationMode: false,    // cinematic camera autopilot
  },
  universe: {
    G: 1.0,
    expansion: 1.2,
    forceType: 'attractive',   // attractive | repulsive | none
    particles: 3500,
    darkMatter: true,
    timeScale: 1.0,
    // Cosmic structure
    clusters: 8,               // number of web nodes (galaxy clusters)
    webStrength: 1.0,          // how strongly particles cluster toward filaments
    showCosmicWeb: true,       // render node markers + filament lines
    showGalaxies: true,        // render spiral/elliptical galaxy sprites at nodes
    showDarkMatter: true,      // halo volumes around nodes
    showVelocityField: false,  // direction arrows
    showCMB: true,             // subtle background noise
    showTrails: false,         // particle history trails
    showFabric: true,          // expanding grid
    // Events
    bigBangTrigger: 0,
    // Camera
    observationMode: 'free',   // free | cluster | galaxy | zoomout
  },
  quantum: {
    observer: false,
    particles: 600,
    slitSep: 0.4,
    wavelength: 0.05,
    showWavefunction: true,
    // Advanced quantum behaviors
    superposition: false,
    delayedChoice: false,
    entanglement: false,
    entangleDist: 0.5,         // 0..1 — distance between paired particles
    uncertainty: 0.5,          // 0=precise pos, 1=precise momentum
    tunneling: false,
    tunnelBarrier: 0.5,        // height/density of barrier
    // Rendering
    renderMode: 'wave',        // particle | wave | cloud
    slitCount: 2,              // 1..5
    slitWidth: 0.25,
    // Interpretation / flavor
    interpretation: 'copenhagen', // copenhagen | manyworlds | pilot
    fluctuations: false,       // vacuum fluctuations
  },
  reality: {
    G: 1.0,
    c: 1.0,
    chaos: false,                  // legacy: enables twin system for compare
    bodies: 5,
    timeScale: 1.0,
    // Law manipulation
    gravityExponent: 2.0,          // r^(-gravityExponent) instead of r^-2
    forceDelay: 0,                 // non-instant interaction (0..0.5)
    dissipation: 0,                // velocity damping (0..0.05)
    timeDirection: 1,              // 1 = forward, -1 = reverse
    // Chaos
    chaosIntensity: 0.3,           // 0..1 — strength of perturbations
    // Features
    compareUniverses: false,       // explicit twin A/B comparison
    multiverse: 0,                 // additional parallel realities (0..4)
    showPrediction: false,         // predicted trajectory ghost line
    showHeatmap: false,            // stability heatmap overlay
    collisions: true,
    preset: 'stable',              // stable | threebody | resonance | nearmiss
    breakTrigger: 0,               // incremented by "Destabilize Reality" button
    inspectBodyId: null,           // clicked body → show inspection panel
    autoCam: false,                // cinematic auto-camera
  },
};

// Deep-merge so users with cached state from earlier versions still pick up
// any newly-added fields (e.g. planet.rings, planet.clouds, ...).
const persisted = decodeURLState() || loadLocal() || {};
const mergedPlanet = { ...defaultState.planet, ...(persisted.planet || {}) };
if (persisted.planet?.rings) {
  mergedPlanet.rings = { ...defaultState.planet.rings, ...persisted.planet.rings };
}
const mergedSolar = { ...defaultState.solar, ...(persisted.solar || {}) };
// belts: preserve user edits but keep at least the 3 default slots
if (persisted.solar?.belts && Array.isArray(persisted.solar.belts)) {
  mergedSolar.belts = defaultState.solar.belts.map((d, i) => ({
    ...d, ...(persisted.solar.belts[i] || {}),
  }));
} else {
  mergedSolar.belts = defaultState.solar.belts;
}
const mergedUniverse = { ...defaultState.universe, ...(persisted.universe || {}) };
const mergedQuantum = { ...defaultState.quantum, ...(persisted.quantum || {}) };
const mergedReality = { ...defaultState.reality, ...(persisted.reality || {}) };
const initial = { ...defaultState, ...persisted, planet: mergedPlanet, solar: mergedSolar, universe: mergedUniverse, quantum: mergedQuantum, reality: mergedReality };

const slice = createSlice({
  name: 'universe',
  initialState: initial,
  reducers: {
    setModule: (s, a) => { s.activeModule = a.payload; },
    togglePause: (s) => { s.paused = !s.paused; },
    setPhilosophy: (s, a) => { s.philosophy = a.payload; },
    updatePlanet: (s, a) => { s.planet = { ...s.planet, ...a.payload }; },
    updateSolar: (s, a) => { s.solar = { ...s.solar, ...a.payload }; },
    updateUniverse: (s, a) => { s.universe = { ...s.universe, ...a.payload }; },
    updateQuantum: (s, a) => { s.quantum = { ...s.quantum, ...a.payload }; },
    updateReality: (s, a) => { s.reality = { ...s.reality, ...a.payload }; },
    resetAll: () => defaultState,
    applyPreset: (s, a) => {
      const { module, data } = a.payload;
      s[module] = { ...s[module], ...data };
    },
  },
});

export const {
  setModule, togglePause, setPhilosophy,
  updatePlanet, updateSolar, updateUniverse, updateQuantum, updateReality,
  resetAll, applyPreset,
} = slice.actions;
export default slice.reducer;
