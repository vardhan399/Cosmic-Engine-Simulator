import * as THREE from 'three';
import { nbodyVariableAccel, buildPresetSystem, predictTrajectory, detectEvents } from './realityPhysics';

// ────────────────────────────────────────────────────────────────────────────
//  REALITY SCENE — fundamental-laws sandbox
//
//  Rendering layers (back → front):
//    starfield backdrop
//    stability heatmap plane (optional)
//    trail pool per system instance
//    body meshes (A, B, multiverse clones) — shader-based, typed per body
//    energy transfer lines (bright pairs)
//    divergence lines (twin compare)
//    prediction ghost line (Newtonian baseline)
//
//  Body type assignment (deterministic from mass):
//    mass ≥ 15 → STAR        (plasma surface + corona)
//    mass ≥ 4  → GAS GIANT   (banded turbulence)
//    else      → ROCKY       (craters + roughness)
//  In chaos mode all primary-universe bodies gain a glowing "energy aura".
//
//  Visual identity varies with philosophy:
//    deterministic → clean thin trails, smooth motion, minimal glow
//    probabilistic → slight blur trails (wider lines), soft flicker
//    chaos         → pulsating colors, broken trails (gaps), jitter
// ────────────────────────────────────────────────────────────────────────────

const MAX_TRAIL = 300;
const COLORS_A = [0x00e5ff, 0x6aa8ff, 0x58f5a0, 0xffb347, 0xa855f7, 0xff2dd1, 0x66ffaa, 0xff4d6d];
const COLORS_B = [0xff2dd1, 0xff4d6d, 0xffa2a2, 0xc478ff, 0xff9090, 0xffb080, 0xffc0d0, 0xff80a0]; // redder

// ─── Body-type shader ───────────────────────────────────────────────────
// A single shader covers all body types via uniforms. Keeps GPU state
// consistent (no material switching per frame) and avoids compile overhead.
const BODY_VERT = /* glsl */`
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vLocalPos;
  void main() {
    vLocalPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const BODY_FRAG = /* glsl */`
  precision highp float;
  uniform float uType;       // 0 = rocky, 1 = gas, 2 = star, 3 = highEnergy
  uniform vec3  uColor;      // base color (varies by body)
  uniform float uTime;
  uniform float uEmissive;   // baseline glow intensity
  uniform float uChaosGlow;  // additional rim glow when chaos active
  uniform vec3  uLightDir;   // directional light from central body
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec3  vLocalPos;

  // 3D value noise
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f*f*(3.0 - 2.0*f);
    return mix(
      mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
          mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
          mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    return noise3(p)*0.5 + noise3(p*2.0)*0.25 + noise3(p*4.0)*0.125;
  }

  void main() {
    vec3 p = normalize(vLocalPos);
    vec3 col = uColor;

    if (uType < 0.5) {
      // ── ROCKY ── craters + roughness variation
      float craters = fbm(p * 6.0);
      float roughness = fbm(p * 18.0) * 0.5;
      // Deep craters (circles) — cheap approximation via threshold bands
      float crater = smoothstep(0.55, 0.42, craters);
      col = mix(uColor, uColor * 0.5, roughness);
      col = mix(col, uColor * 0.25, crater);
    } else if (uType < 1.5) {
      // ── GAS GIANT ── latitudinal bands with turbulence
      float lat = p.y;
      float bands = sin(lat * 14.0 + fbm(p * 3.0 + vec3(uTime * 0.2)) * 2.0);
      float bandFactor = 0.5 + 0.5 * bands;
      vec3 light = uColor * 1.25;
      vec3 dark  = uColor * 0.65;
      col = mix(dark, light, bandFactor);
      // Slight overall turbulence
      col *= 0.85 + fbm(p * 5.0 + vec3(uTime * 0.15)) * 0.3;
    } else if (uType < 2.5) {
      // ── STAR ── convection + flares
      float tSlow = uTime * 0.2;
      float granulation = fbm(p * 5.0 + vec3(0.0, 0.0, tSlow));
      float flares = fbm(p * 10.0 + vec3(uTime * 0.6));
      float eruption = pow(fbm(p * 14.0 + vec3(uTime * 0.3)), 2.5);
      float brightness = granulation * 0.5 + flares * 0.3 + eruption * 0.7;
      vec3 hot = vec3(1.0, 0.95, 0.7);
      col = mix(uColor * 0.7, hot, smoothstep(0.2, 0.9, brightness));
      col += vec3(0.6, 0.75, 0.9) * pow(max(0.0, brightness - 0.85), 2.0) * 1.5;
      // Limb brightening for hot plasma
      float rim = 1.0 - abs(dot(vNormal, normalize(vec3(0.0, 0.0, 1.0))));
      col *= 0.8 + rim * 0.4;
    } else {
      // ── HIGH ENERGY ── shimmer + color cycling
      float shimmer = fbm(p * 8.0 + vec3(uTime * 1.2));
      // Cycle through primary hues over time
      vec3 hue1 = vec3(0.2, 0.9, 1.0);
      vec3 hue2 = vec3(1.0, 0.3, 0.8);
      vec3 hue3 = vec3(1.0, 0.9, 0.3);
      float phase = uTime * 0.5;
      vec3 cyc = mix(hue1, hue2, sin(phase) * 0.5 + 0.5);
      cyc = mix(cyc, hue3, sin(phase * 0.7 + 1.5) * 0.5 + 0.5);
      col = mix(uColor, cyc, shimmer);
      col *= 1.2;
    }

    // Lighting — stars are self-emissive, others get directional shading
    if (uType < 1.5) {
      // Rocky/Gas: lit by star direction (or ambient if no star)
      float ndl = max(0.05, dot(normalize(vNormal), normalize(uLightDir)));
      col *= 0.2 + ndl * 0.95;
    }

    // Emissive minimum
    col = max(col, uColor * uEmissive);

    // Rim glow for chaos mode (energy aura)
    if (uChaosGlow > 0.01) {
      float rim = pow(1.0 - abs(dot(vNormal, normalize(vec3(0.0, 0.0, 1.0)))), 2.5);
      col += uColor * rim * uChaosGlow * 1.3;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Classify a body by mass into a numeric type uniform value.
 * 0=rocky, 1=gas, 2=star, 3=high-energy. Chaos mode can override toward 3.
 */
function classifyBodyType(mass) {
  if (mass >= 15) return 2;
  if (mass >= 4)  return 1;
  return 0;
}

export function createRealityScene({ scene, camera, renderer, controls }) {
  camera.position.set(0, 22, 50);
  controls.setRadius(52);

  // Starfield
  const starGeo = new THREE.BufferGeometry();
  const sp = new Float32Array(1500 * 3);
  for (let i = 0; i < 1500; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    sp[i * 3]     = 400 * Math.sin(ph) * Math.cos(th);
    sp[i * 3 + 1] = 400 * Math.sin(ph) * Math.sin(th);
    sp[i * 3 + 2] = 400 * Math.cos(ph);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xaaccff, size: 0.5 }));
  scene.add(stars);

  scene.add(new THREE.AmbientLight(0x101a30, 0.8));
  const dl = new THREE.DirectionalLight(0xaaccff, 0.5);
  dl.position.set(10, 10, 10);
  scene.add(dl);

  // ── Stability heatmap plane ───────────────────────────────────────
  // Cheap shader: green near regions of low divergence, red near high.
  // We feed body positions + a "divergence estimate" as a uniform.
  const heatMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime:      { value: 0 },
      uBodies:    { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 0, 0)) },
      uBodyCount: { value: 0 },
      uDiverge:   { value: 0 },
      uOpacity:   { value: 0.2 },
    },
    vertexShader: /* glsl */`
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec4  uBodies[8];
      uniform int   uBodyCount;
      uniform float uDiverge;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2  vPos;
      void main() {
        // Heat = sum of proximity to any body × global divergence estimate
        float heat = 0.0;
        for (int i = 0; i < 8; i++) {
          if (i >= uBodyCount) break;
          vec2 d = vPos - uBodies[i].xy;
          float r2 = dot(d, d);
          heat += uBodies[i].w / (r2 + 1.5);
        }
        heat = clamp(heat * 0.25 * (0.5 + uDiverge * 3.0), 0.0, 1.0);
        vec3 stable = vec3(0.1, 0.9, 0.45);
        vec3 warm   = vec3(0.95, 0.7, 0.2);
        vec3 chaotic = vec3(1.0, 0.3, 0.3);
        vec3 col = mix(stable, warm, smoothstep(0.1, 0.5, heat));
        col = mix(col, chaotic, smoothstep(0.5, 0.95, heat));
        gl_FragColor = vec4(col, uOpacity * heat);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const heatPlane = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), heatMat);
  heatPlane.rotation.x = -Math.PI / 2;
  heatPlane.position.y = -0.5;
  heatPlane.visible = false;
  scene.add(heatPlane);

  // ── System registry — each entry represents one parallel universe ──
  // Entry: { bodies, meshes, trails, color, role: 'primary'|'twin'|'multiverse' }
  const universes = [];
  let divLines = [];          // lines connecting primary to twin
  let energyLines = [];       // energy-transfer lines between close body pairs (primary)
  let predLine = null;        // predicted trajectory of body 0

  // ── Event detection / history buffers ──
  let prevRadii = [];
  let recentEvents = [];                 // event feed {text, severity, time}
  const divHistory = [];                 // rolling window for fate prediction
  const energyHistory = [];
  let lastSampleTime = 0;
  let lastEnergy = 0;
  let collisionCount = 0;
  let escapedCount = 0;

  // ── Raycaster for click-to-inspect ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let onPickResult = null;
  const dom = renderer.domElement;
  let mouseDownAt = null;
  const onMouseDown = (e) => { mouseDownAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onMouseUp = (e) => {
    if (!mouseDownAt) return;
    const dx = e.clientX - mouseDownAt.x;
    const dy = e.clientY - mouseDownAt.y;
    const dt = performance.now() - mouseDownAt.t;
    if (Math.sqrt(dx * dx + dy * dy) < 4 && dt < 300) {
      const rect = dom.getBoundingClientRect();
      ndc.x =  ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const primary = universes.find((u) => u.role === 'primary');
      if (primary && onPickResult) {
        const hits = raycaster.intersectObjects(primary.meshes.filter((m) => m.visible), false);
        if (hits.length) onPickResult(hits[0].object.userData.bodyId);
      }
    }
    mouseDownAt = null;
  };
  dom.addEventListener('mousedown', onMouseDown);
  dom.addEventListener('mouseup', onMouseUp);

  function clearUniverses() {
    universes.forEach((u) => {
      u.meshes.forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
      u.trails.forEach((t) => { scene.remove(t); t.geometry.dispose(); t.material.dispose(); });
      u.bodies.forEach((b) => {
        if (b.corona) {
          scene.remove(b.corona);
          if (b.corona.material.map) b.corona.material.map.dispose();
          b.corona.material.dispose();
          b.corona = null;
        }
      });
    });
    universes.length = 0;
    divLines.forEach((l) => { scene.remove(l); l.geometry.dispose(); l.material.dispose(); });
    divLines = [];
    energyLines.forEach((l) => { scene.remove(l); l.geometry.dispose(); l.material.dispose(); });
    energyLines = [];
    if (predLine) { scene.remove(predLine); predLine.geometry.dispose(); predLine.material.dispose(); predLine = null; }
  }

  function createTrail(color, role) {
    const buf = new Float32Array(MAX_TRAIL * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    geo.setDrawRange(0, 0);
    // Style by role
    let opacity = 0.6;
    if (role === 'twin') opacity = 0.35;
    if (role === 'multiverse') opacity = 0.22;
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, mat);
    line.userData = { buf, idx: 0, count: 0 };
    return line;
  }

  function spawnUniverse(initialBodies, role, colorOffset = 0) {
    const palette = role === 'twin' ? COLORS_B : COLORS_A;
    const bodies = initialBodies.map((b) => ({
      pos: [b.pos[0], b.pos[1], b.pos[2]],
      vel: [b.vel[0], b.vel[1], b.vel[2]],
      mass: b.mass,
      alive: true,
    }));
    const meshes = bodies.map((b, i) => {
      const color = palette[(i + colorOffset) % palette.length];
      const size = Math.pow(b.mass, 1 / 3) * 0.55;
      const bodyType = classifyBodyType(b.mass);
      const baseEmissive = role === 'primary' ? 0.2 : role === 'twin' ? 0.1 : 0.06;

      const uniforms = {
        uType:      { value: bodyType },
        uColor:     { value: new THREE.Color(color) },
        uTime:      { value: 0 },
        uEmissive:  { value: baseEmissive },
        uChaosGlow: { value: 0 },
        uLightDir:  { value: new THREE.Vector3(1, 0.2, 0.3).normalize() },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms, vertexShader: BODY_VERT, fragmentShader: BODY_FRAG,
        transparent: role !== 'primary',
      });
      if (role !== 'primary') mat.opacity = role === 'twin' ? 0.7 : 0.5;
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 32), mat);
      mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);
      mesh.userData = { bodyId: i, universeRole: role, uniforms, bodyType, size };
      scene.add(mesh);

      // Store mesh ref on the body for later per-body access
      b.mesh = mesh;
      b.bodyType = bodyType;
      b.baseColor = new THREE.Color(color);

      // Star corona sprite
      if (bodyType === 2 && role === 'primary') {
        const corona = makeSprite(makeRadialTex(color, 0.9), size * 5);
        corona.userData = { isCorona: true };
        scene.add(corona);
        b.corona = corona;
      }

      return mesh;
    });
    const trails = bodies.map((_, i) => {
      const color = palette[(i + colorOffset) % palette.length];
      const line = createTrail(color, role);
      scene.add(line);
      return line;
    });
    const universe = { bodies, meshes, trails, role, palette, colorOffset };
    universes.push(universe);
    return universe;
  }

  // Integrator with law-manipulation support
  function stepUniverse(u, G, exp, dt, philosophy, chaosIntensity, dissipation) {
    const n = u.bodies.length;
    // Filter dead bodies for the accel step
    const alive = u.bodies.filter((b) => b.alive);
    if (alive.length === 0) return;
    const fmt = alive.map((b) => ({ x: b.pos[0], y: b.pos[1], z: b.pos[2], mass: b.mass }));

    // Chaos mode: slightly vary exponent frame-to-frame, G wobbles
    let effectiveExp = exp;
    let effectiveG = G;
    if (philosophy === 'chaos' && chaosIntensity > 0) {
      effectiveExp = exp + (Math.random() - 0.5) * chaosIntensity * 0.1;
      effectiveG = G * (1 + (Math.random() - 0.5) * chaosIntensity * 0.08);
    }

    const acc = nbodyVariableAccel(fmt, effectiveG, effectiveExp, 0.25);
    let aIdx = 0;
    for (let i = 0; i < n; i++) {
      const b = u.bodies[i];
      if (!b.alive) continue;
      b.vel[0] += acc[aIdx].x * dt;
      b.vel[1] += acc[aIdx].y * dt;
      b.vel[2] += acc[aIdx].z * dt;
      // Probabilistic noise
      if (philosophy === 'probabilistic') {
        const noise = 0.002 * (1 + chaosIntensity);
        b.vel[0] += (Math.random() - 0.5) * noise;
        b.vel[1] += (Math.random() - 0.5) * noise * 0.3;
        b.vel[2] += (Math.random() - 0.5) * noise;
      } else if (philosophy === 'chaos') {
        // Chaos: stronger velocity perturbations
        const kick = 0.004 * chaosIntensity;
        b.vel[0] += (Math.random() - 0.5) * kick;
        b.vel[1] += (Math.random() - 0.5) * kick * 0.5;
        b.vel[2] += (Math.random() - 0.5) * kick;
      }
      // Dissipation (friction-like)
      if (dissipation > 0) {
        const damp = 1 - dissipation;
        b.vel[0] *= damp; b.vel[1] *= damp; b.vel[2] *= damp;
      }
      b.pos[0] += b.vel[0] * dt;
      b.pos[1] += b.vel[1] * dt;
      b.pos[2] += b.vel[2] * dt;
      aIdx++;
    }
  }

  function updateTrails(u, philosophy) {
    for (let i = 0; i < u.bodies.length; i++) {
      const b = u.bodies[i];
      const trail = u.trails[i];
      if (!b.alive || !trail) continue;
      const td = trail.userData;
      td.buf[td.idx * 3]     = b.pos[0];
      td.buf[td.idx * 3 + 1] = b.pos[1];
      td.buf[td.idx * 3 + 2] = b.pos[2];
      td.idx = (td.idx + 1) % MAX_TRAIL;
      td.count = Math.min(td.count + 1, MAX_TRAIL);
      // Build linear array from ring buffer
      const linear = new Float32Array(td.count * 3);
      for (let k = 0; k < td.count; k++) {
        const srcIdx = (td.idx - td.count + k + MAX_TRAIL) % MAX_TRAIL;
        linear[k * 3]     = td.buf[srcIdx * 3];
        linear[k * 3 + 1] = td.buf[srcIdx * 3 + 1];
        linear[k * 3 + 2] = td.buf[srcIdx * 3 + 2];
      }
      // Chaos: inject NaN gaps ~10% of time → broken-line aesthetic
      if (philosophy === 'chaos' && Math.random() < 0.15) {
        const gap = Math.floor(Math.random() * (td.count - 1));
        linear[gap * 3] = NaN;
        linear[gap * 3 + 1] = NaN;
        linear[gap * 3 + 2] = NaN;
      }
      trail.geometry.setAttribute('position', new THREE.BufferAttribute(linear, 3));
      trail.geometry.setDrawRange(0, td.count);
      trail.geometry.attributes.position.needsUpdate = true;

      // Dynamic trail styling by philosophy
      if (philosophy === 'deterministic') {
        trail.material.opacity = 0.6;
      } else if (philosophy === 'probabilistic') {
        trail.material.opacity = 0.45 + Math.sin(performance.now() * 0.003 + i) * 0.1;
      } else {
        // chaos — pulsing + flicker
        trail.material.opacity = 0.3 + Math.random() * 0.4;
      }
    }
  }

  function syncMeshes(u, philosophy, t, dt, focusId) {
    for (let i = 0; i < u.bodies.length; i++) {
      const b = u.bodies[i];
      const m = u.meshes[i];
      if (!b.alive) { m.visible = false; if (b.corona) b.corona.visible = false; continue; }
      m.visible = true;
      m.position.set(b.pos[0], b.pos[1], b.pos[2]);

      // Slow rotation per body — signature of "this is a real world, not a dot"
      m.rotation.y += dt * 0.2;
      m.rotation.x += dt * 0.05;

      // Feed shader uniforms
      const uniforms = m.userData.uniforms;
      if (!uniforms) continue;
      uniforms.uTime.value = t;

      // Chaos glow — high-energy aura around primary bodies in chaos mode
      const chaosTarget = (philosophy === 'chaos' && u.role === 'primary')
        ? (0.5 + Math.sin(t * 3 + i) * 0.3)
        : 0;
      uniforms.uChaosGlow.value += (chaosTarget - uniforms.uChaosGlow.value) * 0.1;

      // Emissive pulsing by philosophy
      let baseEmissive;
      if (u.role === 'primary') {
        if (philosophy === 'chaos') baseEmissive = 0.25 + Math.sin(t * 4 + i) * 0.18;
        else if (philosophy === 'probabilistic') baseEmissive = 0.2 + (Math.random() - 0.5) * 0.1;
        else baseEmissive = 0.2;
      } else if (u.role === 'twin') {
        baseEmissive = 0.1;
      } else {
        baseEmissive = 0.06;
      }
      // Focused body gets extra glow
      if (focusId !== null && focusId !== undefined && i === focusId && u.role === 'primary') {
        baseEmissive += 0.3;
      }
      uniforms.uEmissive.value = baseEmissive;

      // Light direction from central body (index 0) if present
      if (i !== 0 && u.bodies[0] && u.bodies[0].alive) {
        const lx = u.bodies[0].pos[0] - b.pos[0];
        const ly = u.bodies[0].pos[1] - b.pos[1];
        const lz = u.bodies[0].pos[2] - b.pos[2];
        uniforms.uLightDir.value.set(lx, ly, lz).normalize();
      }

      // Corona for stars — follow position, breathe with pulse
      if (b.corona) {
        b.corona.visible = true;
        b.corona.position.set(b.pos[0], b.pos[1], b.pos[2]);
        const pulse = 1 + Math.sin(t * 1.2 + i) * 0.08;
        const coronaSize = m.userData.size * 5 * pulse;
        b.corona.scale.setScalar(coronaSize);
      }
    }
  }

  // ── Collisions: merge bodies within combined-radius threshold ──
  function handleCollisions(u) {
    for (let i = 0; i < u.bodies.length; i++) {
      const A = u.bodies[i];
      if (!A.alive) continue;
      for (let j = i + 1; j < u.bodies.length; j++) {
        const B = u.bodies[j];
        if (!B.alive) continue;
        const dx = A.pos[0] - B.pos[0];
        const dy = A.pos[1] - B.pos[1];
        const dz = A.pos[2] - B.pos[2];
        const d2 = dx * dx + dy * dy + dz * dz;
        const sizeA = Math.pow(A.mass, 1 / 3) * 0.55;
        const sizeB = Math.pow(B.mass, 1 / 3) * 0.55;
        const thresh = (sizeA + sizeB) * 0.6;
        if (d2 < thresh * thresh) {
          // Merge into A (more mass gains heat)
          const totalM = A.mass + B.mass;
          A.pos[0] = (A.mass * A.pos[0] + B.mass * B.pos[0]) / totalM;
          A.pos[1] = (A.mass * A.pos[1] + B.mass * B.pos[1]) / totalM;
          A.pos[2] = (A.mass * A.pos[2] + B.mass * B.pos[2]) / totalM;
          A.vel[0] = (A.mass * A.vel[0] + B.mass * B.vel[0]) / totalM;
          A.vel[1] = (A.mass * A.vel[1] + B.mass * B.vel[1]) / totalM;
          A.vel[2] = (A.mass * A.vel[2] + B.mass * B.vel[2]) / totalM;
          A.mass = totalM;
          B.alive = false;
          if (u.role === 'primary') collisionCount++;
          // Update A's mesh size
          if (u.meshes[i]) {
            const newSize = Math.pow(A.mass, 1 / 3) * 0.55;
            u.meshes[i].scale.setScalar(newSize / (u.meshes[i].geometry.parameters.radius));
          }
          // Hide B's mesh
          if (u.meshes[j]) u.meshes[j].visible = false;
          if (u.trails[j]) u.trails[j].visible = false;
        }
      }
    }
  }

  // ── Build initial systems ──
  function buildAll(params) {
    clearUniverses();
    const initial = buildPresetSystem(params.preset, params.bodies);
    spawnUniverse(initial, 'primary');

    // Twin system for compare
    if (params.compareUniverses || params.chaos) {
      const eps = 1e-3;
      const twinInit = initial.map((b) => ({
        pos: [b.pos[0] + eps, b.pos[1], b.pos[2]],
        vel: [b.vel[0], b.vel[1], b.vel[2]],
        mass: b.mass,
      }));
      spawnUniverse(twinInit, 'twin');

      // Divergence lines
      for (let i = 0; i < initial.length; i++) {
        const buf = new Float32Array(6);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
        const mat = new THREE.LineBasicMaterial({
          color: 0x58f5a0, transparent: true, opacity: 0.5,
          blending: THREE.AdditiveBlending, depthWrite: false,
        });
        const line = new THREE.Line(geo, mat);
        scene.add(line);
        divLines.push(line);
      }
    }

    // Multiverse clones
    if (params.multiverse > 0) {
      for (let m = 0; m < params.multiverse; m++) {
        const eps = 0.002 * (m + 1);
        const clone = initial.map((b) => ({
          pos: [b.pos[0] + (Math.random() - 0.5) * eps, b.pos[1], b.pos[2] + (Math.random() - 0.5) * eps],
          vel: [b.vel[0], b.vel[1], b.vel[2]],
          mass: b.mass,
        }));
        spawnUniverse(clone, 'multiverse', m + 2);
      }
    }

    // Prediction line (always stubbed; visibility toggled each frame)
    const buf = new Float32Array(120 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineDashedMaterial({
      color: 0xc478ff, transparent: true, opacity: 0.7,
      dashSize: 0.35, gapSize: 0.25,
    });
    predLine = new THREE.Line(geo, mat);
    predLine.computeLineDistances();
    scene.add(predLine);
  }

  let lastSig = '';
  let stepAccum = 0;   // used for step-by-step mode (not currently exposed)

  return {
    update(dt, t, params) {
      // Rebuild on structural change
      const sig = `${params.bodies}|${params.preset}|${params.compareUniverses}|${params.chaos}|${params.multiverse}`;
      if (sig !== lastSig) {
        lastSig = sig;
        buildAll(params);
      }

      const philosophy = params.philosophy || 'probabilistic';
      const timeDir = params.timeDirection || 1;
      const sub = 4;
      const stepDt = (0.01 * params.timeScale * timeDir) / sub;

      for (let s = 0; s < sub; s++) {
        for (const u of universes) {
          stepUniverse(
            u, params.G, params.gravityExponent, stepDt,
            philosophy, params.chaosIntensity, params.dissipation
          );
        }
      }

      // Collisions
      if (params.collisions) {
        for (const u of universes) handleCollisions(u);
      }

      // Sync visuals
      for (const u of universes) {
        syncMeshes(u, philosophy, t, dt, params.inspectBodyId);
        updateTrails(u, philosophy);
      }

      // Divergence lines
      const primary = universes.find((u) => u.role === 'primary');
      const twin = universes.find((u) => u.role === 'twin');
      let totalDiv = 0;
      if (primary && twin && divLines.length) {
        const count = Math.min(primary.bodies.length, twin.bodies.length);
        for (let i = 0; i < count; i++) {
          const A = primary.bodies[i], B = twin.bodies[i];
          if (!A.alive || !B.alive || !divLines[i]) { if (divLines[i]) divLines[i].visible = false; continue; }
          divLines[i].visible = true;
          const arr = divLines[i].geometry.attributes.position.array;
          arr[0] = A.pos[0]; arr[1] = A.pos[1]; arr[2] = A.pos[2];
          arr[3] = B.pos[0]; arr[4] = B.pos[1]; arr[5] = B.pos[2];
          divLines[i].geometry.attributes.position.needsUpdate = true;

          const dx = A.pos[0] - B.pos[0], dy = A.pos[1] - B.pos[1], dz = A.pos[2] - B.pos[2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          totalDiv += d;

          // Line color by divergence magnitude
          let hex;
          if (d < 0.2)      hex = 0x58f5a0;  // green
          else if (d < 1.0) hex = 0xffb347;  // yellow
          else              hex = 0xff4d6d;  // red
          divLines[i].material.color.setHex(hex);
          divLines[i].material.opacity = Math.min(0.9, 0.3 + d * 0.4);
        }
        totalDiv /= Math.max(1, count);
      }

      // Prediction line — Newtonian forward integration of body 0
      if (predLine && primary && params.showPrediction) {
        predLine.visible = true;
        const pts = predictTrajectory(primary.bodies, 0, params.G, 120, 0.02 * params.timeScale);
        const arr = predLine.geometry.attributes.position.array;
        for (let i = 0; i < pts.length; i++) {
          arr[i * 3]     = pts[i][0];
          arr[i * 3 + 1] = pts[i][1];
          arr[i * 3 + 2] = pts[i][2];
        }
        predLine.geometry.setDrawRange(0, pts.length);
        predLine.geometry.attributes.position.needsUpdate = true;
        predLine.computeLineDistances();
      } else if (predLine) {
        predLine.visible = false;
      }

      // Heatmap
      heatPlane.visible = params.showHeatmap;
      if (heatPlane.visible && primary) {
        heatMat.uniforms.uTime.value = t;
        heatMat.uniforms.uDiverge.value = Math.min(1, totalDiv / 5);
        const count = Math.min(8, primary.bodies.length);
        heatMat.uniforms.uBodyCount.value = count;
        for (let i = 0; i < count; i++) {
          const b = primary.bodies[i];
          const vec = heatMat.uniforms.uBodies.value[i];
          vec.set(b.pos[0], b.pos[2], 0, b.mass);
        }
      }

      this._divergence = totalDiv;
      this._bodyCount = universes.reduce((a, u) => a + u.bodies.filter((b) => b.alive).length, 0);

      // ── Break Reality trigger ── random kicks to every primary body
      if (params.breakTrigger && params.breakTrigger !== this._lastBreak) {
        this._lastBreak = params.breakTrigger;
        if (primary) {
          for (const b of primary.bodies) {
            if (!b.alive) continue;
            b.vel[0] += (Math.random() - 0.5) * 2.0;
            b.vel[1] += (Math.random() - 0.5) * 0.6;
            b.vel[2] += (Math.random() - 0.5) * 2.0;
          }
        }
      }

      // ── Energy flow lines — draw between primary body pairs that are close ──
      if (primary) {
        const needed = Math.max(0, (primary.bodies.length * (primary.bodies.length - 1)) / 2);
        while (energyLines.length < needed) {
          const geo = new THREE.BufferGeometry();
          const pos = new Float32Array(6);
          geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          const mat = new THREE.LineBasicMaterial({
            color: 0xffd488, transparent: true, opacity: 0,
            blending: THREE.AdditiveBlending, depthWrite: false,
          });
          const line = new THREE.Line(geo, mat);
          scene.add(line);
          energyLines.push(line);
        }
        let lineIdx = 0;
        for (let i = 0; i < primary.bodies.length; i++) {
          const A = primary.bodies[i];
          for (let j = i + 1; j < primary.bodies.length; j++) {
            const B = primary.bodies[j];
            const line = energyLines[lineIdx++];
            if (!line) continue;
            if (!A.alive || !B.alive) { line.visible = false; continue; }
            const dx = A.pos[0] - B.pos[0];
            const dy = A.pos[1] - B.pos[1];
            const dz = A.pos[2] - B.pos[2];
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            // Only draw when bodies are "interacting" — close enough that energy flow matters
            if (d < 8) {
              line.visible = true;
              const arr = line.geometry.attributes.position.array;
              arr[0] = A.pos[0]; arr[1] = A.pos[1]; arr[2] = A.pos[2];
              arr[3] = B.pos[0]; arr[4] = B.pos[1]; arr[5] = B.pos[2];
              line.geometry.attributes.position.needsUpdate = true;
              // Intensity proportional to mutual gravitational energy
              const energy = (A.mass * B.mass) / (d * d + 0.1);
              line.material.opacity = Math.min(0.6, energy * 0.015);
              // Color: green (stable far) → yellow → red (close)
              if (d > 4) line.material.color.setHex(0x58f5a0);
              else if (d > 2) line.material.color.setHex(0xffb347);
              else line.material.color.setHex(0xff4d6d);
            } else {
              line.visible = false;
            }
          }
        }
        // Hide excess lines
        for (let k = lineIdx; k < energyLines.length; k++) energyLines[k].visible = false;
      }

      // ── Event detection & fate sampling (once per ~0.4s) ──
      if (t - lastSampleTime > 0.4 && primary) {
        lastSampleTime = t;
        const { events, radii, closestPairDist } = detectEvents({
          bodies: primary.bodies, prevRadii, params, philosophy,
        });
        prevRadii = radii;
        for (const ev of events) {
          // Dedupe by text against last 5 events
          if (!recentEvents.slice(-5).some((e) => e.text === ev.text && t - e.time < 2)) {
            recentEvents.push({ ...ev, time: t });
            if (ev.kind === 'collision' || ev.kind === 'escape') {
              // Update counters used by signature
              if (ev.kind === 'escape') escapedCount++;
            }
          }
        }
        // Trim to last 6 events
        if (recentEvents.length > 6) recentEvents = recentEvents.slice(-6);

        // History windows for fate prediction
        divHistory.push(totalDiv);
        if (divHistory.length > 16) divHistory.shift();

        // Total energy = Σ (½mv²) + Σ pairwise potentials
        let E = 0;
        for (const b of primary.bodies) {
          if (!b.alive) continue;
          E += 0.5 * b.mass * (b.vel[0] ** 2 + b.vel[1] ** 2 + b.vel[2] ** 2);
        }
        for (let i = 0; i < primary.bodies.length; i++) {
          for (let j = i + 1; j < primary.bodies.length; j++) {
            const A = primary.bodies[i], B = primary.bodies[j];
            if (!A.alive || !B.alive) continue;
            const dx = A.pos[0] - B.pos[0];
            const dy = A.pos[1] - B.pos[1];
            const dz = A.pos[2] - B.pos[2];
            const r = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
            E -= (params.G * A.mass * B.mass) / r;
          }
        }
        lastEnergy = E;
        energyHistory.push(E);
        if (energyHistory.length > 16) energyHistory.shift();

        this._closestApproach = closestPairDist;
        this._energy = E;
      }

      // ── Cinematic auto-camera ──
      if (params.autoCam && primary && controls.setTarget) {
        // Find body with highest speed (most "interesting" to watch)
        let best = null, bestSpeed = -1;
        for (const b of primary.bodies) {
          if (!b.alive) continue;
          const s = b.vel[0] ** 2 + b.vel[1] ** 2 + b.vel[2] ** 2;
          if (s > bestSpeed) { bestSpeed = s; best = b; }
        }
        // If there's a very close pair (collision imminent), focus on midpoint instead
        let target = best ? new THREE.Vector3(best.pos[0], best.pos[1], best.pos[2]) : new THREE.Vector3();
        if (this._closestApproach && this._closestApproach < 2) {
          // Find the closest pair and focus midpoint
          let minD = Infinity, a = null, b = null;
          for (let i = 0; i < primary.bodies.length; i++) {
            for (let j = i + 1; j < primary.bodies.length; j++) {
              const A = primary.bodies[i], B = primary.bodies[j];
              if (!A.alive || !B.alive) continue;
              const dx = A.pos[0] - B.pos[0], dy = A.pos[1] - B.pos[1], dz = A.pos[2] - B.pos[2];
              const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
              if (d < minD) { minD = d; a = A; b = B; }
            }
          }
          if (a && b) {
            target.set((a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2, (a.pos[2] + b.pos[2]) / 2);
          }
        }
        // Damp toward target
        if (!this._camTarget) this._camTarget = new THREE.Vector3();
        this._camTarget.lerp(target, 0.04);
        controls.setTarget(this._camTarget);
      } else if (controls.setTarget) {
        // Release target gracefully
        if (!this._camTarget) this._camTarget = new THREE.Vector3();
        this._camTarget.lerp(new THREE.Vector3(0, 0, 0), 0.04);
        controls.setTarget(this._camTarget);
      }
    },
    getDivergence() { return this._divergence || 0; },
    getBodyCount()  { return this._bodyCount || 0; },

    // ── Richer analytics for the upgraded UI ──
    getAnalytics() {
      const primary = universes.find((u) => u.role === 'primary');
      return {
        divergence: this._divergence || 0,
        bodyCount: this._bodyCount || 0,
        energy: this._energy || 0,
        prevEnergy: energyHistory.length > 1 ? energyHistory[energyHistory.length - 2] : 0,
        closestApproach: this._closestApproach || Infinity,
        collisions: collisionCount,
        escapedCount,
        events: recentEvents.slice(-5),
        divHistory: divHistory.slice(),
        energyHistory: energyHistory.slice(),
        primaryBodies: primary ? primary.bodies : [],
      };
    },

    // Focus listener (click-to-inspect)
    onPick(cb) { onPickResult = cb; },

    dispose() {
      dom.removeEventListener('mousedown', onMouseDown);
      dom.removeEventListener('mouseup', onMouseUp);
      clearUniverses();
      stars.geometry.dispose(); stars.material.dispose();
      heatPlane.geometry.dispose(); heatMat.dispose();
    },
  };
}

// ─── Sprite / radial texture helpers ────────────────────────────────────
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

function makeSprite(tex, size) {
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}
