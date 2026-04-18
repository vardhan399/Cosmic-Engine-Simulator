import * as THREE from 'three';
import {
  generateNodes, generateFilaments, nearestNodeIndex,
  classifyEpoch, classifyFate,
} from './universePhysics';

// ────────────────────────────────────────────────────────────────────────────
//  UNIVERSE SCENE — cosmic-scale simulator.
//
//  Layers (from back to front):
//    CMB backdrop       — subtle red/blue noise sphere at huge radius
//    expansion fabric   — wireframe grid that stretches outward over time
//    cosmic web         — filament lines + node markers (galaxy clusters)
//    dark matter halos  — semi-transparent violet volumes around nodes
//    particles          — star/dust field, gravitated toward nearest node
//    galaxy sprites     — spirals / ellipticals parented to their node
//    velocity arrows    — optional vector field
//    trails             — optional particle history
//    big-bang overlay   — flash + shockwave during trigger
// ────────────────────────────────────────────────────────────────────────────

const UNIVERSE_RADIUS = 55;   // initial distribution extent
const TRAIL_LEN = 12;         // positions cached per particle when trails enabled

export function createUniverseScene({ scene, camera, renderer, controls }) {
  camera.position.set(0, 60, 120);
  controls.setRadius(130);
  scene.fog = new THREE.FogExp2(0x010308, 0.0018);

  // ── Ambient — scene relies on additive blending, keep ambient very low
  scene.add(new THREE.AmbientLight(0x0a0e20, 0.35));

  // ────────────────────────────────────────────────────────────────────
  //  COSMIC MICROWAVE BACKGROUND (CMB)
  // ────────────────────────────────────────────────────────────────────
  // A huge BackSide sphere with a shader that paints faint temperature
  // fluctuations. Extremely subtle — functions like a mottled wallpaper.
  const cmbMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0.16 } },
    vertexShader: /* glsl */`
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime; uniform float uIntensity;
      varying vec3 vWorldPos;
      float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float noise3(vec3 p) {
        vec3 i = floor(p); vec3 f = fract(p); f = f*f*(3.0 - 2.0*f);
        return mix(
          mix(mix(hash(i+vec3(0,0,0)), hash(i+vec3(1,0,0)), f.x),
              mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x),
              mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      void main() {
        vec3 p = normalize(vWorldPos);
        float n = noise3(p * 12.0) * 0.5 + noise3(p * 28.0) * 0.3 + noise3(p * 60.0) * 0.15;
        // Map n in [0..1] to a slight blue↔red variance
        vec3 cool = vec3(0.04, 0.07, 0.12);
        vec3 warm = vec3(0.12, 0.06, 0.05);
        vec3 col = mix(cool, warm, n);
        col *= uIntensity;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const cmbSphere = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 24), cmbMat);
  scene.add(cmbSphere);

  // ────────────────────────────────────────────────────────────────────
  //  EXPANSION FABRIC — wireframe grid that scales over time
  // ────────────────────────────────────────────────────────────────────
  const fabricGeo = new THREE.BoxGeometry(200, 200, 200, 10, 10, 10);
  const fabricMat = new THREE.LineBasicMaterial({
    color: 0x3a5a9c, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const fabric = new THREE.LineSegments(
    new THREE.EdgesGeometry(fabricGeo, 0),
    fabricMat
  );
  fabricGeo.dispose();
  scene.add(fabric);

  // ────────────────────────────────────────────────────────────────────
  //  COSMIC WEB (nodes + filaments + galaxies + dark matter)
  // ────────────────────────────────────────────────────────────────────
  const webGroup = new THREE.Group();
  scene.add(webGroup);
  let nodes = [];
  let filamentsLine = null;
  let nodeMarkers = null;
  let galaxyGroup = new THREE.Group();
  webGroup.add(galaxyGroup);
  let darkMatterHalos = [];  // one per node

  // ────────────────────────────────────────────────────────────────────
  //  Particles (the gas/dust/stars)
  // ────────────────────────────────────────────────────────────────────
  let particles = null;
  let velocities = null;
  let trailsGeo = null, trailsLine = null, trailBuffer = null;
  let particleNodeLink = null;  // Int32Array: for each particle, index of its nearest node at spawn
  let currentCount = 0;

  // ────────────────────────────────────────────────────────────────────
  //  Velocity field arrows (subtle directional glyphs on a 3D grid)
  // ────────────────────────────────────────────────────────────────────
  const arrowsGroup = new THREE.Group();
  scene.add(arrowsGroup);
  const arrowMeshes = [];
  buildArrows();

  function buildArrows() {
    // 3D lattice of thin cones indicating local flow direction
    for (let x = -2; x <= 2; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -2; z <= 2; z++) {
          const cone = new THREE.Mesh(
            new THREE.ConeGeometry(0.35, 1.2, 8),
            new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.28, depthWrite: false })
          );
          cone.position.set(x * 20, y * 20, z * 20);
          arrowsGroup.add(cone);
          arrowMeshes.push(cone);
        }
      }
    }
    arrowsGroup.visible = false;
  }

  // ────────────────────────────────────────────────────────────────────
  //  Big Bang cinematic overlay
  // ────────────────────────────────────────────────────────────────────
  const bigBangMat = new THREE.ShaderMaterial({
    uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Color(0xffffff) } },
    vertexShader: /* glsl */`
      varying vec3 vN;
      void main() {
        vN = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform vec3 uColor; uniform float uAlpha;
      varying vec3 vN;
      void main() {
        float rim = 1.0 - abs(dot(vN, normalize(vec3(0.0, 0.0, 1.0))));
        float a = pow(rim, 2.0) * uAlpha;
        gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
      }
    `,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
  });
  const bigBangWave = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bigBangMat);
  bigBangWave.visible = false;
  scene.add(bigBangWave);

  const bigBangFlash = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeRadialTex(0xffffff, 1.0),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0,
  }));
  bigBangFlash.scale.setScalar(30);
  scene.add(bigBangFlash);

  const bigBangState = { active: false, t: 0, duration: 3.5, lastTrigger: 0 };

  // ────────────────────────────────────────────────────────────────────
  //  Galaxy sprite factory — spiral or elliptical, color by age
  // ────────────────────────────────────────────────────────────────────
  function makeGalaxyCanvas(spec) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2, cy = size / 2;
    // Color by age (0=blue, 1=red)
    const hue = (1 - spec.age) * 220 + spec.age * 20;  // 220 blue → 20 red

    // Bright core
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.15);
    coreGrad.addColorStop(0, `hsla(${hue}, 80%, 85%, 1)`);
    coreGrad.addColorStop(0.4, `hsla(${hue}, 70%, 60%, 0.7)`);
    coreGrad.addColorStop(1, `hsla(${hue}, 60%, 40%, 0)`);
    ctx.fillStyle = coreGrad;
    ctx.fillRect(0, 0, size, size);

    if (spec.type === 'spiral') {
      // Draw spiral arms: parametric logarithmic curves with small dots
      const arms = spec.armCount;
      for (let a = 0; a < arms; a++) {
        const phase0 = (a / arms) * Math.PI * 2;
        for (let t = 0; t < 220; t++) {
          const r = 8 + t * 0.55;
          const theta = phase0 + t * 0.055;
          const x = cx + r * Math.cos(theta);
          const y = cy + r * Math.sin(theta);
          const alpha = (1 - t / 220) * 0.9;
          const pointSize = 1.2 + (t > 120 ? 0.6 : 0);
          // randomize a bit
          const jx = (Math.random() - 0.5) * 2;
          const jy = (Math.random() - 0.5) * 2;
          ctx.fillStyle = `hsla(${hue + Math.random() * 20 - 10}, 80%, ${70 - t * 0.2}%, ${alpha})`;
          ctx.beginPath();
          ctx.arc(x + jx, y + jy, pointSize, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // Elliptical — dense scatter with elongation
      const ellipAR = 0.6 + Math.random() * 0.3;
      for (let i = 0; i < 600; i++) {
        const r = Math.pow(Math.random(), 0.8) * (size * 0.45);
        const theta = Math.random() * Math.PI * 2;
        const x = cx + r * Math.cos(theta);
        const y = cy + r * Math.sin(theta) * ellipAR;
        const alpha = (1 - r / (size * 0.45)) * 0.8;
        ctx.fillStyle = `hsla(${hue + Math.random() * 15 - 7}, 55%, ${60 - r * 0.15}%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  // ────────────────────────────────────────────────────────────────────
  //  COSMIC WEB — build nodes + filaments + galaxy sprites + halos
  // ────────────────────────────────────────────────────────────────────
  function rebuildCosmicWeb(params) {
    // Teardown
    if (filamentsLine) {
      webGroup.remove(filamentsLine);
      filamentsLine.geometry.dispose();
      filamentsLine.material.dispose();
      filamentsLine = null;
    }
    if (nodeMarkers) {
      webGroup.remove(nodeMarkers);
      nodeMarkers.geometry.dispose();
      nodeMarkers.material.dispose();
      nodeMarkers = null;
    }
    while (galaxyGroup.children.length) {
      const c = galaxyGroup.children.pop();
      if (c.material && c.material.map) c.material.map.dispose();
      if (c.material) c.material.dispose();
    }
    darkMatterHalos.forEach((h) => { webGroup.remove(h); h.geometry.dispose(); h.material.dispose(); });
    darkMatterHalos = [];

    // Generate
    nodes = generateNodes(params.clusters, UNIVERSE_RADIUS, 42);
    const edges = generateFilaments(nodes, 2);

    // Filament lines — a single BufferGeometry with one line per edge
    const fGeo = new THREE.BufferGeometry();
    const fPos = new Float32Array(edges.length * 2 * 3);
    for (let i = 0; i < edges.length; i++) {
      const a = nodes[edges[i].i], b = nodes[edges[i].j];
      fPos[i * 6]     = a.x; fPos[i * 6 + 1] = a.y; fPos[i * 6 + 2] = a.z;
      fPos[i * 6 + 3] = b.x; fPos[i * 6 + 4] = b.y; fPos[i * 6 + 5] = b.z;
    }
    fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    const fMat = new THREE.LineBasicMaterial({
      color: 0x6a88d8, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    filamentsLine = new THREE.LineSegments(fGeo, fMat);
    webGroup.add(filamentsLine);

    // Node markers — bright point cloud where clusters sit
    const nGeo = new THREE.BufferGeometry();
    const nPos = new Float32Array(nodes.length * 3);
    const nCol = new Float32Array(nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) {
      nPos[i * 3]     = nodes[i].x;
      nPos[i * 3 + 1] = nodes[i].y;
      nPos[i * 3 + 2] = nodes[i].z;
      const c = new THREE.Color().setHSL(0.58 + nodes[i].age * 0.15, 0.7, 0.7);
      nCol[i * 3] = c.r; nCol[i * 3 + 1] = c.g; nCol[i * 3 + 2] = c.b;
    }
    nGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
    nGeo.setAttribute('color', new THREE.BufferAttribute(nCol, 3));
    nodeMarkers = new THREE.Points(nGeo, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    webGroup.add(nodeMarkers);

    // Galaxy sprites — one per node
    for (const node of nodes) {
      const tex = makeGalaxyCanvas(node);
      const sprMat = new THREE.SpriteMaterial({
        map: tex, transparent: true, blending: THREE.AdditiveBlending,
        depthWrite: false, opacity: 0.85,
      });
      const spr = new THREE.Sprite(sprMat);
      spr.scale.setScalar(6 * node.size * node.mass);
      spr.position.set(node.x, node.y, node.z);
      spr.userData.node = node;
      galaxyGroup.add(spr);
    }

    // Dark matter halos — soft violet volumes sized by cluster mass
    for (const node of nodes) {
      const haloGeo = new THREE.SphereGeometry(5 + node.mass * 2.5, 16, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color: 0x5b3aa8, transparent: true, opacity: 0.09,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.set(node.x, node.y, node.z);
      webGroup.add(halo);
      darkMatterHalos.push(halo);
    }
  }

  // ────────────────────────────────────────────────────────────────────
  //  Particle builder — biased toward cosmic web
  // ────────────────────────────────────────────────────────────────────
  function buildParticles(n, params) {
    if (particles) {
      scene.remove(particles);
      particles.geometry.dispose();
      particles.material.dispose();
    }
    if (trailsLine) {
      scene.remove(trailsLine);
      trailsLine.geometry.dispose();
      trailsLine.material.dispose();
      trailsLine = null;
    }
    particleNodeLink = new Int32Array(n);

    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    velocities = new Float32Array(n * 3);

    for (let i = 0; i < n; i++) {
      // Bias: with probability webStrength/2, sample from a random filament
      // (between two connected nodes), jittered in a sphere. Otherwise
      // sample uniformly in the initial universe sphere.
      let x, y, z;
      const useWeb = nodes.length > 1 && Math.random() < 0.55 * Math.min(1.2, params.webStrength);
      if (useWeb) {
        // Random node, then random position biased toward its direction to a neighbor
        const a = nodes[Math.floor(Math.random() * nodes.length)];
        const b = nodes[Math.floor(Math.random() * nodes.length)];
        const t = Math.pow(Math.random(), 0.8);
        x = a.x + (b.x - a.x) * t + (Math.random() - 0.5) * 4;
        y = a.y + (b.y - a.y) * t + (Math.random() - 0.5) * 4;
        z = a.z + (b.z - a.z) * t + (Math.random() - 0.5) * 4;
      } else {
        const r = Math.pow(Math.random(), 0.6) * UNIVERSE_RADIUS;
        const u = Math.random(), v = Math.random();
        const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
        x = r * Math.sin(ph) * Math.cos(th);
        y = r * Math.sin(ph) * Math.sin(th);
        z = r * Math.cos(ph);
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
      velocities[i * 3]     = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.02;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;

      particleNodeLink[i] = nearestNodeIndex(x, y, z, nodes);

      // Color — slight hue variation + warm for old node, cool for young
      const node = particleNodeLink[i] >= 0 ? nodes[particleNodeLink[i]] : null;
      const baseHue = node ? (0.58 + node.age * 0.15) : (0.6 + Math.random() * 0.1);
      const c = new THREE.Color().setHSL(baseHue + (Math.random() - 0.5) * 0.05, 0.6, 0.55 + Math.random() * 0.25);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.3, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    particles = new THREE.Points(geo, mat);
    scene.add(particles);
    currentCount = n;

    // Trails — a single LineSegments buffer for all particles, allocated lazily
    if (params.showTrails) {
      const segCount = n * TRAIL_LEN;
      trailBuffer = new Float32Array(segCount * 3);
      const tGeo = new THREE.BufferGeometry();
      tGeo.setAttribute('position', new THREE.BufferAttribute(trailBuffer, 3));
      const tMat = new THREE.LineBasicMaterial({
        color: 0x6aa8ff, transparent: true, opacity: 0.15,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      trailsLine = new THREE.Line(tGeo, tMat);
      scene.add(trailsLine);
      trailsGeo = tGeo;
    }
  }

  // ────────────────────────────────────────────────────────────────────
  //  Camera observation modes
  // ────────────────────────────────────────────────────────────────────
  function applyObservationMode(mode, t) {
    if (!controls.setTarget || !controls.setRadius) return;
    let targetPos = new THREE.Vector3(0, 0, 0);
    let targetRadius = 130;
    if (mode === 'cluster' && nodes.length > 0) {
      // Pick the densest node (largest mass)
      const n = nodes.reduce((a, b) => (a.mass > b.mass ? a : b));
      targetPos.set(n.x, n.y, n.z);
      targetRadius = 45;
    } else if (mode === 'galaxy' && nodes.length > 0) {
      // Cycle through nodes every 6 s
      const idx = Math.floor((t / 6) % nodes.length);
      const n = nodes[idx];
      targetPos.set(n.x, n.y, n.z);
      targetRadius = 18;
    } else if (mode === 'zoomout') {
      targetRadius = 220;
    }
    controls.setTarget(targetPos);
    const current = controls.getRadius?.() ?? 130;
    controls.setRadius(current + (targetRadius - current) * 0.02);
  }

  // ────────────────────────────────────────────────────────────────────
  //  Update loop
  // ────────────────────────────────────────────────────────────────────
  const stats = { meanDist: 0, maxDist: 0, volume: 1, fate: { label: 'STEADY-STATE', lines: [] }, epoch: 'early' };
  let lastSig = '';
  let fabricScale = 1;
  let trailWriteIdx = 0;

  return {
    update(dt, t, params) {
      // Rebuild on structural change
      const sig = `${params.clusters}|${params.particles}|${params.webStrength}|${params.showTrails}`;
      if (sig !== lastSig) {
        lastSig = sig;
        rebuildCosmicWeb(params);
        buildParticles(params.particles, params);
      }

      // Big Bang trigger
      if (params.bigBangTrigger !== bigBangState.lastTrigger) {
        bigBangState.lastTrigger = params.bigBangTrigger;
        bigBangState.active = true;
        bigBangState.t = 0;
        // Compress all particles toward center with outward velocity
        if (particles) {
          const pos = particles.geometry.attributes.position.array;
          const n = pos.length / 3;
          for (let i = 0; i < n; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 0.5;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 0.5;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
            // Kick outward
            const dx = (Math.random() - 0.5) * 2;
            const dy = (Math.random() - 0.5) * 2;
            const dz = (Math.random() - 0.5) * 2;
            const mag = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.01;
            velocities[i * 3]     = (dx / mag) * (0.8 + Math.random() * 0.3);
            velocities[i * 3 + 1] = (dy / mag) * (0.8 + Math.random() * 0.3);
            velocities[i * 3 + 2] = (dz / mag) * (0.8 + Math.random() * 0.3);
          }
          particles.geometry.attributes.position.needsUpdate = true;
        }
        // Reset fabric scale
        fabricScale = 0.05;
      }

      // Big Bang overlay animation
      if (bigBangState.active) {
        bigBangState.t += dt;
        const u = bigBangState.t / bigBangState.duration;
        if (u >= 1) {
          bigBangState.active = false;
          bigBangWave.visible = false;
          bigBangFlash.material.opacity = 0;
        } else {
          // Shockwave
          bigBangWave.visible = true;
          bigBangWave.scale.setScalar(2 + u * 120);
          bigBangMat.uniforms.uAlpha.value = (1 - u) * 0.85;
          // Color shift white → blue → dim
          const col = new THREE.Color();
          if (u < 0.25) col.setRGB(1, 1, 1);
          else if (u < 0.55) col.lerpColors(new THREE.Color(1, 1, 1), new THREE.Color(0.6, 0.85, 1), (u - 0.25) / 0.3);
          else col.lerpColors(new THREE.Color(0.6, 0.85, 1), new THREE.Color(0.2, 0.3, 0.55), (u - 0.55) / 0.45);
          bigBangMat.uniforms.uColor.value.copy(col);
          // Flash
          bigBangFlash.material.opacity = Math.max(0, 1 - u * 3.5);
          bigBangFlash.scale.setScalar(10 + u * 80);
        }
      }

      if (!particles) return;

      // ── Particle physics ──
      const pos = particles.geometry.attributes.position.array;
      const n = pos.length / 3;
      const G = params.G * 0.001;
      const exp = params.expansion;
      const forceSign = params.forceType === 'attractive' ? -1 : params.forceType === 'repulsive' ? 1 : 0;
      const ts = params.timeScale;
      // Dark matter enhances clustering strength — acts as a multiplier on
      // the attraction-to-node force
      const dmBoost = params.darkMatter ? 1.6 : 1.0;
      const webStrength = params.webStrength * dmBoost;

      let meanDist = 0, maxDist = 0;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const r = Math.sqrt(x * x + y * y + z * z) + 0.01;

        // Radial central force (original)
        const a = (forceSign * G) / (r * r);
        velocities[i * 3]     += ((a * x) / r) * dt * ts;
        velocities[i * 3 + 1] += ((a * y) / r) * dt * ts;
        velocities[i * 3 + 2] += ((a * z) / r) * dt * ts;

        // Hubble-like expansion — velocity proportional to position
        velocities[i * 3]     += exp * x * dt * 0.01 * ts;
        velocities[i * 3 + 1] += exp * y * dt * 0.01 * ts;
        velocities[i * 3 + 2] += exp * z * dt * 0.01 * ts;

        // NEW: pull toward nearest cosmic-web node (clustering)
        const nodeIdx = particleNodeLink[i];
        if (nodeIdx >= 0 && nodeIdx < nodes.length && forceSign < 0) {
          const node = nodes[nodeIdx];
          const dx = node.x - x, dy = node.y - y, dz = node.z - z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.5;
          // Attraction scales with node mass × webStrength, softened at small distances
          const attract = (node.mass * webStrength * 0.015) / d;
          velocities[i * 3]     += (dx / d) * attract * dt * ts;
          velocities[i * 3 + 1] += (dy / d) * attract * dt * ts;
          velocities[i * 3 + 2] += (dz / d) * attract * dt * ts;
        }

        // Integrate
        pos[i * 3]     += velocities[i * 3]     * dt * 5 * ts;
        pos[i * 3 + 1] += velocities[i * 3 + 1] * dt * 5 * ts;
        pos[i * 3 + 2] += velocities[i * 3 + 2] * dt * 5 * ts;

        const newR = Math.hypot(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        meanDist += newR;
        if (newR > maxDist) maxDist = newR;

        if (newR > 800) {
          // Respawn near a random node, not origin
          if (nodes.length > 0) {
            const nn = nodes[Math.floor(Math.random() * nodes.length)];
            pos[i * 3]     = nn.x + (Math.random() - 0.5) * 4;
            pos[i * 3 + 1] = nn.y + (Math.random() - 0.5) * 4;
            pos[i * 3 + 2] = nn.z + (Math.random() - 0.5) * 4;
          } else {
            pos[i * 3] *= 0.1; pos[i * 3 + 1] *= 0.1; pos[i * 3 + 2] *= 0.1;
          }
          velocities[i * 3] = 0; velocities[i * 3 + 1] = 0; velocities[i * 3 + 2] = 0;
        }
      }
      stats.meanDist = meanDist / n;
      stats.maxDist = maxDist;
      stats.volume = (4 / 3) * Math.PI * Math.pow(maxDist, 3);
      particles.geometry.attributes.position.needsUpdate = true;

      // ── Trails ──
      if (trailsLine && trailsGeo && trailBuffer && n > 0) {
        // Each particle has TRAIL_LEN slots; rotate write index per frame
        const slot = trailWriteIdx % TRAIL_LEN;
        for (let i = 0; i < n; i++) {
          const base = (i * TRAIL_LEN + slot) * 3;
          trailBuffer[base]     = pos[i * 3];
          trailBuffer[base + 1] = pos[i * 3 + 1];
          trailBuffer[base + 2] = pos[i * 3 + 2];
        }
        trailsGeo.attributes.position.needsUpdate = true;
        trailWriteIdx++;
      }

      // ── Cosmic web visibility ──
      if (filamentsLine) filamentsLine.visible = params.showCosmicWeb;
      if (nodeMarkers)   nodeMarkers.visible   = params.showCosmicWeb;
      galaxyGroup.visible = params.showGalaxies;
      darkMatterHalos.forEach((h, i) => {
        h.visible = params.showDarkMatter;
        if (params.showDarkMatter) {
          // Slight pulse
          const pulse = 1 + Math.sin(t * 0.4 + i) * 0.06;
          h.scale.setScalar(pulse);
          h.rotation.y += 0.02 * dt;
        }
      });

      // ── Galaxy sprites — slight rotation, color can shift with age over time ──
      if (params.showGalaxies) {
        galaxyGroup.children.forEach((spr, i) => {
          spr.material.rotation += 0.002 * dt * 30 * ts * (spr.userData.node?.type === 'spiral' ? 1 : 0.4);
        });
      }

      // ── Fabric (expanding grid) ──
      fabric.visible = params.showFabric;
      if (fabric.visible) {
        // Scale grows with time (cumulative expansion)
        const growthRate = exp * 0.03;
        fabricScale += growthRate * dt * ts;
        fabric.scale.setScalar(Math.min(6, fabricScale));
        fabric.material.opacity = Math.max(0.03, 0.12 - fabricScale * 0.012);
      }

      // ── Velocity field arrows ──
      arrowsGroup.visible = params.showVelocityField;
      if (params.showVelocityField) {
        arrowMeshes.forEach((cone) => {
          const p = cone.position;
          const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) + 0.01;
          // Point along radial direction, sign based on force
          const sign = forceSign >= 0 ? 1 : -1;  // outward for repulsive, inward for attractive
          const dir = new THREE.Vector3(p.x, p.y, p.z).normalize().multiplyScalar(sign);
          cone.lookAt(cone.position.clone().add(dir));
          // Color shift based on force type
          cone.material.color.setHex(forceSign < 0 ? 0x6aa8ff : 0xff6a88);
        });
      }

      // ── CMB ──
      cmbSphere.visible = params.showCMB;
      cmbMat.uniforms.uTime.value = t;

      // ── Observation mode ──
      applyObservationMode(params.observationMode, t);

      // ── Fate + epoch ──
      stats.fate = classifyFate({
        expansion: exp, forceType: params.forceType, darkMatter: params.darkMatter,
        meanDist: stats.meanDist, maxDist: stats.maxDist,
      });
      stats.epoch = classifyEpoch({
        meanDist: stats.meanDist, expansion: exp, maxDist: stats.maxDist,
      });

      this._stats = {
        meanDist: stats.meanDist,
        maxDist: stats.maxDist,
        volume: stats.volume,
        fate: stats.fate,
        epoch: stats.epoch,
        clusterCount: nodes.length,
      };
    },

    getStats() { return this._stats || stats; },

    dispose() {
      cmbSphere.geometry.dispose(); cmbMat.dispose();
      fabric.geometry.dispose(); fabricMat.dispose();
      if (particles) { particles.geometry.dispose(); particles.material.dispose(); }
      if (trailsLine) { trailsLine.geometry.dispose(); trailsLine.material.dispose(); }
      if (filamentsLine) { filamentsLine.geometry.dispose(); filamentsLine.material.dispose(); }
      if (nodeMarkers) { nodeMarkers.geometry.dispose(); nodeMarkers.material.dispose(); }
      galaxyGroup.children.forEach((c) => {
        if (c.material?.map) c.material.map.dispose();
        if (c.material) c.material.dispose();
      });
      darkMatterHalos.forEach((h) => { h.geometry.dispose(); h.material.dispose(); });
      arrowMeshes.forEach((c) => { c.geometry.dispose(); c.material.dispose(); });
      bigBangWave.geometry.dispose(); bigBangMat.dispose();
      if (bigBangFlash.material.map) bigBangFlash.material.map.dispose();
      bigBangFlash.material.dispose();
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

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
