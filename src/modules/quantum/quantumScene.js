import * as THREE from 'three';
import { sampleScreenX, slitCenters, tunnelProbability } from './quantumPhysics';

// ────────────────────────────────────────────────────────────────────────────
//  QUANTUM SCENE — interactive quantum sandbox
//
//  Layers (rendered back to front):
//    quantum field backdrop   — noise-animated plane far behind the apparatus
//    wavefunction shader mesh — animated amplitude/phase field (wave mode)
//    cloud volume mesh        — probability density rendered as point fog (cloud mode)
//    barrier geometry         — rebuilt on slit-count change; optional tunnel barrier
//    particle queue           — in-flight particles with superposition ghost paths
//    entanglement links       — paired particles joined by glowing line
//    detector screen          — texture accumulates hits over time
//    vacuum flicker sprites   — pool of short-lived pair events
// ────────────────────────────────────────────────────────────────────────────

const SCREEN_Z = -8;
const EMITTER_Z = 10;
const MAX_PARTICLES = 800;

// ─── Wavefunction shader (amplitude=Y, phase=hue, density=alpha) ─────────
const WF_VERT = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uWavelength;
  uniform float uSlitSep;
  uniform float uSlitCount;
  uniform float uSlitWidth;
  uniform float uCollapse;  // 0..1 — fade to flat when observer on
  varying vec2  vUv;
  varying float vAmp;
  varying float vPhase;
  varying float vDensity;

  void main() {
    vUv = uv;
    vec3 p = position;
    float x = position.x;
    float z = position.y;

    // Sum contribution from N slits centered on x=0
    float N = max(1.0, uSlitCount);
    float amp = 0.0;
    float phaseSum = 0.0;
    float ampSum = 0.0;
    float offset = (N - 1.0) * 0.5;
    for (int i = 0; i < 5; i++) {
      if (float(i) >= N) break;
      float sx = (float(i) - offset) * uSlitSep * 2.0;
      float d = length(vec2(x - sx, z + 8.0));
      float a = sin(d / uWavelength - uTime * 2.0) / (1.0 + d * 0.18);
      amp += a;
      ampSum += abs(a);
      phaseSum += d;
    }
    vAmp = amp;
    vPhase = phaseSum / N;
    vDensity = ampSum / N;

    // Amplitude collapses to zero when observer toggled on
    p.z = amp * 0.9 * (1.0 - uCollapse);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const WF_FRAG = /* glsl */`
  precision highp float;
  uniform float uCollapse;
  varying vec2  vUv;
  varying float vAmp;
  varying float vPhase;
  varying float vDensity;
  void main() {
    // Phase → hue (blue 0.6 → cyan 0.5 → purple 0.75)
    float phaseNorm = fract(vPhase * 0.12);
    // Lerp through three colors manually
    vec3 blue   = vec3(0.10, 0.40, 1.00);
    vec3 cyan   = vec3(0.05, 0.90, 1.00);
    vec3 purple = vec3(0.70, 0.30, 1.00);
    vec3 col = mix(blue, cyan, smoothstep(0.0, 0.5, phaseNorm));
    col = mix(col, purple, smoothstep(0.5, 1.0, phaseNorm));

    // Amplitude boosts brightness
    float intensity = 0.25 + pow(abs(vAmp), 1.3) * 0.9;
    col *= intensity;

    // Density → alpha (probability density)
    float alpha = 0.18 + vDensity * 0.45;
    // Fade edges
    float edgeFade = 1.0 - smoothstep(0.35, 0.5, length(vUv - 0.5));
    alpha *= edgeFade;
    alpha *= 1.0 - uCollapse * 0.85;

    gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.9));
  }
`;

// ─── Quantum field backdrop (subtle noise oscillation) ───────────────────
const FIELD_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    f = f*f*(3.0 - 2.0*f);
    return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
               mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
  }
  void main() {
    vec2 uv = vUv * 6.0;
    float n = noise(uv + uTime * 0.15) * 0.5 + noise(uv * 2.3 - uTime * 0.08) * 0.3;
    // Oscillation bands
    float band = sin(vUv.x * 12.0 + uTime * 0.4) * 0.5 + 0.5;
    float mixed = n * 0.6 + band * 0.15;
    vec3 col = mix(vec3(0.03, 0.05, 0.12), vec3(0.12, 0.18, 0.35), mixed);
    gl_FragColor = vec4(col, 0.45);
  }
`;

// ────────────────────────────────────────────────────────────────────────────
export function createQuantumScene({ scene, camera, renderer, controls }) {
  camera.position.set(0, 5, 24);
  controls.setRadius(26);

  scene.add(new THREE.AmbientLight(0x223366, 0.6));
  const dl = new THREE.DirectionalLight(0xaaccff, 0.5);
  dl.position.set(4, 8, 6);
  scene.add(dl);

  // ── Quantum field backdrop ───────────────────────────────────────
  const fieldUniforms = { uTime: { value: 0 } };
  const fieldMat = new THREE.ShaderMaterial({
    uniforms: fieldUniforms,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: FIELD_FRAG,
    transparent: true, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const fieldMesh = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), fieldMat);
  fieldMesh.position.set(0, 0, -15);
  scene.add(fieldMesh);

  // Baseline floor grid (dim)
  const grid = new THREE.GridHelper(40, 40, 0x1a3a8a, 0x0a1a3a);
  grid.material.opacity = 0.22;
  grid.material.transparent = true;
  grid.position.y = -6;
  scene.add(grid);

  // ── Barrier group (rebuilt when slit count/width/sep changes) ───────
  const barrierGroup = new THREE.Group();
  scene.add(barrierGroup);
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x1a2038, metalness: 0.6, roughness: 0.4, emissive: 0x0a1028,
  });
  const slitMarkerMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

  let currentSlitCenters = [0];

  function rebuildBarrier(params) {
    while (barrierGroup.children.length) {
      const c = barrierGroup.children.pop();
      c.geometry.dispose();
      c.material !== barrierMat && c.material !== slitMarkerMat && c.material.dispose();
    }
    const N = Math.max(1, Math.min(5, params.slitCount));
    const sep = params.slitSep * 2;
    const w = params.slitWidth;
    const centers = slitCenters(N, params.slitSep);
    currentSlitCenters = centers;

    const BARRIER_TOTAL_W = 14;
    const BARRIER_H = 8;
    const BARRIER_T = 0.3;

    // Sort slit x positions for interval creation
    const sorted = centers.slice().sort((a, b) => a - b);
    // Create barrier segments in the gaps: [-W/2, slit1-w/2], [slit1+w/2, slit2-w/2], ..., [slitN+w/2, W/2]
    let prev = -BARRIER_TOTAL_W / 2;
    const segments = [];
    for (const c of sorted) {
      segments.push([prev, c - w / 2]);
      prev = c + w / 2;
    }
    segments.push([prev, BARRIER_TOTAL_W / 2]);
    for (const [a, b] of segments) {
      const width = b - a;
      if (width <= 0.02) continue;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, BARRIER_H, BARRIER_T),
        barrierMat
      );
      mesh.position.set((a + b) / 2, 0, 0);
      barrierGroup.add(mesh);
    }

    // Cyan slit markers
    for (const c of centers) {
      const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.04, BARRIER_H, BARRIER_T + 0.1),
        slitMarkerMat
      );
      marker.position.set(c, 0, 0);
      barrierGroup.add(marker);
    }
  }

  // ── Optional tunnel barrier between emitter and main barrier ────────
  const tunnelBarrier = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4, 0.4),
    new THREE.MeshStandardMaterial({
      color: 0x5b3aa8, metalness: 0.3, roughness: 0.6,
      emissive: 0x2a1a68, transparent: true, opacity: 0.55,
    })
  );
  tunnelBarrier.position.set(0, 0, 5);
  tunnelBarrier.visible = false;
  scene.add(tunnelBarrier);

  // ── Detector screen (accumulated texture) ───────────────────────────
  const accumCanvas = document.createElement('canvas');
  accumCanvas.width = 512; accumCanvas.height = 256;
  const accumCtx = accumCanvas.getContext('2d');
  accumCtx.fillStyle = '#050812'; accumCtx.fillRect(0, 0, 512, 256);
  const accumTex = new THREE.CanvasTexture(accumCanvas);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 9),
    new THREE.MeshBasicMaterial({ map: accumTex, side: THREE.DoubleSide })
  );
  screen.position.set(0, 0, SCREEN_Z);
  scene.add(screen);
  const frame = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(18, 9)),
    new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7 })
  );
  frame.position.copy(screen.position);
  scene.add(frame);

  // ── Emitter ──────────────────────────────────────────────────────────
  const emitter = new THREE.Mesh(
    new THREE.ConeGeometry(0.3, 0.8, 8),
    new THREE.MeshBasicMaterial({ color: 0xffb347 })
  );
  emitter.position.set(0, 0, EMITTER_Z);
  emitter.rotation.x = -Math.PI / 2;
  scene.add(emitter);

  // ── Wavefunction shader mesh ─────────────────────────────────────────
  const wfUniforms = {
    uTime:       { value: 0 },
    uWavelength: { value: 0.5 },
    uSlitSep:    { value: 0.4 },
    uSlitCount:  { value: 2 },
    uSlitWidth:  { value: 0.25 },
    uCollapse:   { value: 0 },
  };
  const wfMat = new THREE.ShaderMaterial({
    uniforms: wfUniforms,
    vertexShader: WF_VERT,
    fragmentShader: WF_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const wfMesh = new THREE.Mesh(new THREE.PlaneGeometry(18, 18, 80, 80), wfMat);
  wfMesh.rotation.x = -Math.PI / 2;
  wfMesh.position.y = -1;
  scene.add(wfMesh);

  // ── Cloud mode — volumetric probability points ──────────────────────
  const CLOUD_N = 2400;
  const cloudGeo = new THREE.BufferGeometry();
  const cloudPos = new Float32Array(CLOUD_N * 3);
  const cloudCol = new Float32Array(CLOUD_N * 3);
  for (let i = 0; i < CLOUD_N; i++) {
    // Uniform random over the apparatus volume
    cloudPos[i * 3]     = (Math.random() - 0.5) * 18;
    cloudPos[i * 3 + 1] = (Math.random() - 0.5) * 6;
    cloudPos[i * 3 + 2] = (Math.random()) * 16 - 7;
  }
  cloudGeo.setAttribute('position', new THREE.BufferAttribute(cloudPos, 3));
  cloudGeo.setAttribute('color',    new THREE.BufferAttribute(cloudCol, 3));
  const cloudMat = new THREE.PointsMaterial({
    size: 0.12, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const cloudPoints = new THREE.Points(cloudGeo, cloudMat);
  cloudPoints.visible = false;
  scene.add(cloudPoints);

  // ── Pilot wave line (visible in pilot-wave interpretation) ──────────
  const pilotLine = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xc478ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  pilotLine.visible = false;
  scene.add(pilotLine);

  // ── Particle pool ────────────────────────────────────────────────────
  // Each particle tracks: mesh, ghost meshes (superposition), slitX, targetX,
  // targetY, progress, observable, isSuperposition, entangledWith, phase
  const particles = [];
  const histogram = new Array(120).fill(0);
  let totalHits = 0;
  let emitAccum = 0;

  // Ghost particle pool for superposition (reused across spawns)
  // We allocate one array of spheres per slit, reused.

  function spawnParticle(params, paired = null) {
    const obs = params.observer;
    // Uncertainty-driven spawn position variance
    // Low uncertainty (0) → precise position (tight), high (1) → blurred
    const posJitter = params.uncertainty * 0.8;
    const startX = (Math.random() - 0.5) * posJitter;
    const startY = (Math.random() - 0.5) * posJitter * 0.5;

    // Tunneling: probabilistically determine whether this particle makes it through
    let tunneled = true;
    if (params.tunneling) {
      const T = tunnelProbability(params.tunnelBarrier);
      tunneled = Math.random() < T;
    }

    const isSuper = params.superposition && !obs;

    // Pick which slit (only matters for observer & superposition rendering)
    const which = Math.floor(Math.random() * currentSlitCenters.length);
    const slitX = currentSlitCenters[which] || 0;

    // Target-x sample
    const observerMix = obs ? 1 : (params.delayedChoice ? 0 : 0); // delayed applied later
    const targetX = sampleScreenX({
      screenWidth: 18,
      observerMix,
      slitCenters: currentSlitCenters,
      slitCount: params.slitCount,
      slitSep: params.slitSep,
      slitWidth: params.slitWidth,
      lambda: Math.max(0.02, params.wavelength),
      L: 16,
    });
    // Y spread scaled by uncertainty (precise momentum → tight y)
    const ySpread = 3 * (0.5 + params.uncertainty * 0.5);
    const targetY = (Math.random() - 0.5) * ySpread;

    const color = obs ? 0xff2dd1 : 0x00e5ff;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 })
    );
    mesh.position.set(startX, startY, EMITTER_Z);
    scene.add(mesh);

    // Ghost meshes (superposition) — one per slit, faded
    let ghosts = null;
    if (isSuper) {
      ghosts = currentSlitCenters.map((sx) => {
        const g = new THREE.Mesh(
          new THREE.SphereGeometry(0.10, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
        );
        g.position.set(startX, startY, EMITTER_Z);
        scene.add(g);
        return { mesh: g, slitX: sx, phaseOffset: Math.random() * 0.4 };
      });
    }

    // Entanglement link (only if this is the FIRST of a pair)
    let entLine = null;
    if (params.entanglement && !paired) {
      // Pair will be created below; link drawn between them later
    }
    if (params.entanglement && paired) {
      // Visual partner — offset in x AND add a glowing line connecting them
      mesh.position.x += params.entangleDist * 6;
      paired.partnerMesh = mesh;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(2 * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xc478ff, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      entLine = new THREE.Line(geo, mat);
      scene.add(entLine);
    }

    const p = {
      mesh, slitX, which, targetX, targetY,
      startX, startY,
      progress: 0, observable: obs, isSuper, ghosts,
      tunneled, entLine,
      partner: null,
      collapseT: 0,    // 0..1 collapse animation progress
      interpretation: params.interpretation,
    };
    particles.push(p);

    // If entanglement enabled and this call was not already a paired spawn, spawn partner
    if (params.entanglement && !paired) {
      const partner = spawnParticle(params, p);
      p.partner = partner;
      partner.partner = p;
    }

    // Remove oldest if overflow
    while (particles.length > MAX_PARTICLES) {
      const old = particles.shift();
      destroyParticle(old);
    }

    return p;
  }

  function destroyParticle(p) {
    if (p.mesh) { scene.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
    if (p.ghosts) p.ghosts.forEach((g) => { scene.remove(g.mesh); g.mesh.geometry.dispose(); g.mesh.material.dispose(); });
    if (p.entLine) { scene.remove(p.entLine); p.entLine.geometry.dispose(); p.entLine.material.dispose(); }
  }

  // ── Vacuum fluctuation pool ─────────────────────────────────────────
  const VAC_POOL = 12;
  const vacFlickers = Array.from({ length: VAC_POOL }, () => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeRadialTex(0xc478ff, 1),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
    }));
    m.scale.setScalar(0.4);
    scene.add(m);
    return { sprite: m, life: 0, maxLife: 0.6, active: false };
  });
  let vacTimer = 0;
  function spawnVacFlicker() {
    const f = vacFlickers.find((x) => !x.active);
    if (!f) return;
    f.active = true; f.life = 0;
    f.sprite.position.set(
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 14
    );
    f.maxLife = 0.3 + Math.random() * 0.5;
    f.sprite.material.opacity = 0.8;
  }

  // ── Delayed-choice history — store wave samples on disk so we can
  // replay "interference dissolves retroactively" visual.
  //
  // We implement a simpler variant: when delayedChoice is ON and observer
  // is OFF, particles land with wave interference. When user flips observer
  // ON mid-simulation, existing in-flight particles re-target toward the
  // collapsed pattern while already past the slits.

  let lastSig = '';
  let lastObserver = false;

  return {
    clearScreen() {
      accumCtx.fillStyle = '#050812';
      accumCtx.fillRect(0, 0, 512, 256);
      accumTex.needsUpdate = true;
      histogram.fill(0);
      totalHits = 0;
    },
    getHistogram() { return histogram.slice(); },
    getTotalHits() { return totalHits; },
    update(dt, t, params) {
      // Rebuild barrier on apparatus changes
      const sig = `${params.slitCount}|${params.slitSep}|${params.slitWidth}`;
      if (sig !== lastSig) {
        lastSig = sig;
        rebuildBarrier(params);
      }

      // Wavefunction uniforms
      wfUniforms.uTime.value = t;
      wfUniforms.uWavelength.value = Math.max(0.05, params.wavelength);
      wfUniforms.uSlitSep.value = params.slitSep;
      wfUniforms.uSlitCount.value = params.slitCount;
      wfUniforms.uSlitWidth.value = params.slitWidth;
      // Smoothly collapse/uncollapse wavefunction amplitude
      const collapseTarget = (params.observer || params.renderMode === 'particle') ? 1 : 0;
      wfUniforms.uCollapse.value += (collapseTarget - wfUniforms.uCollapse.value) * 0.08;

      // Render mode switch
      const waveVisible = params.renderMode === 'wave' && params.showWavefunction;
      const cloudVisible = params.renderMode === 'cloud';
      wfMesh.visible = waveVisible;
      cloudPoints.visible = cloudVisible;

      // Tunnel barrier
      tunnelBarrier.visible = params.tunneling;
      if (params.tunneling) {
        tunnelBarrier.material.opacity = 0.2 + params.tunnelBarrier * 0.6;
        tunnelBarrier.scale.y = 0.5 + params.tunnelBarrier * 1.5;
      }

      // Field backdrop animation
      fieldUniforms.uTime.value = t;

      // Pilot-wave visibility
      pilotLine.visible = params.interpretation === 'pilot' && particles.length > 0;

      // ── Cloud mode — update per-point color based on probability ──
      if (cloudVisible) {
        const colArr = cloudGeo.attributes.color.array;
        const posArr = cloudGeo.attributes.position.array;
        for (let i = 0; i < CLOUD_N; i++) {
          const x = posArr[i * 3];
          const z = posArr[i * 3 + 2];
          // Probability based on distance from slit plane + lateral interference
          const distFromScreen = Math.abs(z - SCREEN_Z);
          const lambda = Math.max(0.05, params.wavelength);
          const slit = params.slitSep * 2;
          const interf = params.observer ? 0.4 :
            0.3 + 0.5 * Math.pow(Math.cos((Math.PI * x * slit) / (lambda * 16)), 2);
          const envelope = Math.max(0, 1 - distFromScreen / 20);
          const intensity = interf * envelope;
          // Shade blue for wave, magenta for collapsed
          if (params.observer) {
            colArr[i * 3]     = intensity * 1.0;
            colArr[i * 3 + 1] = intensity * 0.2;
            colArr[i * 3 + 2] = intensity * 0.9;
          } else {
            colArr[i * 3]     = intensity * 0.1;
            colArr[i * 3 + 1] = intensity * 0.8;
            colArr[i * 3 + 2] = intensity * 1.0;
          }
          // Slight animation — small jitter in position over time
          posArr[i * 3 + 1] += Math.sin(t * 0.5 + i) * 0.002;
        }
        cloudGeo.attributes.color.needsUpdate = true;
        cloudGeo.attributes.position.needsUpdate = true;
      }

      // ── Vacuum fluctuations ──
      if (params.fluctuations) {
        vacTimer += dt;
        if (vacTimer > 0.15) {
          vacTimer = 0;
          if (Math.random() < 0.6) spawnVacFlicker();
        }
      }
      vacFlickers.forEach((f) => {
        if (!f.active) return;
        f.life += dt;
        const u = f.life / f.maxLife;
        if (u >= 1) { f.active = false; f.sprite.material.opacity = 0; return; }
        f.sprite.material.opacity = Math.sin(u * Math.PI) * 0.75;
        f.sprite.scale.setScalar(0.3 + u * 0.5);
      });

      // ── Particle emission ──
      // Skip emission while cloud mode is the only renderer, keep it subdued there
      if (!cloudVisible) {
        emitAccum += dt * 1000;
        const interval = 1000 / Math.max(1, params.particles / 10);
        while (emitAccum > interval) {
          emitAccum -= interval;
          spawnParticle(params);
        }
      }

      // ── Delayed-choice retro-collapse: if observer just turned on,
      // mid-flight wave particles re-target toward collapsed positions ──
      if (params.observer && !lastObserver && params.delayedChoice) {
        for (const p of particles) {
          if (p.progress > 0.3 && !p.observable) {
            // Recompute target toward slit geometric image
            const c = currentSlitCenters[p.which] || 0;
            p.targetX = c * 1.5 + (Math.random() - 0.5) * 1.2;
            p.observable = true;
            p.mesh.material.color.setHex(0xff2dd1);
            p.collapseT = 0.01; // start smooth collapse anim
          }
        }
      }
      lastObserver = params.observer;

      // ── Particle advance ──
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        // Step progress; halt tunneling particles at the tunnel barrier if they didn't tunnel
        const hitTunnelPlane = params.tunneling && p.progress < 0.3 && !p.tunneled;
        if (hitTunnelPlane) {
          // Reflect — fade out at the barrier
          p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - dt * 1.5);
          p.mesh.position.z = Math.min(p.mesh.position.z, 5.5);
          if (p.mesh.material.opacity <= 0.05) {
            destroyParticle(p);
            particles.splice(i, 1);
          }
          continue;
        }

        p.progress += dt * 0.4;

        // ── Smooth collapse animation when observer triggers retrocollapse ──
        if (p.collapseT > 0 && p.collapseT < 1) {
          p.collapseT = Math.min(1, p.collapseT + dt * 3);
          p.mesh.scale.setScalar(1 + Math.sin(p.collapseT * Math.PI) * 0.6);
        }

        // ── Tunneling transparency while inside the barrier ──
        if (params.tunneling && p.progress > 0.15 && p.progress < 0.35) {
          p.mesh.material.transparent = true;
          p.mesh.material.opacity = 0.35;
        } else if (p.mesh.material.opacity < 1 && p.mesh.material.transparent) {
          p.mesh.material.opacity = Math.min(1, p.mesh.material.opacity + dt * 2);
        }

        if (p.progress >= 1) {
          // Record hit
          const screenX = ((p.targetX / 9) + 0.5) * 512;
          const screenY = (0.5 - (p.targetY / 9) * 0.5) * 256;
          const binIdx = Math.floor(((p.targetX + 9) / 18) * histogram.length);
          if (binIdx >= 0 && binIdx < histogram.length) histogram[binIdx]++;
          totalHits++;
          // Hit glow in interpretation color
          let hitColor;
          if (p.observable) hitColor = 'rgba(255,45,209,0.95)';
          else if (p.interpretation === 'manyworlds') hitColor = 'rgba(196,120,255,0.85)';
          else hitColor = 'rgba(0,229,255,0.9)';
          accumCtx.fillStyle = hitColor;
          accumCtx.fillRect(screenX - 1.5, screenY - 1.5, 3, 3);
          accumTex.needsUpdate = true;
          destroyParticle(p);
          particles.splice(i, 1);
          continue;
        }

        // ── Interpolate particle position ──
        // Phase 1 (0..0.5): emitter → slit x
        // Phase 2 (0.5..1): slit x → target on screen
        let px, py, pz;
        if (p.progress < 0.5) {
          const tt = p.progress * 2;
          px = p.startX + tt * (p.slitX - p.startX);
          py = p.startY;
          pz = EMITTER_Z + tt * (0 - EMITTER_Z);
        } else {
          const tt = (p.progress - 0.5) * 2;
          px = p.slitX + tt * (p.targetX - p.slitX);
          py = tt * p.targetY;
          pz = tt * (SCREEN_Z - 0);
        }
        p.mesh.position.set(px, py, pz);

        // ── Superposition ghosts: render partial path through each slit ──
        if (p.isSuper && p.ghosts) {
          for (const g of p.ghosts) {
            let gx, gy, gz;
            if (p.progress < 0.5) {
              const tt = p.progress * 2;
              gx = p.startX + tt * (g.slitX - p.startX);
              gy = p.startY + Math.sin(t * 2 + g.phaseOffset) * 0.15;
              gz = EMITTER_Z + tt * (0 - EMITTER_Z);
            } else {
              const tt = (p.progress - 0.5) * 2;
              gx = g.slitX + tt * (p.targetX - g.slitX);
              gy = tt * p.targetY + Math.sin(t * 2 + g.phaseOffset) * 0.08 * (1 - tt);
              gz = tt * (SCREEN_Z - 0);
            }
            g.mesh.position.set(gx, gy, gz);
            // Fade ghosts if observer turns on
            const targetOp = params.observer ? 0 : 0.35;
            g.mesh.material.opacity += (targetOp - g.mesh.material.opacity) * 0.08;
          }
        }

        // ── Entanglement link — update endpoints between p and partner ──
        if (p.entLine && p.partner) {
          const arr = p.entLine.geometry.attributes?.position?.array;
          if (arr) {
            arr[0] = p.mesh.position.x; arr[1] = p.mesh.position.y; arr[2] = p.mesh.position.z;
            arr[3] = p.partner.mesh.position.x; arr[4] = p.partner.mesh.position.y; arr[5] = p.partner.mesh.position.z;
            p.entLine.geometry.attributes.position.needsUpdate = true;
          }
          // Pulse opacity
          p.entLine.material.opacity = 0.4 + Math.sin(t * 3) * 0.15;
        }

        // ── Pilot wave line — draw from emitter through particle ──
        if (params.interpretation === 'pilot' && i === 0) {
          const segments = 24;
          const pilotPos = new Float32Array(segments * 3);
          for (let k = 0; k < segments; k++) {
            const tt = k / (segments - 1);
            pilotPos[k * 3] = p.mesh.position.x * tt + Math.sin(t * 3 + k) * 0.2;
            pilotPos[k * 3 + 1] = p.mesh.position.y * tt;
            pilotPos[k * 3 + 2] = EMITTER_Z + (p.mesh.position.z - EMITTER_Z) * tt;
          }
          pilotLine.geometry.setAttribute('position', new THREE.BufferAttribute(pilotPos, 3));
          pilotLine.geometry.attributes.position.needsUpdate = true;
        }

        // ── Many-worlds: leave persistent faint dot at slit pass-through ──
        if (p.interpretation === 'manyworlds' && Math.abs(p.progress - 0.5) < 0.01 && !p.observable) {
          // Briefly paint a faint dot on the screen as well, representing "the other branch"
          const otherSlit = currentSlitCenters[(p.which + 1) % currentSlitCenters.length] || 0;
          const altScreenX = ((otherSlit * 1.2 + (Math.random() - 0.5) * 1.5) / 9 + 0.5) * 512;
          const altScreenY = (0.5 - ((Math.random() - 0.5) * 2) / 9 * 0.5) * 256;
          accumCtx.fillStyle = 'rgba(196,120,255,0.25)';
          accumCtx.fillRect(altScreenX - 1, altScreenY - 1, 2, 2);
          accumTex.needsUpdate = true;
        }
      }
    },
    dispose() {
      particles.forEach(destroyParticle);
      accumTex.dispose();
      fieldMat.dispose(); fieldMesh.geometry.dispose();
      wfMat.dispose(); wfMesh.geometry.dispose();
      cloudGeo.dispose(); cloudMat.dispose();
      pilotLine.geometry.dispose(); pilotLine.material.dispose();
      barrierMat.dispose(); slitMarkerMat.dispose();
      tunnelBarrier.geometry.dispose(); tunnelBarrier.material.dispose();
      vacFlickers.forEach((f) => { if (f.sprite.material.map) f.sprite.material.map.dispose(); f.sprite.material.dispose(); });
    },
  };
}

function makeRadialTex(colorHex, alpha) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  const col = new THREE.Color(colorHex);
  const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
  grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.4})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
