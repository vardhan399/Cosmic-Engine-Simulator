import * as THREE from 'three';
import { nbodyAccel, blackbodyRGB } from '../../physics/engine';
import {
  keplerianInit, STAR_LIFECYCLE, detectResonances, orbitalPeriod,
  lifecycleTimeline, resolveLifecycle, blendLifecycle, endStageForMass,
  habitableZone,
} from './solarPhysics';

// ────────────────────────────────────────────────────────────────────────────
//  SOLAR SCENE — living, evolving cosmic system.
//
//  Star visual engine:
//    • Shader surface = layered 3D value noise + convection cells + animated
//      bright patches that grow and fade like plasma eruptions.
//    • Separate corona shell (additive sphere with smooth falloff).
//    • Pulsation (breathing) and flare spikes (brief radial rays).
//
//  Lifecycle:
//    • Seven stages: nebula / protostar / main / giant / supernova / blackhole / whitedwarf
//    • Run Evolution autopilots progress along a mass-appropriate timeline.
//    • All visual parameters (size / temp / turbulence / corona) interpolate
//      smoothly between stages — no pop changes.
//
//  Black hole: dark core + accretion disk shader (bright inner rim, Doppler-
//  biased color). Fake lensing: thin refraction ring around core.
//
//  Nebula: diffuse particle cloud spawned in place of the star.
//
//  Supernova: expanding blast sphere + light flash + impulse kick on planets.
//
//  Multi-belt: 3 independent belts, each with its own clusters/gaps.
//
//  Focus mode: click planet → camera eases to it, non-focused planets fade
//  their emissive, focused planet gets a brighter orbit ring.
//
//  Chaos mode: velocity noise + wavy orbit overlay + trail jitter.
// ────────────────────────────────────────────────────────────────────────────

const MAX_TRAIL = 280;
const MERGE_DIST = 0.85;

const PLANET_PALETTE = [
  0x6aa8ff, 0xe8a560, 0xd85656, 0x9be0b6, 0xc478ff, 0xffd36a, 0x5ee4ff, 0xff7e9e,
  0x8fd8b4, 0xffb26a, 0x7c8fff, 0xe86ab8, 0xa2e8c8, 0xf06858, 0xb8b8ff,
];

// ─── Atmosphere shader (reused from Planet module) ───────────────────────
const ATMO_VERT = /* glsl */`
  varying vec3 vN; varying vec3 vV; varying vec3 vWN;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vWN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mv;
  }
`;
const ATMO_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uColor; uniform float uIntensity; uniform vec3 uLightDir;
  varying vec3 vN; varying vec3 vV; varying vec3 vWN;
  void main() {
    float fresnel = pow(1.0 - max(0.0, dot(vN, vV)), 5.0);
    float lit = max(0.0, dot(normalize(vWN), normalize(uLightDir)));
    float litFactor = mix(0.1, 1.0, smoothstep(-0.2, 0.55, lit));
    gl_FragColor = vec4(uColor, clamp(fresnel * uIntensity * litFactor, 0.0, 0.85));
  }
`;

// ─── STAR surface shader — boiling plasma ───────────────────────────────
// Convection cells: low-frequency noise creates "granulation" patches.
// Flares: higher-frequency noise modulated over time creates bright eruptions.
// Doppler-like limb brightening keeps rim from going dark.
const STAR_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const STAR_FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uColorCore;
  uniform vec3  uColorHot;
  uniform float uTime;
  uniform float uPulse;
  uniform float uTurbulence;

  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;

  // 3D hash → pseudo-random
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }
  float fbm3(vec3 p) {
    return noise3(p) * 0.5 + noise3(p * 2.1) * 0.25 + noise3(p * 4.3) * 0.125 + noise3(p * 8.0) * 0.0625;
  }

  void main() {
    // Use object-space-ish position for convection. Stable across camera moves.
    vec3 p = normalize(vWorldPos);

    // ── Convection "granulation" — slow, large cells ──
    // Two time-offset samples morph the pattern gradually
    float tSlow = uTime * 0.12;
    float granulation = fbm3(p * 4.0 + vec3(0.0, 0.0, tSlow));

    // ── Fine-grain flares — faster movement, higher frequency ──
    float tFast = uTime * 0.6;
    float flares = fbm3(p * 8.0 + vec3(tFast, tFast * 0.7, 0.0));

    // ── Bright "eruption" patches: occasional hotspots that bloom and fade ──
    // Each octave at different frequency; max() picks the brightest at each point.
    float eruption = pow(fbm3(p * 12.0 + vec3(uTime * 0.3)), 3.0);
    eruption *= (0.5 + 0.5 * sin(uTime * 0.8 + hash(floor(p * 10.0)) * 6.28));

    // Combine: granulation dominates, flares add texture, eruption adds peaks
    float brightness = granulation * 0.5 + flares * 0.35 + eruption * 0.8 * uTurbulence;
    brightness = clamp(brightness, 0.0, 1.5);

    // Color: mix cool core with hot peaks based on brightness
    vec3 col = mix(uColorCore * 0.85, uColorHot, smoothstep(0.2, 0.9, brightness));

    // Hotspots push even hotter — cyan-white highlights
    col += vec3(0.6, 0.7, 0.9) * pow(max(0.0, brightness - 0.85), 2.5) * 1.8;

    // Limb brightening — makes sphere read as hot gas, not solid
    float rim = 1.0 - abs(dot(vNormal, normalize(vec3(0.0, 0.0, 1.0))));
    col *= 0.85 + rim * 0.3;

    // Pulse — overall brightness breath
    col *= uPulse;

    // Floor — never fully dark
    col = max(col, uColorCore * 0.3);

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── CORONA shader — smooth outer glow with additive blending ───────────
const CORONA_VERT = STAR_VERT;

const CORONA_FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uTime;
  varying vec3 vNormal;
  void main() {
    // fresnel-like — thicker near the edge
    float rim = 1.0 - abs(dot(vNormal, normalize(vec3(0.0, 0.0, 1.0))));
    float a = pow(rim, 2.5) * uIntensity;
    // Gentle flicker
    a *= 0.9 + sin(uTime * 1.6) * 0.1;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
  }
`;

// ─── ACCRETION DISK shader — bright inner rim, color toward blue on approaching side ───
const DISK_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const DISK_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uInner;
  uniform float uOuter;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    // Ring coordinates from UV: distance from center in [0..1]
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;                   // 0 at center, 1 at outer
    if (r < uInner || r > uOuter) discard;

    float angle = atan(c.y, c.x);

    // Swirl stripes — angular pattern that spins
    float swirl = sin(angle * 18.0 + r * 14.0 - uTime * 2.4);
    float grain = hash(vec2(floor(angle * 40.0), floor(r * 60.0)));

    // Radial intensity falloff (inner bright, outer dim)
    float radial = smoothstep(uOuter, uInner, r);
    float intensity = radial * (0.6 + 0.4 * swirl) * (0.8 + 0.2 * grain);

    // Doppler-like color shift based on angle (one side warmer, one cooler)
    vec3 hot  = vec3(1.00, 0.70, 0.25);
    vec3 cool = vec3(0.40, 0.65, 1.00);
    vec3 col = mix(cool, hot, 0.5 + 0.5 * cos(angle));

    // Inner edge extreme hot
    col += vec3(1.0, 0.95, 0.85) * pow(radial, 6.0) * 1.2;
    col *= intensity * 1.8;

    gl_FragColor = vec4(col, clamp(intensity, 0.0, 1.0));
  }
`;

// ─── LENSING shader — subtle rim refraction ring ────────────────────────
const LENS_FRAG = /* glsl */`
  precision highp float;
  uniform vec3 uColor;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    float rim = 1.0 - abs(dot(vNormal, normalize(vec3(0.0, 0.0, 1.0))));
    float a = pow(rim, 8.0) * 1.2;  // very thin
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.9));
  }
`;

// ────────────────────────────────────────────────────────────────────────────
//  Main scene factory
// ────────────────────────────────────────────────────────────────────────────
export function createSolarScene({ scene, camera, renderer, controls }) {
  camera.position.set(0, 25, 55);
  controls.setRadius(60);
  scene.fog = new THREE.FogExp2(0x000000, 0.0028);

  // ── Background: 3 parallax shells + nebula sprite ──
  const starShells = [
    makeStarfield(1400, 450, 0.55, 0.9),
    makeStarfield(700,  300, 0.75, 0.85),
    makeStarfield(300,  180, 1.1,  0.75),
  ];
  starShells.forEach((s) => scene.add(s));
  const bgNebula = makeSprite(makeRadialTex(0x3a2b8c, 0.28), 220);
  bgNebula.position.set(-80, -30, -180);
  scene.add(bgNebula);

  scene.add(new THREE.AmbientLight(0x0a0e20, 0.3));

  // ────────────────────────────────────────────────────────────────────
  //  GRAVITY FIELD — subtle curvature grid (visible space deformation)
  // ────────────────────────────────────────────────────────────────────
  // A large flat grid on the XZ plane whose vertices get displaced toward
  // massive bodies by a shader. Stays below the orbital plane so it reads
  // as "the fabric of space" rather than a gameplay element.
  const GRID_SIZE = 280;
  const GRID_SEGS = 90;
  const gravityUniforms = {
    uTime:        { value: 0 },
    uMasses:      { value: new Array(4).fill(0).map(() => new THREE.Vector4(0, 0, 0, 0)) }, // xyz + mass
    uMassCount:   { value: 1 },
    uBlackHole:   { value: 0 },
    uOpacity:     { value: 0.18 },
  };
  const gravityGeo = new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE, GRID_SEGS, GRID_SEGS);
  gravityGeo.rotateX(-Math.PI / 2);
  const gravityMat = new THREE.ShaderMaterial({
    uniforms: gravityUniforms,
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform vec4  uMasses[4];
      uniform int   uMassCount;
      uniform float uBlackHole;
      varying float vDepth;
      varying vec3  vPos;
      void main() {
        vec3 p = position;
        float depth = 0.0;
        for (int i = 0; i < 4; i++) {
          if (i >= uMassCount) break;
          vec3 m = uMasses[i].xyz;
          float mass = uMasses[i].w;
          vec2 d = p.xz - m.xz;
          float r2 = dot(d, d) + 1.0;
          // Well depth ∝ mass / r (softened). Black hole funnels much deeper.
          float well = mass / sqrt(r2);
          if (uBlackHole > 0.5) well *= 3.0;
          depth += well;
        }
        p.y = -depth * 0.12;           // push grid down into the well
        vPos = p;
        vDepth = depth;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uOpacity;
      uniform float uBlackHole;
      varying float vDepth;
      varying vec3  vPos;
      void main() {
        // Edge fade — avoid sharp square boundary
        float fade = 1.0 - smoothstep(80.0, 140.0, length(vPos.xz));

        // Color: cyan baseline → violet in deep wells → red near black hole
        vec3 base = vec3(0.15, 0.45, 0.75);
        vec3 deep = vec3(0.55, 0.30, 0.85);
        vec3 bh   = vec3(0.85, 0.25, 0.30);
        vec3 col = mix(base, deep, clamp(vDepth * 0.4, 0.0, 1.0));
        col = mix(col, bh, uBlackHole * clamp(vDepth * 0.3, 0.0, 1.0));

        // Brightness falls off with depth so the inside of the well is darker, not brighter
        float intensity = (1.0 - clamp(vDepth * 0.15, 0.0, 0.85)) * fade;
        gl_FragColor = vec4(col * intensity, uOpacity * fade);
      }
    `,
    transparent: true,
    wireframe: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gravityGrid = new THREE.Mesh(gravityGeo, gravityMat);
  gravityGrid.position.y = -3; // sits just below orbital plane
  scene.add(gravityGrid);

  // ────────────────────────────────────────────────────────────────────
  //  HABITABLE ZONE — glowing ring drawn in the orbital plane
  // ────────────────────────────────────────────────────────────────────
  const habitableMat = new THREE.ShaderMaterial({
    uniforms: {
      uInner: { value: 9 },
      uOuter: { value: 15 },
      uTime:  { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uInner;
      uniform float uOuter;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        // Radial UV: (0,0) = center
        vec2 c = vUv - 0.5;
        float r = length(c) * 200.0;  // plane is 200 units — will set scale below
        // Soft band with inner/outer soft edges
        float a = smoothstep(uInner - 0.6, uInner + 0.4, r)
                * (1.0 - smoothstep(uOuter - 0.4, uOuter + 0.6, r));
        a *= 0.55;                     // overall opacity
        // Gentle pulse
        a *= 0.85 + sin(uTime * 0.7) * 0.10;
        vec3 col = vec3(0.3, 0.95, 0.65);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const habitableRing = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), habitableMat);
  habitableRing.rotation.x = -Math.PI / 2;
  habitableRing.position.y = 0.01;
  habitableRing.visible = true;
  scene.add(habitableRing);

  // ────────────────────────────────────────────────────────────────────
  //  FLARE POOL — radial spikes that burst from stars occasionally
  // ────────────────────────────────────────────────────────────────────
  const FLARE_POOL = 8;
  const flares = Array.from({ length: FLARE_POOL }, () => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(6); // two vertices — line from star surface outward
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0xffb060, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const line = new THREE.Line(geo, mat);
    scene.add(line);
    return { line, mat, pos, life: 0, maxLife: 0.7, active: false, dir: new THREE.Vector3(), origin: new THREE.Vector3(), length: 0 };
  });
  let flareTimer = 0;

  function spawnFlare(origin, color, size) {
    const f = flares.find((x) => !x.active);
    if (!f) return;
    f.active = true;
    f.life = 0;
    f.dir.set(
      Math.random() - 0.5,
      (Math.random() - 0.5) * 0.6,
      Math.random() - 0.5
    ).normalize();
    f.origin.copy(origin);
    f.length = size * (0.8 + Math.random() * 1.6);
    f.mat.color.setHex(color);
  }

  // ────────────────────────────────────────────────────────────────────
  //  GHOST TRAIL POOL — faded planet positions during time-lapse
  // ────────────────────────────────────────────────────────────────────
  const GHOSTS_PER_PLANET = 5;
  // Allocated lazily per planet in sync loop.

  // ── STAR system group ──
  const starsGroup = new THREE.Group();
  scene.add(starsGroup);
  const stars = []; // { body group, surfaceMesh, coronaMesh, light, diskMesh, lensMesh, nebulaMesh, phase, orbitRadius, mass }

  // Allocate a full visual assembly per star once; we toggle visibility
  // instead of rebuilding so evolution transitions feel continuous.
  function makeStarAssembly() {
    const group = new THREE.Group();

    // Surface — shader sphere
    const surfMat = new THREE.ShaderMaterial({
      uniforms: {
        uColorCore:  { value: new THREE.Color(0xffaa55) },
        uColorHot:   { value: new THREE.Color(0xffeec8) },
        uTime:       { value: 0 },
        uPulse:      { value: 1 },
        uTurbulence: { value: 0.4 },
      },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
    });
    const surface = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), surfMat);
    group.add(surface);

    // Corona — additive shell
    const coronaMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:     { value: new THREE.Color(0xffd488) },
        uIntensity: { value: 1.0 },
        uTime:      { value: 0 },
      },
      vertexShader: CORONA_VERT,
      fragmentShader: CORONA_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const corona = new THREE.Mesh(new THREE.SphereGeometry(1.35, 32, 32), coronaMat);
    group.add(corona);

    // Halo + far glow via sprites (additional depth)
    const halo = makeSprite(makeRadialTex(0xffd488, 1.0), 6);
    group.add(halo);
    const farGlow = makeSprite(makeRadialTex(0xff8a3a, 0.25), 20);
    group.add(farGlow);

    // Dynamic point light
    const light = new THREE.PointLight(0xfff3d4, 3, 500, 1.2);
    scene.add(light);

    // ── Black hole accretion disk (hidden until isBlackHole) ──
    const diskMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uInner: { value: 0.18 }, uOuter: { value: 0.95 } },
      vertexShader: DISK_VERT,
      fragmentShader: DISK_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const disk = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), diskMat);
    disk.rotation.x = -Math.PI / 2 - 0.1; // slight tilt
    disk.visible = false;
    group.add(disk);

    // ── Lensing ring (hidden until isBlackHole) ──
    const lensMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffd488) } },
      vertexShader: STAR_VERT,
      fragmentShader: LENS_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
    });
    const lens = new THREE.Mesh(new THREE.SphereGeometry(1.6, 32, 32), lensMat);
    lens.visible = false;
    group.add(lens);

    // ── Nebula cloud (hidden until isNebula) ──
    const nebGeo = new THREE.BufferGeometry();
    const NEB_N = 1200;
    const nPos = new Float32Array(NEB_N * 3);
    const nCol = new Float32Array(NEB_N * 3);
    for (let i = 0; i < NEB_N; i++) {
      // Gaussian-like cloud via three cubed uniforms
      const r = Math.pow(Math.random(), 0.5) * 5;
      const u = Math.random(), v = Math.random();
      const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
      nPos[i * 3]     = r * Math.sin(ph) * Math.cos(th);
      nPos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.5; // flatten
      nPos[i * 3 + 2] = r * Math.cos(ph);
      const c = new THREE.Color().setHSL(0.65 + Math.random() * 0.15, 0.6, 0.4 + Math.random() * 0.3);
      nCol[i * 3] = c.r; nCol[i * 3 + 1] = c.g; nCol[i * 3 + 2] = c.b;
    }
    nebGeo.setAttribute('position', new THREE.BufferAttribute(nPos, 3));
    nebGeo.setAttribute('color', new THREE.BufferAttribute(nCol, 3));
    const nebMat = new THREE.PointsMaterial({
      size: 0.5, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const nebula = new THREE.Points(nebGeo, nebMat);
    nebula.visible = false;
    group.add(nebula);

    starsGroup.add(group);
    return {
      group, surface, surfMat, corona, coronaMat, halo, farGlow, light,
      disk, diskMat, lens, nebula,
    };
  }

  // ── Supernova blast wave (single reusable instance) ──
  const blastMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffddaa) },
      uAlpha: { value: 0 },
    },
    vertexShader: STAR_VERT,
    fragmentShader: `
      precision highp float;
      uniform vec3 uColor; uniform float uAlpha;
      varying vec3 vNormal;
      void main() {
        float rim = 1.0 - abs(dot(vNormal, normalize(vec3(0.0, 0.0, 1.0))));
        float a = pow(rim, 2.0) * uAlpha;
        gl_FragColor = vec4(uColor, clamp(a, 0.0, 1.0));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const blastWave = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), blastMat);
  blastWave.visible = false;
  scene.add(blastWave);
  const blastState = { active: false, t: 0, duration: 2.5 };

  // ── Planets ──
  const planetGroup = new THREE.Group();
  scene.add(planetGroup);
  const ringGroup = new THREE.Group();
  scene.add(ringGroup);

  let bodies = [];            // {id, pos, vel, mass, mesh, color, size, trail, trailState, semiMajor, eccentricity, inclination, periodEst, baseEmissive, ring}
  const bursts = [];          // collision particle bursts

  // ── Focus atmosphere ──
  const focusAtmoUniforms = {
    uColor:     { value: new THREE.Color(0x6aaaff) },
    uIntensity: { value: 0.6 },
    uLightDir:  { value: new THREE.Vector3(1, 0, 0) },
  };
  const focusAtmoMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 32),
    new THREE.ShaderMaterial({
      uniforms: focusAtmoUniforms,
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_FRAG,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    })
  );
  focusAtmoMesh.visible = false;
  scene.add(focusAtmoMesh);

  // ── Multi-belt ──
  const beltGroup = new THREE.Group();
  scene.add(beltGroup);
  let beltRenderers = []; // each: {id, points, data, spec}

  function rebuildBelts(params) {
    beltRenderers.forEach((br) => {
      beltGroup.remove(br.points);
      br.points.geometry.dispose();
      br.points.material.dispose();
    });
    beltRenderers = [];

    for (const spec of params.belts) {
      if (!spec.enabled) continue;
      const data = [];
      const total = Math.max(50, Math.min(3000, spec.density));
      let placed = 0, attempts = 0;
      const inner = spec.radius - spec.thickness / 2;
      const outer = spec.radius + spec.thickness / 2;
      while (placed < total && attempts < total * 4) {
        attempts++;
        const u = Math.random();
        // clustering profile: two gaps at u=0.3 and u=0.7, three density bumps
        const gapProximity = Math.min(Math.abs(u - 0.30), Math.abs(u - 0.70));
        if (gapProximity < 0.04 && Math.random() < 0.8) continue;
        const clusterBoost =
          Math.exp(-Math.pow((u - 0.1) / 0.08, 2)) +
          Math.exp(-Math.pow((u - 0.5) / 0.1,  2)) +
          Math.exp(-Math.pow((u - 0.85) / 0.07, 2)) + 0.25;
        if (Math.random() > clusterBoost / 1.5) continue;

        const r = inner + u * (outer - inner);
        const theta = Math.random() * Math.PI * 2;
        const y = (Math.random() - 0.5) * spec.spread;
        const size = 0.08 + Math.random() * Math.random() * 0.28;
        data.push({
          r, theta, y, speed: 0.0025 / Math.sqrt(r),
          drift: (Math.random() - 0.5) * 0.0004,
          yDrift: (Math.random() - 0.5) * 0.001,
          size,
        });
        placed++;
      }

      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(data.length * 3);
      for (let i = 0; i < data.length; i++) {
        pos[i * 3]     = data[i].r * Math.cos(data[i].theta);
        pos[i * 3 + 1] = data[i].y;
        pos[i * 3 + 2] = data[i].r * Math.sin(data[i].theta);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0xb8a888, size: 0.2, sizeAttenuation: true,
        transparent: true, opacity: 0.85, depthWrite: false,
      });
      const points = new THREE.Points(geo, mat);
      beltGroup.add(points);
      beltRenderers.push({ id: spec.id, points, data, spec });
    }
  }

  // ── Collision burst particles ──
  const BURST_COUNT = 40;
  function spawnBurst(pos, color) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(BURST_COUNT * 3);
    const velocities = [];
    for (let i = 0; i < BURST_COUNT; i++) {
      positions[i * 3]     = pos[0];
      positions[i * 3 + 1] = pos[1];
      positions[i * 3 + 2] = pos[2];
      velocities.push([
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
      ]);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color, size: 0.25, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(pts);
    bursts.push({ points: pts, velocities, life: 0, maxLife: 1.2 });
  }

  // ── Collision flash sprite (bright bloom at impact) ──
  function spawnFlash(pos, color) {
    const sprite = makeSprite(makeRadialTex(color, 1.0), 4);
    sprite.position.set(pos[0], pos[1], pos[2]);
    scene.add(sprite);
    bursts.push({ flash: sprite, life: 0, maxLife: 0.6 });
  }

  // ── Planet rebuild (elliptical + inclined) ──
  function rebuildPlanets(params) {
    bodies.forEach((b) => {
      if (b.mesh) { planetGroup.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
      if (b.trail) { scene.remove(b.trail); b.trail.geometry.dispose(); b.trail.material.dispose(); }
      if (b.ring) { ringGroup.remove(b.ring); b.ring.geometry.dispose(); b.ring.material.dispose(); }
    });
    while (ringGroup.children.length) {
      const c = ringGroup.children.pop();
      c.geometry.dispose(); c.material.dispose();
    }
    bodies = [];

    const M = params.starMass * 100;
    const count = Math.min(15, params.planetCount);
    for (let i = 0; i < count; i++) {
      const a = 7 + i * 3.5;
      const e = Math.min(0.35, params.eccentricity * (1 + Math.random() * 0.6));
      const inc = params.inclination * (Math.random() * 2 - 1);
      const argOfPeri = Math.random() * Math.PI * 2;
      const phase = Math.random() * Math.PI * 2;

      const { pos, vel } = keplerianInit({ G: 1, M, a, e, inc, argOfPeri, phase });

      const color = PLANET_PALETTE[i % PLANET_PALETTE.length];
      const isFocus = i === 0;
      const size = isFocus ? 0.75 : (0.35 + Math.random() * 0.45);

      const baseEmissive = isFocus ? 0.12 : 0.05;
      const mat = new THREE.MeshStandardMaterial({
        color, roughness: 0.72, metalness: 0.08,
        emissive: color, emissiveIntensity: baseEmissive,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 32, 32), mat);
      mesh.userData.bodyId = i;
      planetGroup.add(mesh);

      let ring = null;
      if (params.showOrbits) {
        const ringGeo = new THREE.RingGeometry(a - 0.02, a + 0.02, 128);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0x4477bb, transparent: true,
          opacity: isFocus ? 0.28 : 0.10, side: THREE.DoubleSide,
        });
        ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2 + inc;
        ring.rotation.z = argOfPeri * 0.3;
        ringGroup.add(ring);
      }

      let trail = null, trailState = null;
      if (params.showTrails) {
        const buf = new Float32Array(MAX_TRAIL * 3);
        const tGeo = new THREE.BufferGeometry();
        tGeo.setAttribute('position', new THREE.BufferAttribute(buf, 3));
        tGeo.setDrawRange(0, 0);
        trail = new THREE.Line(tGeo, new THREE.LineBasicMaterial({
          color, transparent: true, opacity: 0.55,
        }));
        scene.add(trail);
        trailState = { buf, idx: 0, count: 0, max: MAX_TRAIL };
      }

      bodies.push({
        id: i, pos, vel,
        mass: isFocus ? 0.08 : (0.005 + Math.random() * 0.04),
        mesh, color, size, trail, trailState, ring, baseEmissive,
        periodEst: orbitalPeriod(a, M),
        semiMajor: a,
        eccentricity: e,
        inclination: inc,
      });
      mesh.position.set(pos[0], pos[1], pos[2]);
    }
  }

  // ── Click-to-focus picker ──
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let onPickResult = null;

  function handlePick(clientX, clientY) {
    const el = renderer.domElement;
    const rect = el.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);
    const planetMeshes = bodies.map((b) => b.mesh).filter(Boolean);
    const hits = raycaster.intersectObjects(planetMeshes, false);
    if (hits.length && onPickResult) {
      onPickResult(hits[0].object.userData.bodyId);
    }
  }

  const dom = renderer.domElement;
  let mouseDownAt = null;
  const onMouseDown = (e) => { mouseDownAt = { x: e.clientX, y: e.clientY, t: performance.now() }; };
  const onMouseUp = (e) => {
    if (!mouseDownAt) return;
    const dx = e.clientX - mouseDownAt.x;
    const dy = e.clientY - mouseDownAt.y;
    const dt = performance.now() - mouseDownAt.t;
    if (Math.sqrt(dx * dx + dy * dy) < 4 && dt < 300) handlePick(e.clientX, e.clientY);
    mouseDownAt = null;
  };
  dom.addEventListener('mousedown', onMouseDown);
  dom.addEventListener('mouseup', onMouseUp);

  // ── Assemble initial stars (rebuilt when multiStar count changes) ──
  let lastSig = '';
  let lastStarCount = 0;
  let minE = 0, maxE = 0;
  let lastSupernovaTrigger = 0;

  // Focus camera — eased lerp to target position & zoom
  const focusLerp = {
    target: new THREE.Vector3(0, 0, 0),
    zoom: 60,
    active: false,
  };

  return {
    onPick(cb) { onPickResult = cb; },

    update(dt, t, params) {
      // ── Structural rebuilds ──
      const beltsSig = params.belts.map((b) => `${b.enabled}|${b.radius}|${b.thickness}|${b.density}|${b.spread}`).join(',');
      const sig = `${params.planetCount}|${params.showTrails}|${params.showOrbits}|${params.starMass}|${params.multiStar}|${params.eccentricity.toFixed(3)}|${params.inclination.toFixed(3)}|${beltsSig}`;

      if (params.multiStar !== lastStarCount) {
        // tear down all star assemblies + rebuild
        while (starsGroup.children.length) {
          const g = starsGroup.children.pop();
          g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        }
        stars.forEach((s) => { if (s.light) scene.remove(s.light); });
        stars.length = 0;
        const sep = params.multiStar === 1 ? 0 : params.multiStar === 2 ? 4 : 5;
        for (let i = 0; i < params.multiStar; i++) {
          const assembly = makeStarAssembly();
          const angle = (i / params.multiStar) * Math.PI * 2;
          assembly.group.position.set(Math.cos(angle) * sep, 0, Math.sin(angle) * sep);
          stars.push({
            ...assembly,
            orbitRadius: sep,
            phase: angle,
            mass: params.starMass * 100 / params.multiStar,
          });
        }
        lastStarCount = params.multiStar;
      }
      if (sig !== lastSig) {
        lastSig = sig;
        rebuildPlanets(params);
        rebuildBelts(params);
        minE = maxE = 0;
      }

      // ── Supernova trigger handling ──
      if (params.supernovaTrigger !== lastSupernovaTrigger) {
        lastSupernovaTrigger = params.supernovaTrigger;
        blastState.active = true;
        blastState.t = 0;
        // Impulse kick on every planet — pushes them outward
        bodies.forEach((b) => {
          if (!b.mesh) return;
          const r = Math.hypot(b.pos[0], b.pos[1], b.pos[2]) + 0.1;
          const impulse = 1.8 / r;
          b.vel[0] += (b.pos[0] / r) * impulse;
          b.vel[1] += (b.pos[1] / r) * impulse * 0.3;
          b.vel[2] += (b.pos[2] / r) * impulse;
        });
      }

      // ── Determine visual lifecycle params ──
      // If evolving, resolve from progress along the timeline.
      // Otherwise, use the selected stage directly.
      let stageVisual;
      if (params.evolving) {
        const tl = lifecycleTimeline(params.starMass);
        const { current, next, alpha } = resolveLifecycle(params.lifecycleProgress, tl);
        stageVisual = blendLifecycle(STAR_LIFECYCLE[current], STAR_LIFECYCLE[next], alpha);
      } else {
        stageVisual = STAR_LIFECYCLE[params.lifecycle] || STAR_LIFECYCLE.main;
      }

      // ── Update each star assembly ──
      const rgb = blackbodyRGB(stageVisual.tempK);
      const starColor = new THREE.Color(rgb[0], rgb[1], rgb[2]);
      const hotColor = new THREE.Color(
        Math.min(1, rgb[0] * 1.3 + 0.05),
        Math.min(1, rgb[1] * 1.2 + 0.03),
        Math.min(1, rgb[2] * 1.1 + 0.05)
      );

      stars.forEach((s, i) => {
        // Binary/ternary orbit
        if (stars.length > 1) {
          s.phase += dt * 0.3;
          s.group.position.set(
            Math.cos(s.phase) * s.orbitRadius,
            0,
            Math.sin(s.phase) * s.orbitRadius
          );
          s.light.position.copy(s.group.position);
        } else {
          s.group.position.set(0, 0, 0);
          s.light.position.set(0, 0, 0);
        }

        const baseSize = (2.0 + (params.starMass - 1) * 0.8) * stageVisual.sizeMult;
        const pulse = 1 + Math.sin(t * Math.max(0.1, stageVisual.pulseRate)) * stageVisual.pulseAmp;

        // Surface
        s.surface.visible = !stageVisual.isNebula && !stageVisual.isBlackHole;
        s.surfMat.uniforms.uTime.value = t;
        s.surfMat.uniforms.uPulse.value = pulse;
        s.surfMat.uniforms.uTurbulence.value = stageVisual.turbulence;
        s.surfMat.uniforms.uColorCore.value.copy(starColor);
        s.surfMat.uniforms.uColorHot.value.copy(hotColor);
        s.surface.scale.setScalar(baseSize);

        // Corona
        s.corona.visible = !stageVisual.isNebula && !stageVisual.isBlackHole && stageVisual.coronaMult > 0;
        s.coronaMat.uniforms.uColor.value.copy(starColor);
        s.coronaMat.uniforms.uIntensity.value = stageVisual.coronaMult;
        s.coronaMat.uniforms.uTime.value = t;
        s.corona.scale.setScalar(baseSize * 1.35);

        // Halo sprites
        s.halo.visible = s.corona.visible;
        s.farGlow.visible = s.corona.visible;
        s.halo.scale.setScalar(baseSize * 5 * stageVisual.coronaMult);
        s.farGlow.scale.setScalar(baseSize * 14 * stageVisual.coronaMult);
        s.halo.material.color.copy(starColor);
        s.farGlow.material.color.copy(starColor);

        // Point light
        s.light.color.copy(starColor);
        s.light.intensity = 2.5 * stageVisual.lumMult * pulse;

        // Black hole
        s.disk.visible = !!stageVisual.isBlackHole;
        s.lens.visible = !!stageVisual.isBlackHole;
        if (stageVisual.isBlackHole) {
          s.diskMat.uniforms.uTime.value = t;
          const diskSize = baseSize * 5;
          s.disk.scale.setScalar(diskSize);
          s.lens.scale.setScalar(baseSize * 1.6);
          // Core must be dark in black-hole mode
          s.surface.visible = true;           // used as dark sphere
          s.surfMat.uniforms.uColorCore.value.set(0x000000);
          s.surfMat.uniforms.uColorHot.value.set(0x000000);
          s.surfMat.uniforms.uTurbulence.value = 0;
          s.surface.scale.setScalar(baseSize * 1.0);
        }

        // Nebula
        s.nebula.visible = !!stageVisual.isNebula;
        if (stageVisual.isNebula) {
          s.nebula.rotation.y += dt * 0.05;
          s.nebula.rotation.x = Math.sin(t * 0.03) * 0.2;
        }
      });

      // ── Lifecycle autopilot (Run Evolution) ──
      if (params.evolving) {
        // Progress at ~6% per second — about 16 seconds to traverse
        const newProgress = Math.min(1, params.lifecycleProgress + dt * 0.06);
        if (newProgress !== params.lifecycleProgress) {
          // Emit change — module-level listener updates Redux (outside this file)
          this._onEvolveProgress?.(newProgress);
        }
      }

      // ── Supernova blast wave animation ──
      if (blastState.active) {
        blastState.t += dt;
        const u = blastState.t / blastState.duration;
        if (u >= 1) {
          blastState.active = false;
          blastWave.visible = false;
        } else {
          blastWave.visible = true;
          const radius = 2 + u * 80;
          blastWave.scale.setScalar(radius);
          blastMat.uniforms.uAlpha.value = (1 - u) * 0.8;
          blastMat.uniforms.uColor.value.setRGB(1, 0.9 - u * 0.3, 0.6 - u * 0.4);
        }
      }

      // ── N-body integration ──
      const timeScale = params.timeScale * (params.evolving ? 1.4 : 1);
      const subSteps = 3;
      const stepDt = (0.015 * timeScale) / subSteps;

      for (let s = 0; s < subSteps; s++) {
        const starBodies = stars.map((st) => ({
          x: st.group.position.x, y: st.group.position.y, z: st.group.position.z,
          vx: 0, vy: 0, vz: 0, mass: st.mass,
        }));
        const planetBodies = bodies.map((b) => ({
          x: b.pos[0], y: b.pos[1], z: b.pos[2],
          vx: b.vel[0], vy: b.vel[1], vz: b.vel[2], mass: b.mass,
        }));
        const all = [...starBodies, ...planetBodies];
        const acc = nbodyAccel(all, 1, 0.35);

        for (let i = 0; i < bodies.length; i++) {
          const b = bodies[i];
          const a = acc[starBodies.length + i];
          b.vel[0] += a.x * stepDt;
          b.vel[1] += a.y * stepDt;
          b.vel[2] += a.z * stepDt;

          // Chaos mode — stronger kicks + brief tangential swirl so orbits wobble
          if (params.chaos) {
            const kick = 0.008 * timeScale;
            b.vel[0] += (Math.random() - 0.5) * kick;
            b.vel[1] += (Math.random() - 0.5) * kick * 0.4;
            b.vel[2] += (Math.random() - 0.5) * kick;
          }

          b.pos[0] += b.vel[0] * stepDt;
          b.pos[1] += b.vel[1] * stepDt;
          b.pos[2] += b.vel[2] * stepDt;

          const r = Math.hypot(b.pos[0], b.pos[1], b.pos[2]);
          const starSize = stars[0] ? stars[0].surface.scale.x : 2;
          if (r < starSize + 0.4) {
            spawnBurst(b.pos, b.color);
            spawnFlash(b.pos, stageVisual.isBlackHole ? 0x000000 : b.color);
            // Respawn far out (less destructive than deleting)
            b.pos = [80 + Math.random() * 20, 0, (Math.random() - 0.5) * 10];
            b.vel = [0, 0, 0];
          } else if (r > 260) {
            b.pos = [300, 0, 0]; b.vel = [0, 0, 0];
          }
        }

        // Collisions between planets
        if (params.collisions) {
          for (let i = 0; i < bodies.length; i++) {
            for (let j = i + 1; j < bodies.length; j++) {
              const A = bodies[i], B = bodies[j];
              if (A.mass === 0 || B.mass === 0) continue;
              const dx = A.pos[0] - B.pos[0];
              const dy = A.pos[1] - B.pos[1];
              const dz = A.pos[2] - B.pos[2];
              const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
              const collideDist = Math.max(MERGE_DIST, (A.size + B.size) * 0.9);
              if (dist < collideDist) {
                const totalM = A.mass + B.mass;
                const vx = (A.mass * A.vel[0] + B.mass * B.vel[0]) / totalM;
                const vy = (A.mass * A.vel[1] + B.mass * B.vel[1]) / totalM;
                const vz = (A.mass * A.vel[2] + B.mass * B.vel[2]) / totalM;
                A.pos = [
                  (A.mass * A.pos[0] + B.mass * B.pos[0]) / totalM,
                  (A.mass * A.pos[1] + B.mass * B.pos[1]) / totalM,
                  (A.mass * A.pos[2] + B.mass * B.pos[2]) / totalM,
                ];
                A.vel = [vx, vy, vz];
                A.mass = totalM;
                A.size = Math.min(1.4, Math.cbrt(A.size ** 3 + B.size ** 3));
                A.mesh.scale.setScalar(A.size / (A.mesh.geometry.parameters.radius));

                spawnBurst(A.pos, A.color);
                spawnFlash(A.pos, 0xffddaa);

                if (B.mesh) { planetGroup.remove(B.mesh); B.mesh.geometry.dispose(); B.mesh.material.dispose(); B.mesh = null; }
                if (B.trail) { scene.remove(B.trail); B.trail.geometry.dispose(); B.trail.material.dispose(); B.trail = null; }
                if (B.ring)  { ringGroup.remove(B.ring); B.ring.geometry.dispose(); B.ring.material.dispose(); B.ring = null; }
                B.mass = 0; B.pos = [500, 0, 0]; B.vel = [0, 0, 0];
              }
            }
          }
        }
      }

      // ── Planet sync + trails + focus dimming + reactions ──
      const focusId = params.focusBodyId;

      // Effective luminosity for habitable zone calc (uses current lifecycle lumMult)
      const effectiveLum = params.starMass * stageVisual.lumMult;
      const hz = habitableZone(effectiveLum);

      // Primary star position — used for distance-based effects
      const primaryStarPos = stars[0]?.group.position || new THREE.Vector3();

      let planetsInZone = 0;

      for (const b of bodies) {
        if (!b.mesh) continue;
        b.mesh.position.set(b.pos[0], b.pos[1], b.pos[2]);

        // ── Distance-to-star for reactions ──
        const dx = b.pos[0] - primaryStarPos.x;
        const dy = b.pos[1] - primaryStarPos.y;
        const dz = b.pos[2] - primaryStarPos.z;
        const distStar = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // ── Habitable zone check ──
        const inZone = distStar >= hz.inner && distStar <= hz.outer;
        if (inZone) planetsInZone++;
        b.inZone = inZone;

        // ── Focus dim (baseline emissive) ──
        let targetEmissive;
        if (focusId !== null && focusId !== undefined) {
          targetEmissive = b.id === focusId ? Math.max(0.25, b.baseEmissive * 2.5) : b.baseEmissive * 0.4;
        } else {
          targetEmissive = b.baseEmissive;
        }
        // Habitable-zone glow boost
        if (inZone) targetEmissive += 0.12;

        // ── Temperature reaction tint on emissive color ──
        // Very hot (close) → shift emissive toward orange/red; very cold (far) → toward blue
        const tempFactor = Math.max(-1, Math.min(1, (8 - distStar) / 14));
        // +1 hot, -1 cold, 0 neutral
        if (!b._baseColor) b._baseColor = new THREE.Color(b.color);
        const blendTarget = new THREE.Color();
        if (tempFactor > 0) {
          // Hot: blend toward red/orange
          blendTarget.copy(b._baseColor).lerp(new THREE.Color(0xff5533), Math.min(0.7, tempFactor));
        } else if (tempFactor < 0) {
          // Cold: blend toward blue
          blendTarget.copy(b._baseColor).lerp(new THREE.Color(0x6aaaff), Math.min(0.5, -tempFactor));
        } else {
          blendTarget.copy(b._baseColor);
        }
        // Habitable zone: additional green shift
        if (inZone) blendTarget.lerp(new THREE.Color(0x58f5a0), 0.18);
        b.mesh.material.color.lerp(blendTarget, 0.06);
        b.mesh.material.emissive.lerp(blendTarget, 0.06);
        b.mesh.material.emissiveIntensity += (targetEmissive - b.mesh.material.emissiveIntensity) * 0.08;

        if (b.ring) {
          let rTarget;
          if (focusId !== null && focusId !== undefined) {
            rTarget = b.id === focusId ? 0.5 : 0.08;
          } else {
            rTarget = b.id === 0 ? 0.28 : 0.10;
          }
          b.ring.material.opacity += (rTarget - b.ring.material.opacity) * 0.08;
        }

        // ── Black-hole matter interaction: stretch + fade near BH ──
        if (stageVisual.isBlackHole && distStar < 12) {
          const pull = Math.max(0, 1 - distStar / 12);  // 0..1
          // Stretch along radial axis using mesh scale
          const stretch = 1 + pull * 1.8;
          // orient the stretch along the radial direction:
          // easiest approach — scale only, lookAt origin so Z axis aligns
          b.mesh.lookAt(primaryStarPos);
          b.mesh.scale.set(1 - pull * 0.4, 1 - pull * 0.4, stretch);
          // Fade alpha — but MeshStandardMaterial doesn't support opacity well without transparent=true
          b.mesh.material.opacity = 1 - pull * 0.6;
          b.mesh.material.transparent = pull > 0.1;
        } else {
          // Smoothly restore scale / opacity
          b.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
          if (b.mesh.material.opacity < 1) {
            b.mesh.material.opacity = Math.min(1, b.mesh.material.opacity + 0.05);
            if (b.mesh.material.opacity >= 0.995) {
              b.mesh.material.transparent = false;
              b.mesh.material.opacity = 1;
            }
          }
        }

        // Trails
        if (b.trailState && b.trail) {
          const ts = b.trailState;
          const jx = params.chaos ? (Math.random() - 0.5) * 0.15 : 0;
          const jz = params.chaos ? (Math.random() - 0.5) * 0.15 : 0;
          ts.buf[ts.idx * 3]     = b.pos[0] + jx;
          ts.buf[ts.idx * 3 + 1] = b.pos[1];
          ts.buf[ts.idx * 3 + 2] = b.pos[2] + jz;
          ts.idx = (ts.idx + 1) % ts.max;
          ts.count = Math.min(ts.count + 1, ts.max);
          const linear = new Float32Array(ts.count * 3);
          for (let k = 0; k < ts.count; k++) {
            const srcIdx = (ts.idx - ts.count + k + ts.max) % ts.max;
            linear[k * 3]     = ts.buf[srcIdx * 3];
            linear[k * 3 + 1] = ts.buf[srcIdx * 3 + 1];
            linear[k * 3 + 2] = ts.buf[srcIdx * 3 + 2];
          }
          b.trail.geometry.setAttribute('position', new THREE.BufferAttribute(linear, 3));
          b.trail.geometry.setDrawRange(0, ts.count);
          b.trail.geometry.attributes.position.needsUpdate = true;
          b.trail.material.opacity = Math.min(0.95, 0.45 + (params.timeScale - 1) * 0.15);
        }

        // ── GHOST TRAIL: during time-lapse, render past positions as fading spheres ──
        if (params.timeScale > 1.8 && b.trailState) {
          if (!b.ghosts) {
            b.ghosts = Array.from({ length: GHOSTS_PER_PLANET }, () => {
              const mat = new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
              const geo = new THREE.SphereGeometry(b.size * 0.7, 12, 12);
              const mesh = new THREE.Mesh(geo, mat);
              scene.add(mesh);
              return mesh;
            });
          }
          const ts = b.trailState;
          for (let g = 0; g < GHOSTS_PER_PLANET; g++) {
            const stride = Math.floor(ts.count / (GHOSTS_PER_PLANET + 1));
            const idxFromNewest = (g + 1) * stride;
            if (idxFromNewest >= ts.count) { b.ghosts[g].material.opacity = 0; continue; }
            const srcIdx = (ts.idx - idxFromNewest + ts.max) % ts.max;
            b.ghosts[g].position.set(
              ts.buf[srcIdx * 3], ts.buf[srcIdx * 3 + 1], ts.buf[srcIdx * 3 + 2]
            );
            b.ghosts[g].material.opacity = (1 - g / GHOSTS_PER_PLANET) * 0.35;
            b.ghosts[g].visible = true;
          }
        } else if (b.ghosts) {
          b.ghosts.forEach((g) => { g.visible = false; });
        }
      }

      // Update habitable zone ring geometry (lerp)
      habitableMat.uniforms.uInner.value += (hz.inner - habitableMat.uniforms.uInner.value) * 0.08;
      habitableMat.uniforms.uOuter.value += (hz.outer - habitableMat.uniforms.uOuter.value) * 0.08;
      habitableMat.uniforms.uTime.value = t;
      habitableRing.visible = params.showHabitableZone && !stageVisual.isBlackHole && !stageVisual.isNebula;
      // Keep mesh size roughly 200 units — the shader reads uInner/uOuter in the same scale


      // ── Focus atmosphere + camera ease ──
      if (focusId !== null && focusId !== undefined) {
        const focus = bodies.find((b) => b.id === focusId && b.mesh);
        if (focus) {
          focusAtmoMesh.visible = true;
          focusAtmoMesh.position.copy(focus.mesh.position);
          focusAtmoMesh.scale.setScalar(focus.size * 1.4);
          const starPos = stars[0]?.group.position || new THREE.Vector3();
          focusAtmoUniforms.uLightDir.value.copy(
            new THREE.Vector3().subVectors(starPos, focus.mesh.position).normalize()
          );

          // Camera target eases to planet
          focusLerp.target.copy(focus.mesh.position);
          focusLerp.zoom = 20;
          focusLerp.active = true;
        } else {
          focusAtmoMesh.visible = false;
        }
      } else {
        focusAtmoMesh.visible = false;
        focusLerp.target.set(0, 0, 0);
        focusLerp.zoom = 60;
      }

      // Smooth camera retarget + zoom damping (custom controller exposes setTarget/setRadius)
      if (controls.setTarget) {
        const currentTarget = new THREE.Vector3();
        controls.getTarget?.(currentTarget);
        // We don't have getTarget — just call setTarget unconditionally with focused position.
        controls.setTarget(focusLerp.target);
      }

      // ── Belts update ──
      beltRenderers.forEach((br) => {
        const apos = br.points.geometry.attributes.position.array;
        const chaosAmp = params.chaos ? 0.05 : 0;
        for (let i = 0; i < br.data.length; i++) {
          const a = br.data[i];
          a.theta += (a.speed + a.drift) * dt * 100 * params.timeScale;
          a.y += a.yDrift * dt * 60 * params.timeScale;
          // Keep y bounded by belt spread
          if (Math.abs(a.y) > br.spec.spread * 0.6) a.yDrift *= -1;
          const rWob = a.r + Math.sin(t * 0.3 + i) * 0.04 + (Math.random() - 0.5) * chaosAmp;
          apos[i * 3]     = rWob * Math.cos(a.theta);
          apos[i * 3 + 1] = a.y;
          apos[i * 3 + 2] = rWob * Math.sin(a.theta);
        }
        br.points.geometry.attributes.position.needsUpdate = true;
      });

      // ── GRAVITY FIELD GRID ── feed current star positions + masses in
      gravityGrid.visible = params.showGravityField;
      if (gravityGrid.visible) {
        gravityUniforms.uTime.value = t;
        gravityUniforms.uMassCount.value = Math.min(4, stars.length);
        for (let i = 0; i < Math.min(4, stars.length); i++) {
          const p = stars[i].group.position;
          const mass = stars[i].mass * 0.12; // scale for grid depth
          gravityUniforms.uMasses.value[i].set(p.x, p.y, p.z, mass);
        }
        gravityUniforms.uBlackHole.value = stageVisual.isBlackHole ? 1 : 0;
        // Fade opacity gently on chaos / supernova for drama
        const targetOp = stageVisual.isBlackHole ? 0.32 : (blastState.active ? 0.28 : 0.16);
        gravityUniforms.uOpacity.value += (targetOp - gravityUniforms.uOpacity.value) * 0.08;
      }

      // ── SOLAR FLARES ── stochastic emission from stars (more for unstable stages)
      flareTimer += dt;
      const flareInterval = stageVisual.turbulence > 0.7 ? 0.25 : 0.9;
      if (flareTimer > flareInterval && stars.length > 0 && !stageVisual.isBlackHole && !stageVisual.isNebula) {
        flareTimer = 0;
        const s = stars[Math.floor(Math.random() * stars.length)];
        const starSize = s.surface.scale.x;
        spawnFlare(s.group.position, 0xffb060, starSize);
      }
      flares.forEach((f) => {
        if (!f.active) return;
        f.life += dt;
        const u = f.life / f.maxLife;
        if (u >= 1) { f.active = false; f.mat.opacity = 0; return; }
        // Build line segment: from star surface outward
        const len = f.length * Math.sin(u * Math.PI);
        f.pos[0] = f.origin.x;
        f.pos[1] = f.origin.y;
        f.pos[2] = f.origin.z;
        f.pos[3] = f.origin.x + f.dir.x * len;
        f.pos[4] = f.origin.y + f.dir.y * len;
        f.pos[5] = f.origin.z + f.dir.z * len;
        f.line.geometry.attributes.position.needsUpdate = true;
        f.mat.opacity = (1 - u) * 0.9;
      });

      // ── OBSERVATION MODE ── cinematic camera autopilot
      if (params.observationMode) {
        // Cycle through targets every 5 seconds: star center → focus planet or random planet → belts → back
        const cycle = 5.0;
        const phase = Math.floor((t / cycle) % 4);
        const localT = (t / cycle) % 1;
        let autoTarget = new THREE.Vector3(0, 0, 0);
        let autoRadius = 60;
        if (phase === 0) {
          autoTarget.set(0, 0, 0); autoRadius = 70;
        } else if (phase === 1) {
          // pick first alive planet
          const p = bodies.find((b) => b.mesh && b.mass > 0);
          if (p) { autoTarget.set(p.pos[0], p.pos[1], p.pos[2]); autoRadius = 25; }
        } else if (phase === 2) {
          // belt close-up: orbit outside, tilt camera
          autoTarget.set(Math.cos(t * 0.1) * 10, 0, Math.sin(t * 0.1) * 10);
          autoRadius = 50;
        } else {
          // zoom way out
          autoTarget.set(0, 6, 0); autoRadius = 95;
        }
        // Smooth ease
        if (controls.setTarget) controls.setTarget(autoTarget);
        if (controls.setRadius) {
          const current = controls.getRadius?.() ?? 60;
          controls.setRadius(current + (autoRadius - current) * 0.02);
        }
        // Slow yaw around the target
        // (Custom orbit controller doesn't expose theta; fake it with small radius tweak instead)
      }

      // ── Collision bursts update ──
      for (let i = bursts.length - 1; i >= 0; i--) {
        const br = bursts[i];
        br.life += dt;
        if (br.points) {
          const arr = br.points.geometry.attributes.position.array;
          for (let k = 0; k < BURST_COUNT; k++) {
            arr[k * 3]     += br.velocities[k][0] * dt;
            arr[k * 3 + 1] += br.velocities[k][1] * dt;
            arr[k * 3 + 2] += br.velocities[k][2] * dt;
            br.velocities[k][0] *= 0.96;
            br.velocities[k][1] *= 0.96;
            br.velocities[k][2] *= 0.96;
          }
          br.points.geometry.attributes.position.needsUpdate = true;
          br.points.material.opacity = 1 - br.life / br.maxLife;
        }
        if (br.flash) {
          const u = br.life / br.maxLife;
          br.flash.scale.setScalar(4 + u * 10);
          br.flash.material.opacity = Math.max(0, 1 - u);
        }
        if (br.life >= br.maxLife) {
          if (br.points) { scene.remove(br.points); br.points.geometry.dispose(); br.points.material.dispose(); }
          if (br.flash)  { scene.remove(br.flash);  br.flash.material.map?.dispose(); br.flash.material.dispose(); }
          bursts.splice(i, 1);
        }
      }

      // ── Background parallax (scales with camera motion — cheap approximation) ──
      starShells.forEach((sh, i) => { sh.rotation.y += dt * 0.003 * (i + 1); });

      // ── Analytics ──
      const E = computeEnergy(stars, bodies);
      if (minE === 0 && maxE === 0) { minE = maxE = E; }
      minE = Math.min(minE, E); maxE = Math.max(maxE, E);
      const drift = Math.abs(maxE - minE) / (Math.abs(E) + 1e-9);

      const alive = bodies.filter((b) => b.mass > 0).length;
      let statusLabel;
      if (blastState.active) statusLabel = 'SUPERNOVA EVENT';
      else if (stageVisual.isBlackHole) statusLabel = 'BLACK HOLE FORMED';
      else if (params.chaos) statusLabel = 'CHAOTIC DRIFT';
      else if (drift > 0.4) statusLabel = 'UNSTABLE';
      else if (drift > 0.1) statusLabel = 'APPROACHING INSTABILITY';
      else if (alive < bodies.length) statusLabel = 'EJECTIONS OBSERVED';
      else if (stars.length > 1) statusLabel = 'BINARY ORBIT STABLE';
      else statusLabel = 'STABLE';

      const periods = bodies.filter((b) => b.mass > 0).map((b) => b.periodEst);
      const resonances = detectResonances(periods);

      this._analytics = {
        stability: statusLabel,
        drift,
        bodyCount: alive + beltRenderers.reduce((a, br) => a + br.data.length, 0) + stars.length,
        planetAlive: alive,
        planetsInZone,
        resonances,
        focusBody: focusId !== null ? bodies.find((b) => b.id === focusId) : null,
        lifecycleStage: params.evolving
          ? resolveLifecycle(params.lifecycleProgress, lifecycleTimeline(params.starMass)).current
          : params.lifecycle,
      };
    },

    getAnalytics() {
      return this._analytics || {
        stability: 'STABLE', drift: 0, bodyCount: 0, planetAlive: 0, planetsInZone: 0,
        resonances: [], focusBody: null, lifecycleStage: 'main',
      };
    },

    setEvolveListener(cb) { this._onEvolveProgress = cb; },

    dispose() {
      dom.removeEventListener('mousedown', onMouseDown);
      dom.removeEventListener('mouseup', onMouseUp);
      beltRenderers.forEach((br) => { br.points.geometry.dispose(); br.points.material.dispose(); });
      stars.forEach((s) => {
        s.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        if (s.light) scene.remove(s.light);
      });
      bodies.forEach((b) => {
        if (b.mesh) { b.mesh.geometry.dispose(); b.mesh.material.dispose(); }
        if (b.trail) { b.trail.geometry.dispose(); b.trail.material.dispose(); }
      });
      bursts.forEach((br) => {
        if (br.points) { br.points.geometry.dispose(); br.points.material.dispose(); }
        if (br.flash) { br.flash.material.dispose(); }
      });
      starShells.forEach((s) => { s.geometry.dispose(); s.material.dispose(); });
      focusAtmoMesh.geometry.dispose(); focusAtmoMesh.material.dispose();
      blastWave.geometry.dispose(); blastMat.dispose();
      gravityGeo.dispose(); gravityMat.dispose();
      habitableRing.geometry.dispose(); habitableMat.dispose();
      flares.forEach((f) => { f.line.geometry.dispose(); f.mat.dispose(); });
      bodies.forEach((b) => {
        if (b.ghosts) b.ghosts.forEach((g) => { g.geometry.dispose(); g.material.dispose(); });
      });
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

function computeEnergy(stars, bodies) {
  let E = 0;
  const all = [
    ...stars.map((s) => ({ pos: [s.group.position.x, s.group.position.y, s.group.position.z], vel: [0,0,0], mass: s.mass })),
    ...bodies,
  ];
  for (const b of all) {
    const v = b.vel || [0, 0, 0];
    E += 0.5 * b.mass * (v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  }
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const pi = all[i].pos, pj = all[j].pos;
      const dx = pj[0] - pi[0], dy = pj[1] - pi[1], dz = pj[2] - pi[2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.01);
      E -= (all[i].mass * all[j].mass) / r;
    }
  }
  return E;
}

function makeStarfield(n, radius, size, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    pos[i * 3]     = radius * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = radius * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = radius * Math.cos(ph);
    const c = new THREE.Color().setHSL(
      Math.random() < 0.85 ? 0.6 : 0.1, 0.3, 0.5 + Math.random() * 0.4
    );
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size, sizeAttenuation: true, vertexColors: true, transparent: true, opacity,
  }));
}

function makeRadialTex(colorHex, alpha) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  const col = new THREE.Color(colorHex);
  const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
  grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.35})`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
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
