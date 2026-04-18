<div align="center">

# 🌌 COSMIC SIMULATION ENGINE

### *Design reality. Break physics. Watch what happens.*

**An interactive, real-time simulation sandbox spanning five scales of physics** — from quantum superposition to the large-scale structure of the cosmos. Every slider feeds a live engine. No pre-baked scenarios, no fake loops. Change a value and watch reality respond.

![React](https://img.shields.io/badge/React-18.3-61dafb?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5.4-646cff?style=for-the-badge&logo=vite&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-0.160-000000?style=for-the-badge&logo=three.js&logoColor=white)
![TypeScript Ready](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=for-the-badge&logo=tailwindcss&logoColor=white)
![Redux](https://img.shields.io/badge/Redux_Toolkit-2.2-764abc?style=for-the-badge&logo=redux&logoColor=white)

![Status](https://img.shields.io/badge/Status-v1.0_Online-58f5a0?style=flat-square)
![FPS](https://img.shields.io/badge/Performance-60%2B_FPS-00e5ff?style=flat-square)
![Modules](https://img.shields.io/badge/Modules-5_Active-ff2dd1?style=flat-square)
![WebGL](https://img.shields.io/badge/WebGL-GPU_Accelerated-a855f7?style=flat-square)

---

</div>

## ⚡ Quick Start

```bash
npm install && npm run dev
```

Open `http://localhost:5173` — the landing page loads first, then `/lab` opens the full simulation environment.

```bash
npm run build    # production bundle
npm run preview  # preview the build locally
```

---

## 🧭 Routes

| Path | Purpose |
|------|---------|
| **`/`** | Landing page — hero, modules overview, live planet preview, CTA |
| **`/lab`** | Full simulation environment with all five modules |
| **`/lab?module=planet`** | Deep-link directly into a specific module |

The landing chunk is lazy-loaded — going straight to `/lab` skips its download entirely.

> **Production hosting**: this uses `BrowserRouter`, so your host must serve `index.html` for unknown paths (so refreshing `/lab` works).
> - **Netlify** → add `_redirects` with `/* /index.html 200`
> - **Vercel** → add a rewrite to `/index.html` in `vercel.json`
> - **Nginx** → `try_files $uri /index.html;`

---

## 🪐 The Five Modules

<table>
<tr>
<td width="50" align="center">🌍</td>
<td>

### Planet Builder
Procedurally displaced terrain sphere with real mountain geometry (no UV seams — all noise computed in 3D object space). Separate water mesh with fresnel specular + animated wave normals. Shader-based clouds rotating independently. Star-color-driven day-side tinting. Procedural night-side city lights gated by habitability. LOD micro-detail kicks in when camera approaches.

**Physics** — Stefan–Boltzmann equilibrium temperature, log-forcing greenhouse model, habitability classifier.

</td>
</tr>
<tr>
<td align="center">☀️</td>
<td>

### Solar System
N-body leapfrog integrator (3 substeps). Seven-stage stellar lifecycle with smooth interpolation (nebula → protostar → main sequence → giant → supernova → white dwarf → black hole). Multi-star barycenter orbits. Clustered asteroid belts with Kirkwood gaps. Click-to-focus bodies. Observation modes. Gravity field visualization. Habitable zone ring. Supernova cinematic + collision merging with momentum conservation.

**Physics** — Leapfrog KDK symplectic integrator, black-body spectrum, Keplerian initialization.

</td>
</tr>
<tr>
<td align="center">🌌</td>
<td>

### Universe Builder
3500+ particle cosmos with Hubble-like expansion competing against gravity. Cosmic web with seeded nodes + filaments + galaxy sprites (spiral/elliptical). Dark matter halos. CMB backdrop shader. Big Bang cinematic. Expansion fabric that visibly stretches. Fate classifier emits narrative lines for Heat Death / Big Crunch / Open Expansion / Steady-State.

**Physics** — Qualitative Friedmann-like expansion, N-body gravity, epoch classifier.

</td>
</tr>
<tr>
<td align="center">⚛️</td>
<td>

### Quantum Playground
Advanced wavefunction shader encoding amplitude, phase, and probability density simultaneously. Configurable N-slit apparatus (1–5 slits) with exact analytical intensity formula. Superposition mode with ghost trajectories. Delayed-choice retroactive collapse. Entanglement with paired particles + glowing link. Uncertainty-principle slider. Quantum tunneling with transmission probability. Three render modes: particle / wave / probability cloud. Three interpretation lenses: Copenhagen / Many-Worlds / Pilot Wave.

**Physics** — `sinc²(x) × (sin(Nα)/sin(α))²` N-slit intensity, rejection sampling, tunnel exp(−2κL).

</td>
</tr>
<tr>
<td align="center">🔮</td>
<td>

### Physics Engine *(Reality Lab)*
The highest abstraction layer — a "fundamental laws sandbox". Three distinct simulation modes with visually distinct identities (deterministic = clean trails / probabilistic = soft flicker / chaos = glitchy pulsing). Variable-exponent force law (1/r^x breaks Newton). Time reverse. Energy dissipation. Twin universe compare with colored divergence lines. Up to 4 parallel multiverse clones. Click-to-inspect any body. Reality Signature auto-classifier. Fate prediction engine. Event detection system (collisions, resonances, orbit decay). DNA serialization for sharing configs. "Destabilize Reality" button. Cinematic auto-camera. **Realistic entity shaders** — rocky bodies with craters, gas giants with banded turbulence, stars with plasma convection + corona, high-energy bodies with hue-cycling aura.

**Physics** — Configurable `F ∝ 1/r^exp`, Lyapunov divergence tracking, total energy bookkeeping.

</td>
</tr>
</table>

---

## ⌨️ Keyboard Shortcuts

<table>
<tr><td><kbd>Space</kbd></td><td>Pause / resume the active simulation</td></tr>
<tr><td><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> <kbd>5</kbd></td><td>Jump to a specific module</td></tr>
<tr><td><kbd>R</kbd></td><td>Reset all parameters to defaults</td></tr>
</table>

---

## 🔗 State Sharing

Every parameter, toggle, preset, and philosophy is encoded into the URL when you press **SHARE** in the top bar. Drop the link anywhere — opening it restores the exact configuration.

State is also automatically persisted to `localStorage` between sessions, and the Physics Engine module can serialize its current state into a compact **Reality DNA** string:

```
phil=chaos | G=1.20 | exp=2.25 | chaos=0.40 | diss=0.002 | bodies=5 | preset=threebody
```

Copy it, share it, paste it back in — the universe reconstructs itself.

---

## 🏗️ Project Layout

```
src/
├── main.jsx                          React entry + Redux Provider
├── App.jsx                           Router — lazy HomePage at "/" + LabApp at "/lab"
├── LabApp.jsx                        Simulation shell (TopBar + module + StatusBar + shortcuts)
├── index.css                         Tailwind + glassmorphism base + neon palette
│
├── components/
│   ├── TopBar.jsx                    Nav tabs + Share / Reset
│   ├── StatusBar.jsx                 FPS + system badges
│   └── UI.jsx                        Slider, Toggle, Pill, Badge, Meter, Stat, Section
│
├── hooks/
│   ├── useModuleScene.js             Shared Three.js lifecycle + orbit controls
│   └── useThreeScene.js              Low-level scene hook
│
├── modules/
│   ├── home/                         Landing page (lazy-loaded, ~62 KB gzipped)
│   │   ├── HomePage.jsx                Section composer with parallax stars
│   │   ├── components/
│   │   │   ├── HeroSolarSystem.jsx     Background Three.js planets
│   │   │   ├── ControlButton.jsx       Primary / ghost buttons
│   │   │   ├── PortalTransition.jsx    Warp-to-lab overlay
│   │   │   ├── ReactiveBackdrop.jsx    Cursor-tracking depth layer
│   │   │   └── ModuleIcons.jsx         5 custom SVG icons
│   │   └── sections/
│   │       ├── Hero.jsx                Cursor-reactive glow + staggered entry
│   │       ├── Preview.jsx             Live rotating planet demo
│   │       ├── WhatMakesDifferent.jsx  Three value props
│   │       ├── Modules.jsx             5 glass tilt cards
│   │       ├── FeatureDeepDive.jsx     Animated mini-diagrams
│   │       ├── Experience.jsx          Use-case strip
│   │       ├── TechPerformance.jsx     Stat cards
│   │       ├── Philosophy.jsx          Quiet centered hook
│   │       ├── CTA.jsx                 Final call-to-action
│   │       └── Footer.jsx              Brand + meta links
│   │
│   ├── planet/       PlanetModule.jsx, planetScene.js, PlanetIcons.jsx, AnalyticsCharts.jsx
│   ├── solar/        SolarModule.jsx, solarScene.js, solarPhysics.js
│   ├── universe/     UniverseModule.jsx, universeScene.js, universePhysics.js
│   ├── quantum/      QuantumModule.jsx, quantumScene.js, quantumPhysics.js
│   └── simulator/    RealityModule.jsx, realityScene.js, realityPhysics.js
│
├── physics/engine.js                 Shared pure physics — gravity, Stefan-Boltzmann,
│                                     N-body, leapfrog, blackbody RGB
├── store/
│   ├── index.js                      Redux store + localStorage middleware
│   └── universeSlice.js              All module state + deep-merge migrations
└── utils/
    ├── urlState.js                   Base64 URL encode/decode
    └── helpers.js                    fmt, fmtExp formatters
```

---

## 🔬 Physics Reference

The formulas in `src/physics/engine.js` are intentionally real-valued and named so they can be unit-tested:

| Function | Formula | Purpose |
|----------|---------|---------|
| `equilibriumTemp` | `T_eq = (L(1-A) / 16πσd²)^¼` | Stefan-Boltzmann planet temperature |
| `greenhouseWarming` | Log-forcing model scaled to Earth's 33 K baseline | CO₂ greenhouse effect |
| `nbodyAccel` | Pairwise `F = Gm₁m₂/r²` with Plummer softening | N-body gravitational acceleration |
| `leapfrogStep` | Symplectic kick-drift-kick integrator | Energy-conserving time step |
| `blackbodyRGB` | Planckian locus approximation | Star temperature → RGB |

The Physics Engine module extends this with `nbodyVariableAccel` for configurable `F ∝ 1/r^exp`. The quantum module uses the exact analytical N-slit intensity formula. Classifier thresholds and event-detection heuristics are documented inline.

---

## 🎨 Tech Stack

<table>
<tr>
<td valign="top" width="50%">

**Frontend**
- React 18.3 — concurrent rendering
- React Router 6 — `/` + `/lab` with query-param deep links
- Vite 5.4 — dev server + production build
- Tailwind CSS 3.4 — utility styling + custom neon palette
- Framer Motion — entry animations + transitions

</td>
<td valign="top" width="50%">

**Engine**
- Three.js 0.160 — all 3D rendering
- Custom GLSL shaders — terrain, water, atmosphere, quantum wavefunctions, body types
- Redux Toolkit 2.2 — state + middleware
- No external UI library — every component hand-built

</td>
</tr>
</table>

---

## ⚡ Performance

Built for **60+ FPS** in your browser.

- **GPU-first rendering** — noise, displacement, waves, plasma, wavefunctions all computed in shaders, not JavaScript.
- **No texture uploads** — everything is procedural. 0 image assets.
- **Pool-based particle systems** — bodies, events, ghosts, flickers all use reusable pools.
- **IntersectionObserver gating** — scenes pause when off-screen.
- **240 Hz physics** with 4× sub-stepping under 60 Hz render — stable at high time scales.
- **Deep-merge state migrations** — localStorage schema changes never break saved states.

---

## 🎯 Design Philosophy

Most physics demos show you a thing. This one hands you the levers.

- **Every slider is a lever** — moving it mutates the live engine immediately.
- **Every visual is derived** — star colors from Planck spectrum, atmosphere hues from gas composition, signature labels from live metrics.
- **The UI is an instrument panel** — glassmorphism panels, neon accents, registration marks, mono type — built to feel like you're operating a real piece of equipment.
- **Breakage is encouraged** — "Destabilize Reality", "Supernova", "Big Bang", non-Newtonian exponents. The engine recovers gracefully from any input.

<div align="center">

---

**You don't learn physics here. You control it.**

[![Enter Simulation](https://cosmic-engine-simulator.vercel.app/)

</div>
