import * as THREE from 'three';

// ────────────────────────────────────────────────────────────────────────────
//  PLANET SCENE — multi-layer renderer.
//
//  Architecture overview:
//
//    Redux params (raw slider values)
//          │
//          ▼  every frame
//    physics.js (irradiance, Teq, ...)
//          │
//          ▼
//    target values  ── lerp ──►  live values
//          │                          │
//          │                          ▼
//          │                    GPU shader uniforms
//          │                          │
//          ▼                          ▼
//    DirectionalLight intensity / position    Planet surface, atmosphere, sky
//
//  Everything visible is driven by physics → live (smooth) → uniforms. No
//  abrupt visual snaps when a slider moves.
//
//  Layers from inside out:
//    planet (shader, terrain)        2.000 r
//    cloud (lambert)                 2.010 r   (tight to surface — no halo gap)
//    atmosphere inner (fresnel)      2.060 r   (thin rim, sharp falloff)
//    atmosphere outer scatter        2.220 r   (very faint Rayleigh-ish glow)
//
//  Surface view is a single 60-unit sky-and-ground sphere with a shader that
//  blends sky on top, ground on bottom, with a sun glow positioned to match
//  the actual star direction. No flat plane → no broken horizon edge.
// ────────────────────────────────────────────────────────────────────────────

const PLANET_RADIUS = 2;
const HEIGHTMAP_SIZE = 512;

export function createPlanetScene({ scene, camera, renderer, controls }) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  camera.position.set(0, 1.5, 9);
  controls.setRadius(9);
  scene.fog = null;

  // ── Star direction (constant unit vector — only distance varies) ───────
  const STAR_DIR = new THREE.Vector3(0.78, 0.26, 0.42).normalize();

  // ── Lighting ────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0x0e1428, 0.22));

  const starLight = new THREE.DirectionalLight(0xffeacc, 1.5);
  starLight.castShadow = true;
  starLight.shadow.mapSize.set(1024, 1024);
  starLight.shadow.camera.near = 1;
  starLight.shadow.camera.far = 80;
  const so = 6;
  Object.assign(starLight.shadow.camera, { left: -so, right: so, top: so, bottom: -so });
  starLight.shadow.bias = -0.0005;
  scene.add(starLight);
  scene.add(starLight.target); // target stays at origin

  // Visible star body + halo + corona (positions update each frame)
  const starMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.0, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff4d0 })
  );
  scene.add(starMesh);

  const starHalo = makeSprite(makeRadialTex(0xfff0c0, 1.0), 8);
  scene.add(starHalo);
  const starCorona = makeSprite(makeRadialTex(0xff8a3a, 0.45), 22);
  scene.add(starCorona);

  // ── Background — three parallax star shells + faint nebulae ────────────
  // Different shell rotation rates create perceived depth as the camera moves.
  const farStars  = makeStarfield(1100, 250, 0.30, 0.92);
  const midStars  = makeStarfield(550,  140, 0.50, 0.85);
  const nearStars = makeStarfield(220,  70,  0.85, 0.75);
  scene.add(farStars, midStars, nearStars);

  const nebulaA = makeSprite(makeRadialTex(0x4a2b8c, 0.35), 90);
  nebulaA.position.set(-25, -10, -55);
  scene.add(nebulaA);
  const nebulaB = makeSprite(makeRadialTex(0x1a4080, 0.28), 70);
  nebulaB.position.set(30, 14, -60);
  scene.add(nebulaB);

  // ── Planet group ───────────────────────────────────────────────────────
  const planetGroup = new THREE.Group();
  scene.add(planetGroup);

  // Planet shader — 3D noise computed in shader; no UV seams. Terrain
  // displacement is applied in the vertex shader so mountains are real geometry.
  const planetUniforms = {
    uTime:           { value: 0 },
    uWaterLevel:     { value: 0.5 },
    uIceCap:         { value: 0.1 },
    uTempBias:       { value: 0 },     // -1 cold .. +1 hot
    uCO2:            { value: 0 },
    uO2:             { value: 0.21 },
    uChaos:          { value: 0 },
    uLightDir:       { value: STAR_DIR.clone() },
    uLightIntensity: { value: 1.0 },
    uLightColor:     { value: new THREE.Color(0xfff3d4) }, // tints day side
    uTerrainHeight:  { value: 1.0 },
    uCityLights:     { value: 1 },
    uCameraDistance: { value: 9 },
  };
  const planetMat = new THREE.ShaderMaterial({
    uniforms: planetUniforms,
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    lights: false,
  });
  // Higher segment count (192²) so vertex displacement produces visible mountains
  const planetMesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS, 192, 128),
    planetMat
  );
  planetGroup.add(planetMesh);

  // ── Water layer — separate physical mesh slightly above mean sea level ──
  // Fresnel-style specular + gentle surface wave normals via shader noise.
  const waterUniforms = {
    uTime:       { value: 0 },
    uLightDir:   { value: STAR_DIR.clone() },
    uLightColor: { value: new THREE.Color(0xfff3d4) },
    uDeepColor:     { value: new THREE.Color(0x05162f) },
    uShallowColor:  { value: new THREE.Color(0x2a6fb8) },
    uWaterLevel:    { value: 0.5 },
    uSpecularStrength: { value: 1.0 },
  };
  const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
    lights: false,
  });
  const waterMesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS + 0.005, 128, 96),
    waterMat
  );
  planetGroup.add(waterMesh);

  // Invisible shadow receiver (soft-only, doesn't tint visuals)
  const shadowReceiver = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS * 1.001, 64, 64),
    new THREE.MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.0001, roughness: 1 })
  );
  shadowReceiver.receiveShadow = true;
  planetGroup.add(shadowReceiver);

  // ── Cloud layer (dynamic shader with animated fbm — no UV seam) ───────
  const cloudUniforms = {
    uTime:      { value: 0 },
    uDensity:   { value: 0.5 },
    uLightDir:  { value: STAR_DIR.clone() },
    uLightColor: { value: new THREE.Color(0xfff3d4) },
  };
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: cloudUniforms,
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    lights: false,
  });
  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS * 1.015, 96, 72),
    cloudMat
  );
  planetGroup.add(cloudMesh);

  // ── Atmosphere — single thin shell (Rayleigh-style scattering) ─────────
  // The earlier two-shell setup created a visible "thick ring" at the outer
  // shell; spec asks for "light, not geometry". Now: one shell hugging the
  // surface, with a sharp fresnel rim that fades to nothing on either side.
  const atmoUniforms = {
    uColor:     { value: new THREE.Color(0x6aaaff) },
    uIntensity: { value: 0.4 },
    uChaos:     { value: 0 },
    uTime:      { value: 0 },
    uLightDir:  { value: STAR_DIR.clone() },
  };

  const atmoInner = new THREE.Mesh(
    new THREE.SphereGeometry(PLANET_RADIUS * 1.025, 64, 64),
    new THREE.ShaderMaterial({
      uniforms: atmoUniforms,
      vertexShader: ATMO_VERT,
      fragmentShader: ATMO_INNER_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    })
  );
  planetGroup.add(atmoInner);

  // ── Rings ──────────────────────────────────────────────────────────────
  const ringGroup = new THREE.Group();
  ringGroup.rotation.x = -0.35;
  planetGroup.add(ringGroup);
  let ringPoints = null;

  function rebuildRings(p) {
    if (ringPoints) {
      ringGroup.remove(ringPoints);
      ringPoints.geometry.dispose();
      ringPoints.material.dispose();
      ringPoints = null;
    }
    if (!p.rings.enabled) return;
    const n = Math.max(50, Math.min(5000, p.rings.density));
    const inner = p.rings.radius;
    const outer = inner + p.rings.thickness;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const baseCol = new THREE.Color(0xc8b88e);
    for (let i = 0; i < n; i++) {
      const r = inner + Math.random() * (outer - inner);
      const t = Math.random() * Math.PI * 2;
      pos[i * 3]     = r * Math.cos(t);
      pos[i * 3 + 1] = (Math.random() - 0.5) * 0.04;
      pos[i * 3 + 2] = r * Math.sin(t);
      const v = 0.7 + Math.random() * 0.5;
      col[i * 3]     = baseCol.r * v;
      col[i * 3 + 1] = baseCol.g * v;
      col[i * 3 + 2] = baseCol.b * v;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ringPoints = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.04, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    ringGroup.add(ringPoints);
  }

  // ── Moons ──────────────────────────────────────────────────────────────
  const moonsGroup = new THREE.Group();
  scene.add(moonsGroup);
  let moons = [];

  function rebuildMoons(p) {
    moons.forEach((m) => {
      moonsGroup.remove(m.mesh);
      m.mesh.geometry.dispose();
      m.mesh.material.dispose();
    });
    moons = [];
    for (let i = 0; i < p.moonCount; i++) {
      const size = p.moonSize * (0.85 + Math.random() * 0.3);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 24, 24),
        new THREE.MeshStandardMaterial({ color: 0xb8b3a8, roughness: 0.95, metalness: 0 })
      );
      mesh.castShadow = true;
      moonsGroup.add(mesh);
      moons.push({
        mesh,
        phase: (i / p.moonCount) * Math.PI * 2 + Math.random() * 0.5,
        orbit: p.moonOrbit + i * 0.6,
        speed: 0.35 - i * 0.04,
        inclination: (Math.random() - 0.5) * 0.4,
      });
    }
  }

  // ── Surface view — single sky+ground sphere ────────────────────────────
  // No more flat ground plane. The shader renders sky on the upper hemisphere
  // and ground on the lower, blending across the horizon line so there's no
  // visible seam. Sun is rendered inside the same shader at the actual star
  // direction (matched to the directional light above).
  const surfaceGroup = new THREE.Group();
  surfaceGroup.visible = false;
  scene.add(surfaceGroup);

  const skyUniforms = {
    uSkyTop:       { value: new THREE.Color(0x4a78b8) },
    uSkyHorizon:   { value: new THREE.Color(0xc88a55) },
    uGroundNear:   { value: new THREE.Color(0x5a4a35) },
    uGroundFar:    { value: new THREE.Color(0x2a221a) },
    uSunDir:       { value: STAR_DIR.clone() },
    uSunIntensity: { value: 1.0 },
    uTime:         { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const skySphere = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), skyMat);
  surfaceGroup.add(skySphere);

  // ── Live state — every visual lerps toward its target each frame ───────
  const live = {
    radius:             PLANET_RADIUS,
    waterLevel:         0.5,
    iceCap:             0.1,
    tempBias:           0,
    co2:                0,
    o2:                 0.21,
    atmoIntensity:      0.5,
    atmoColor:          new THREE.Color(0x6aaaff),
    cloudOpacity:       0.45,
    starLightIntensity: 1.5,
    starDistance:       18,
    starSize:           1.0,
    starHaloSize:       8,
    starColor:          new THREE.Color(0xfff3d4),  // day-side tint on planet
    terrainHeight:      1.0,
    cameraDistance:     9,
    skyTop:             new THREE.Color(0x4a78b8),
    skyHorizon:         new THREE.Color(0xc88a55),
    groundNear:         new THREE.Color(0x5a4a35),
    groundFar:          new THREE.Color(0x2a221a),
  };
  const tmpColor = new THREE.Color();
  const tmpVec   = new THREE.Vector3();

  let lastSig = '';
  let theta = 0;
  let surfaceMode = false;

  return {
    update(dt, t, params) {
      const ts = (params.timeScale ?? 1) * (params.chaos ? (1 + (Math.random() - 0.5) * 0.2) : 1);

      // ── Structural rebuilds (only when topology changed) ──
      const sig = `${params.moonCount}|${params.moonOrbit}|${params.moonSize}|${params.rings.enabled}|${params.rings.radius}|${params.rings.thickness}|${params.rings.density}`;
      if (sig !== lastSig) {
        rebuildMoons(params);
        rebuildRings(params);
        lastSig = sig;
      }

      // ── Mode swap (space ↔ surface) ──
      if (params.surfaceView !== surfaceMode) {
        surfaceMode = params.surfaceView;
        planetGroup.visible = !surfaceMode;
        moonsGroup.visible  = !surfaceMode;
        starMesh.visible    = !surfaceMode;
        starHalo.visible    = !surfaceMode;
        starCorona.visible  = !surfaceMode;
        farStars.visible    = !surfaceMode;
        midStars.visible    = !surfaceMode;
        nearStars.visible   = !surfaceMode;
        nebulaA.visible     = !surfaceMode;
        nebulaB.visible     = !surfaceMode;
        surfaceGroup.visible = surfaceMode;
        if (!surfaceMode) {
          controls.setRadius(9);
          scene.fog = null;
        } else {
          // Initial fog — density updated each frame from current pressure
          scene.fog = new THREE.FogExp2(0x6a5a3a, 0.012);
        }
      }

      // ── Physics derivations ────────────────────────────────────────────
      // Irradiance at planet (W proxy): luminosity / distance²
      const L = params.starLum || 1;
      const d = Math.max(0.05, params.distanceAU || 1);
      const irradiance = L / (d * d);

      // Equilibrium temp (Kelvin) for color-bias; same formula as physics/engine.js
      const Tk_eq = Math.pow(
        Math.max(0, (L * 3.828e26 * (1 - params.albedo)) / (16 * Math.PI * 5.670374419e-8 * (d * 1.496e11) ** 2)),
        0.25
      );
      const greenhouse = 33 * Math.min(Math.log(1 + (params.co2 || 0.04) / 0.04) / Math.log(2), 4);
      const Tk = Tk_eq + greenhouse;
      const tBias = Math.max(-1, Math.min(1, (Tk - 290) / 70));
      const co2N = Math.min(1, (params.co2 || 0) / 100);

      // Atmosphere color: blue (O2-rich) ↔ orange (CO2-rich)
      const r = 0.25 + co2N * 0.65;
      const g = 0.55 + (params.o2 / 100) * 0.20 - co2N * 0.25;
      const b = 0.95 - co2N * 0.65;
      tmpColor.setRGB(Math.max(0, r), Math.max(0.1, g), Math.max(0.05, b));

      // Total atmospheric "pressure" proxy → controls atmosphere intensity.
      // Capped low so even Venus-like pressure doesn't produce a visible band.
      const pressure = params.o2 + params.co2;
      const atmoIntensityTarget = Math.min(0.55, 0.05 + pressure * 0.0035 + co2N * 0.12) *
        (params.chaos ? 1 + (Math.random() - 0.5) * 0.12 : 1);

      // Star light intensity from physics irradiance, shaped to look right
      const lightIntensityTarget = Math.min(4.5, 0.4 + Math.sqrt(irradiance) * 1.6);

      // Star color from physics — hot close star → warm, cold far → icy-blue.
      // This tints the day-side of the planet and the water specular.
      const tempTarget = Tk_eq;
      const starColorTarget = new THREE.Color();
      if (tempTarget > 320) {
        // hot — shift toward warm/orange
        const w = Math.min(1, (tempTarget - 320) / 200);
        starColorTarget.setRGB(1.0, 0.85 - w * 0.25, 0.65 - w * 0.35);
      } else if (tempTarget < 240) {
        // cold — shift toward cool bluish-white
        const c = Math.min(1, (240 - tempTarget) / 120);
        starColorTarget.setRGB(0.82 - c * 0.12, 0.90, 1.0);
      } else {
        // temperate
        starColorTarget.setRGB(1.0, 0.95, 0.83);
      }

      // Terrain amplitude from user slider (defaults to 1.0)
      const terrainHeightTarget = Math.max(0, Math.min(2.2, params.terrainHeight ?? 1.0));

      // Star distance: closer star (smaller AU) → closer in scene → bigger appearance
      const starDistTarget = 8 + d * 5;
      // Star body size scales gently with luminosity (cube root since visible
      // size ∝ ³√L for similar stellar types)
      const starSizeTarget = 0.7 + Math.cbrt(L) * 0.6;
      // Halo size grows with both size AND irradiance (visual dominance)
      const starHaloSizeTarget = (5 + Math.cbrt(L) * 4) * (0.7 + Math.min(2, irradiance) * 0.5);

      // Surface-view colors — derived from atmosphere + ground material guess
      const skyTopTarget     = deriveSkyTop(params, tmpColor);
      const skyHorizonTarget = deriveSkyHorizon(params, tmpColor);
      const [groundNearTarget, groundFarTarget] = deriveGroundColors(params, Tk);

      // ── Lerp live → target ─────────────────────────────────────────────
      // Coefficient 3 → ~63% closure in 0.33s, ~95% in 1s. Slow enough to
      // feel like the planet is physically re-equilibrating, not snapping.
      const a = 1 - Math.exp(-dt * 3);
      live.radius             += (PLANET_RADIUS * (0.6 + (params.radius / 25000) * 0.8) - live.radius) * a;
      live.waterLevel         += ((1 - params.water / 100) - live.waterLevel) * a;
      live.iceCap             += (Math.min(0.45, params.ice / 220) - live.iceCap) * a;
      live.tempBias           += (tBias - live.tempBias) * a;
      live.co2                += (co2N - live.co2) * a;
      live.o2                 += ((params.o2 / 100) - live.o2) * a;
      live.atmoIntensity      += (atmoIntensityTarget - live.atmoIntensity) * a;
      live.cloudOpacity       += (Math.max(0.05, params.clouds / 100) * 0.85 - live.cloudOpacity) * a;
      live.starLightIntensity += (lightIntensityTarget - live.starLightIntensity) * a;
      live.starDistance       += (starDistTarget - live.starDistance) * a;
      live.starSize           += (starSizeTarget - live.starSize) * a;
      live.starHaloSize       += (starHaloSizeTarget - live.starHaloSize) * a;
      live.atmoColor.lerp(tmpColor, a);
      live.starColor.lerp(starColorTarget, a);
      live.terrainHeight  += (terrainHeightTarget - live.terrainHeight) * a;
      live.cameraDistance += (camera.position.length() - live.cameraDistance) * a;
      live.skyTop.lerp(skyTopTarget, a);
      live.skyHorizon.lerp(skyHorizonTarget, a);
      live.groundNear.lerp(groundNearTarget, a);
      live.groundFar.lerp(groundFarTarget, a);

      // ── Apply to scene ─────────────────────────────────────────────────
      // 1) Star light + visible position/size — BOUND TO PHYSICS
      tmpVec.copy(STAR_DIR).multiplyScalar(live.starDistance);
      starLight.position.copy(tmpVec);
      starLight.intensity = live.starLightIntensity;
      starMesh.position.copy(tmpVec);
      starMesh.scale.setScalar(live.starSize);
      starHalo.position.copy(tmpVec);
      starHalo.scale.setScalar(live.starHaloSize);
      starCorona.position.copy(tmpVec);
      starCorona.scale.setScalar(live.starHaloSize * 2.4);

      // Keep starHalo/corona pulsing very subtly (alive but quiet)
      const pulse = 1 + Math.sin(t * 1.3) * 0.025;
      starHalo.scale.multiplyScalar(pulse);

      // 2) Planet shader uniforms
      planetGroup.scale.setScalar(live.radius / PLANET_RADIUS);
      planetUniforms.uTime.value           = t;
      planetUniforms.uWaterLevel.value     = live.waterLevel;
      planetUniforms.uIceCap.value         = live.iceCap;
      planetUniforms.uTempBias.value       = live.tempBias;
      planetUniforms.uCO2.value            = live.co2;
      planetUniforms.uO2.value             = live.o2;
      planetUniforms.uChaos.value          = params.chaos ? 1 : 0;
      planetUniforms.uLightIntensity.value = live.starLightIntensity;
      planetUniforms.uLightColor.value.copy(live.starColor);
      planetUniforms.uTerrainHeight.value  = live.terrainHeight;
      planetUniforms.uCityLights.value     = (params.cityLights ?? true) ? 1 : 0;
      planetUniforms.uCameraDistance.value = live.cameraDistance;
      // Light dir is from planet to star
      tmpVec.copy(starLight.position).sub(planetGroup.position).normalize();
      planetUniforms.uLightDir.value.copy(tmpVec);

      // 3) Atmosphere uniforms
      atmoUniforms.uColor.value.copy(live.atmoColor);
      atmoUniforms.uIntensity.value = live.atmoIntensity;
      atmoUniforms.uChaos.value = params.chaos ? 1 : 0;
      atmoUniforms.uTime.value = t;
      atmoUniforms.uLightDir.value.copy(tmpVec);

      // 3b) Water uniforms (fresnel + specular + wave normals)
      waterUniforms.uTime.value = t;
      waterUniforms.uLightDir.value.copy(tmpVec);
      waterUniforms.uLightColor.value.copy(live.starColor);
      waterUniforms.uWaterLevel.value = live.waterLevel;
      waterUniforms.uSpecularStrength.value = Math.min(2.0, live.starLightIntensity * 0.7);

      // 3c) Cloud shader uniforms
      cloudUniforms.uTime.value = t;
      cloudUniforms.uDensity.value = Math.max(0.05, params.clouds / 100);
      cloudUniforms.uLightDir.value.copy(tmpVec);
      cloudUniforms.uLightColor.value.copy(live.starColor);

      // 4) Rotation + axis tilt
      const rotSpeedMul = (params.rotationSpeed ?? 1.0);
      const rotSpeed = (params.autoRotate ? 0.4 : 0.12) * ts * rotSpeedMul;
      theta += dt * rotSpeed;
      // Axis tilt + spin — use ZYX order so Z (tilt) is applied LAST in local space.
      // That means Y spin happens around the object's local up axis, then the
      // whole group is tilted sideways → planet rotates around its tilted axis.
      planetGroup.rotation.order = 'ZYX';
      planetGroup.rotation.z = ((params.axisTilt ?? 23.5) * Math.PI) / 180;
      planetGroup.rotation.y = theta;
      // Clouds rotate slightly faster than the surface (independent atmosphere motion)
      cloudMesh.rotation.y = t * 0.05 * rotSpeedMul;

      // 5) Moons
      moons.forEach((m, i) => {
        const chaosKick = params.chaos ? Math.sin(t * 4 + i) * 0.15 : 0;
        m.phase += dt * m.speed * ts + chaosKick * dt;
        const x = Math.cos(m.phase) * m.orbit;
        const z = Math.sin(m.phase) * m.orbit;
        const y = Math.sin(m.phase + m.inclination * Math.PI) * 0.5 * m.inclination;
        m.mesh.position.set(x, y, z);
        m.mesh.rotation.y += dt * 0.3;
      });

      // 6) Surface view — fully driven by lerped colors + actual sun direction
      if (surfaceMode) {
        skyUniforms.uSkyTop.value.copy(live.skyTop);
        skyUniforms.uSkyHorizon.value.copy(live.skyHorizon);
        skyUniforms.uGroundNear.value.copy(live.groundNear);
        skyUniforms.uGroundFar.value.copy(live.groundFar);
        skyUniforms.uSunDir.value.copy(STAR_DIR);
        skyUniforms.uSunIntensity.value = Math.min(2.5, live.starLightIntensity);
        skyUniforms.uTime.value = t;

        // Fog density tracks atmospheric pressure; thin atmosphere → no fog
        if (scene.fog) {
          const fogTarget = Math.min(0.04, 0.001 + pressure * 0.00045);
          scene.fog.density += (fogTarget - scene.fog.density) * a;
          // Fog color blends sky horizon + ground for atmospheric coherence
          scene.fog.color.copy(live.skyHorizon).lerp(live.groundFar, 0.35);
        }

        // Camera locked at standing eye-level. Slow head turn for life.
        camera.position.set(0, 1.7, 0);
        const lookYaw = Math.sin(t * 0.04) * 0.18;
        const lookPitch = 0.05;
        camera.lookAt(
          Math.cos(lookYaw) * 30,
          1.7 + Math.tan(lookPitch),
          Math.sin(lookYaw) * 30
        );
      }

      // 7) Background — parallax: each shell drifts at a different rate
      farStars.rotation.y  += dt * 0.003;
      midStars.rotation.y  += dt * 0.007;
      nearStars.rotation.y += dt * 0.013;
    },

    dispose() {
      [farStars, midStars, nearStars].forEach((s) => { s.geometry.dispose(); s.material.dispose(); });
      moons.forEach((m) => { m.mesh.geometry.dispose(); m.mesh.material.dispose(); });
      if (ringPoints) { ringPoints.geometry.dispose(); ringPoints.material.dispose(); }
      planetMesh.geometry.dispose(); planetMat.dispose();
      waterMesh.geometry.dispose(); waterMat.dispose();
      cloudMesh.geometry.dispose(); cloudMat.dispose();
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Color derivations for surface view
// ────────────────────────────────────────────────────────────────────────────

const tmpA = new THREE.Color();
const tmpB = new THREE.Color();

function deriveSkyTop(p, atmoColor) {
  const co2N = Math.min(1, (p.co2 || 0) / 100);
  const pressure = p.o2 + p.co2;
  if (pressure < 3) return tmpA.setHex(0x010206);                  // vacuum
  // Earth-like blue ↔ Mars-like tan
  const c = tmpA.setHex(0x355c95).lerp(tmpB.setHex(0x9c7048), co2N * 0.85);
  // Use atmosphere color slightly to keep them coherent
  c.lerp(atmoColor, 0.15);
  c.multiplyScalar(0.4 + Math.min(1, pressure / 30) * 0.6);
  return c;
}

function deriveSkyHorizon(p, atmoColor) {
  const co2N = Math.min(1, (p.co2 || 0) / 100);
  const pressure = p.o2 + p.co2;
  if (pressure < 3) return tmpB.setHex(0x040608);
  // Warm sunset glow, dustier on CO2-rich worlds
  const c = tmpB.setHex(0xe89060).lerp(tmpA.setHex(0xb87060), co2N * 0.5);
  c.multiplyScalar(0.5 + Math.min(1, pressure / 30) * 0.5);
  return c;
}

function deriveGroundColors(p, Tk) {
  const tempC = Tk - 273.15;
  const ground = new THREE.Color();
  if (tempC > 600)        ground.setHex(0x8a1d10);   // magma
  else if (tempC > 200)   ground.setHex(0x6a3a1a);   // scorched
  else if (tempC < -50)   ground.setHex(0xd8e0e8);   // permafrost / snow
  else if (p.ice > 60)    ground.setHex(0xb6c4d4);   // tundra
  else if (p.water > 50 && tempC > -10 && tempC < 45) ground.setHex(0x4a5530); // soil/grass
  else if (tempC > 80)    ground.setHex(0xa86238);   // arid red dust
  else if (p.water > 20)  ground.setHex(0x6a5a3a);   // damp earth
  else                    ground.setHex(0x4a3f30);   // bare rock
  // Far ground is a darker version, used for haze fade
  const far = ground.clone().multiplyScalar(0.55);
  return [ground, far];
}

// ────────────────────────────────────────────────────────────────────────────
//  Procedural canvas helpers
// ────────────────────────────────────────────────────────────────────────────

function makeHeightCanvas(size) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size / 2;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const u = x / c.width, v = y / c.height;
      const n = fbm(u * 6, v * 6, 5);
      const lat = Math.abs(v - 0.5) * 2;
      const h = Math.max(0, Math.min(1, n + 0.05 * Math.sin(lat * Math.PI)));
      const g = Math.floor(h * 255);
      const i = (y * c.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function makeCloudCanvas() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  for (let i = 0; i < 350; i++) {
    const x = Math.random() * c.width;
    const y = Math.random() * c.height;
    const r = 8 + Math.random() * 28;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

function fbm(x, y, octaves = 4) {
  let v = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * (Math.sin(x * freq * 1.7) * Math.cos(y * freq * 2.1) * 0.5 + 0.5);
    freq *= 2; amp *= 0.5;
  }
  return v;
}

// Spherical-shell starfield with hue/brightness variance.
function makeStarfield(count, radius, sizeBase, opacity) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random();
    const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
    pos[i * 3]     = radius * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = radius * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = radius * Math.cos(ph);
    const c = new THREE.Color().setHSL(
      Math.random() < 0.85 ? 0.6 : 0.1, 0.4, 0.5 + Math.random() * 0.4
    );
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    size: sizeBase, sizeAttenuation: true, vertexColors: true,
    transparent: true, opacity,
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
  grad.addColorStop(0.4, `rgba(${r},${g},${b},${alpha * 0.4})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

function makeSprite(tex, size) {
  const mat = new THREE.SpriteMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  return s;
}

// ────────────────────────────────────────────────────────────────────────────
//  GLSL — all shaders kept lightweight (no heavy noise, no loops)
// ────────────────────────────────────────────────────────────────────────────

const PLANET_VERT = /* glsl */`
  // 3D noise sampled in object space → no UV seams. We compute elevation at
  // the vertex position, displace the vertex along its normal, AND pass the
  // elevation to the fragment shader so biome color uses identical data.
  uniform float uTime;
  uniform float uTerrainHeight;   // 0..2 scalar on mountain amplitude
  uniform float uWaterLevel;      // 0..1 — elevation below this is ocean

  varying vec3  vNormal;
  varying vec3  vWorldNormal;
  varying vec3  vObjPos;          // object-space position (unit sphere input)
  varying float vElevation;       // raw noise elevation 0..1
  varying float vHeightAboveSea;  // relative above sea level

  // ─── 3D value noise (cheap) ───
  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3d(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  // fBm — 5 octaves. Low freq = continents, high = rocks.
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3d(p);
      p *= 2.07;      // non-integer multiplier reduces aliasing grid
      a *= 0.5;
    }
    return v;
  }
  // Domain warping — kills repetitive patterns
  float terrainElevation(vec3 p) {
    vec3 q = vec3(fbm(p + vec3(0.0, 0.0, 0.0)),
                  fbm(p + vec3(5.2, 1.3, 0.0)),
                  fbm(p + vec3(0.0, 5.2, 1.3)));
    return fbm(p + 1.8 * q);
  }

  void main() {
    vObjPos = position;
    vec3 dir = normalize(position);

    // Elevation in [0..1]
    float e = terrainElevation(dir * 2.2);

    // ── Ocean: flat. Land: displaced. ──
    float aboveSea = max(0.0, e - uWaterLevel);
    float displacement;
    if (e < uWaterLevel) {
      // Slight wobble for ocean floor variation (vertex stays at sea level though)
      displacement = 0.0;
    } else {
      // Squared rise → foothills low, mountains taller
      displacement = aboveSea * aboveSea * uTerrainHeight * 0.65;
    }

    vec3 displaced = position + normal * displacement;

    vElevation = e;
    vHeightAboveSea = aboveSea;
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const PLANET_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uWaterLevel;
  uniform float uIceCap;
  uniform float uTempBias;
  uniform float uCO2;
  uniform float uO2;
  uniform float uChaos;
  uniform float uLightIntensity;
  uniform vec3  uLightDir;
  uniform vec3  uLightColor;       // star color (tints dayside directly)
  uniform float uCityLights;       // 0 = off, 1 = on
  uniform float uCameraDistance;   // for LOD micro-detail blending

  varying vec3  vNormal;
  varying vec3  vWorldNormal;
  varying vec3  vObjPos;
  varying float vElevation;
  varying float vHeightAboveSea;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3d(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3d(p);
      p *= 2.07;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Latitude = angle from equator (poles at top/bottom of object)
    float lat = abs(normalize(vObjPos).y);

    bool isOcean = vElevation < uWaterLevel;
    vec3 color;

    if (isOcean) {
      // Deep/shallow gradient based on depth below sea level
      float depth = (uWaterLevel - vElevation) / max(uWaterLevel, 0.001);
      vec3 shallow = vec3(0.14, 0.42, 0.66);
      vec3 deep    = vec3(0.04, 0.10, 0.26);
      color = mix(shallow, deep, clamp(depth * 1.4, 0.0, 1.0));
      // Temp shifts
      color = mix(color, vec3(0.55, 0.12, 0.05), max(0.0, uTempBias) * 0.85);
      color = mix(color, vec3(0.55, 0.72, 0.85), max(0.0, -uTempBias) * 0.5);
    } else {
      // Land biome by elevation above sea
      float relH = vHeightAboveSea / max(1.0 - uWaterLevel, 0.001);
      // Extra per-pixel regional noise so the biome transitions aren't clean
      float region = fbm(vObjPos * 8.0);
      vec3 beach    = vec3(0.68, 0.58, 0.36);
      vec3 grass    = vec3(0.22, 0.42, 0.18);
      vec3 forest   = vec3(0.14, 0.30, 0.12);
      vec3 mountain = vec3(0.42, 0.35, 0.28);
      vec3 snow     = vec3(0.88, 0.90, 0.94);

      color = mix(beach, grass, smoothstep(0.0, 0.12, relH));
      color = mix(color, forest,   smoothstep(0.10, 0.32, relH) * (0.6 + 0.4 * region));
      color = mix(color, mountain, smoothstep(0.35, 0.65, relH));
      color = mix(color, snow,     smoothstep(0.75, 0.95, relH));
      // Temp shift: hot → desert red, cold → tundra gray
      color = mix(color, vec3(0.55, 0.30, 0.16), max(0.0, uTempBias) * 0.6);
      color = mix(color, vec3(0.55, 0.60, 0.65), max(0.0, -uTempBias) * 0.5);
    }

    // Polar ice caps (latitude-based)
    float iceMask = smoothstep(1.0 - uIceCap - 0.05, 1.0 - uIceCap, lat);
    color = mix(color, vec3(0.92, 0.94, 0.97), iceMask);

    // CO2 dust tint on land only
    if (!isOcean) color = mix(color, vec3(0.78, 0.42, 0.18), uCO2 * 0.14);

    // ── Micro-detail (LOD) — only when camera is close ──
    // When camera < 6 units, add high-frequency surface noise for crunch
    float lod = 1.0 - smoothstep(4.0, 12.0, uCameraDistance);
    if (lod > 0.01) {
      float micro = fbm(vObjPos * 45.0) - 0.5;
      color *= 1.0 + micro * 0.18 * lod;
    }

    // Stronger desaturation — planet stays earthy
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(vec3(lum), color, 0.8);

    // ── Lighting ──
    vec3 N = normalize(vWorldNormal);
    vec3 L = normalize(uLightDir);
    float ndl = dot(N, L);
    float dayFactor = smoothstep(-0.1, 0.25, ndl);

    // Day side: tint by star color (closer hot stars → orange, far cold → blue-white)
    vec3 starTint = uLightColor;
    float litStrength = 0.35 + uLightIntensity * 0.55;
    vec3 lit = color * starTint * (0.08 + max(0.0, ndl) * litStrength);

    // ── Night side — city lights on land, faint atmospheric glow ──
    vec3 nightTint = isOcean ? vec3(0.012, 0.024, 0.055) : vec3(0.038, 0.034, 0.028);
    vec3 nightColor = nightTint;

    if (uCityLights > 0.5 && !isOcean && vHeightAboveSea < 0.35 && lat < 0.8) {
      // Cluster-like lights — threshold high-frequency noise
      float cities = smoothstep(0.68, 0.85, fbm(vObjPos * 24.0));
      // Habitability mask: only temperate zones light up
      float temperate = (1.0 - abs(uTempBias)) * (1.0 - iceMask);
      nightColor += vec3(1.0, 0.85, 0.55) * cities * 0.9 * temperate;
    }

    vec3 finalCol = mix(nightColor, lit, dayFactor);

    // ── Rim lighting (soft scatter at terminator) ──
    vec3 V = normalize(cameraPosition - (modelMatrix * vec4(vObjPos, 1.0)).xyz);
    float rim = pow(1.0 - max(0.0, dot(N, V)), 3.0);
    // Rim only shows on the day side of the terminator (subtle, cinematic)
    finalCol += starTint * rim * dayFactor * 0.15;

    if (uChaos > 0.5) {
      finalCol += sin(uTime * 30.0 + vObjPos.x * 80.0) * 0.04;
    }

    gl_FragColor = vec4(finalCol, 1.0);
  }
`;

// Atmosphere shader — passes both view-space normal/view-direction AND world-space
// normal so the inner shader can do Rayleigh-style "brighter on lit side".
const ATMO_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWorldNormal;
  void main() {
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vV = normalize(-mv.xyz);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * mv;
  }
`;

// Inner shell — tight fresnel rim, lit-side modulated. The ONLY atmosphere layer.
const ATMO_INNER_FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uColor;
  uniform float uIntensity;
  uniform float uChaos;
  uniform float uTime;
  uniform vec3  uLightDir;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vWorldNormal;
  void main() {
    // pow 5.5 = very thin rim. Atmosphere fades to zero quickly off the limb.
    float fresnel = pow(1.0 - max(0.0, dot(vN, vV)), 5.5);
    // Day side glows ~5x brighter than night (Rayleigh-style scattering)
    float lit = max(0.0, dot(normalize(vWorldNormal), normalize(uLightDir)));
    float litFactor = mix(0.08, 1.0, smoothstep(-0.20, 0.55, lit));
    float a = fresnel * uIntensity * litFactor;
    if (uChaos > 0.5) a += sin(uTime * 6.0) * 0.04 * fresnel;
    gl_FragColor = vec4(uColor, clamp(a, 0.0, 0.85));
  }
`;

// ─── Water layer ────────────────────────────────────────────────────────
// Uses the same 3D noise as the planet surface to know where oceans are,
// so the water mesh is only opaque over oceans (transparent over land).
// Adds fresnel-driven specular that gets strong at grazing angles.
const WATER_VERT = /* glsl */`
  uniform float uTime;
  varying vec3  vObjPos;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec3  vWorldNormal;
  void main() {
    vObjPos = position;
    vNormal = normalize(normalMatrix * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform vec3  uLightDir;
  uniform vec3  uLightColor;
  uniform vec3  uDeepColor;
  uniform vec3  uShallowColor;
  uniform float uWaterLevel;
  uniform float uSpecularStrength;
  varying vec3  vObjPos;
  varying vec3  vWorldPos;
  varying vec3  vNormal;
  varying vec3  vWorldNormal;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3d(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3d(p);
      p *= 2.07; a *= 0.5;
    }
    return v;
  }
  // Same domain-warped terrain function as planet shader — keeps ocean mask consistent
  float terrainElevation(vec3 p) {
    vec3 q = vec3(fbm(p + vec3(0.0, 0.0, 0.0)),
                  fbm(p + vec3(5.2, 1.3, 0.0)),
                  fbm(p + vec3(0.0, 5.2, 1.3)));
    return fbm(p + 1.8 * q);
  }

  void main() {
    vec3 dir = normalize(vObjPos);
    float e = terrainElevation(dir * 2.2);
    // Only render water where there's actually ocean (elevation < waterLevel)
    if (e >= uWaterLevel) discard;

    // Deeper areas = darker
    float depth = (uWaterLevel - e) / max(uWaterLevel, 0.001);
    vec3 baseColor = mix(uShallowColor, uDeepColor, clamp(depth * 1.6, 0.0, 1.0));

    // ── Animated wave normal perturbation ──
    // Sample noise with time offset → bump up the normal slightly per pixel
    vec3 waveOffset = vec3(fbm(dir * 30.0 + vec3(uTime * 0.3, 0.0, 0.0)),
                           fbm(dir * 30.0 + vec3(0.0, uTime * 0.3, 0.0)),
                           fbm(dir * 30.0 + vec3(0.0, 0.0, uTime * 0.3)));
    vec3 N = normalize(vWorldNormal + (waveOffset - 0.5) * 0.18);

    // ── Lighting ──
    vec3 L = normalize(uLightDir);
    float ndl = max(0.0, dot(N, L));
    float dayFactor = smoothstep(-0.1, 0.3, dot(normalize(vWorldNormal), L));

    // ── Fresnel — strong specular at grazing angles ──
    vec3 V = normalize(cameraPosition - vWorldPos);
    float fresnel = pow(1.0 - max(0.0, dot(N, V)), 4.0);

    // Blinn-Phong specular highlight
    vec3 H = normalize(L + V);
    float specular = pow(max(0.0, dot(N, H)), 96.0) * uSpecularStrength;

    vec3 color = baseColor * (0.1 + ndl * 0.9);
    // Sky reflection blends in at grazing angles (fresnel)
    color = mix(color, vec3(0.55, 0.7, 0.95), fresnel * 0.55);
    // Brilliant sun-glint
    color += uLightColor * specular * 2.5 * dayFactor;

    // Night side: dim
    color *= mix(0.1, 1.0, dayFactor);

    // Alpha: nearly opaque from above (90% so some deep blue from planet bleeds),
    // full opacity at grazing angles where fresnel dominates
    float alpha = 0.85 + fresnel * 0.15;
    gl_FragColor = vec4(color, alpha);
  }
`;

// ─── Cloud layer (3D fbm, no UV seams, animated independently) ──────────
const CLOUD_VERT = /* glsl */`
  varying vec3 vObjPos;
  varying vec3 vWorldNormal;
  void main() {
    vObjPos = position;
    vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */`
  precision highp float;
  uniform float uTime;
  uniform float uDensity;   // 0..1
  uniform vec3  uLightDir;
  uniform vec3  uLightColor;
  varying vec3  vObjPos;
  varying vec3  vWorldNormal;

  float hash31(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise3d(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash31(i + vec3(0,0,0)), hash31(i + vec3(1,0,0)), f.x),
          mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
          mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise3d(p);
      p *= 2.11; a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vObjPos);
    // Clouds drift — time offset on the noise sample
    float n = fbm(dir * 4.5 + vec3(uTime * 0.04, 0.0, 0.0));
    // Second noise layer for structure
    n += fbm(dir * 11.0 + vec3(0.0, uTime * 0.07, 0.0)) * 0.4;

    // Density threshold: uDensity=0 → clouds barely visible, 1 → dense
    float threshold = mix(0.95, 0.35, uDensity);
    float cloud = smoothstep(threshold, threshold + 0.2, n);

    // Day/night factor — clouds only lit on day side
    vec3 N = normalize(vWorldNormal);
    float dayFactor = smoothstep(-0.1, 0.3, dot(N, normalize(uLightDir)));

    // Tint clouds by star color for physical coherence
    vec3 cloudColor = vec3(0.92, 0.94, 0.98) * uLightColor * (0.3 + dayFactor * 0.8);
    // Slight shadow on the "bottoms" of denser clouds (fake self-shadow)
    cloudColor *= 1.0 - smoothstep(0.6, 1.0, cloud) * 0.25;

    float alpha = cloud * 0.75;
    gl_FragColor = vec4(cloudColor, alpha);
  }
`;

// Sky + ground in one sphere. No flat plane = no broken horizon.
const SKY_VERT = /* glsl */`
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SKY_FRAG = /* glsl */`
  precision highp float;
  uniform vec3  uSkyTop;
  uniform vec3  uSkyHorizon;
  uniform vec3  uGroundNear;
  uniform vec3  uGroundFar;
  uniform vec3  uSunDir;
  uniform float uSunIntensity;
  uniform float uTime;
  varying vec3 vWorldPos;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 dir = normalize(vWorldPos);
    vec3 col;

    if (dir.y >= 0.0) {
      // ── Above horizon: sky ──
      // Steep blend so zenith is its own color and horizon hugs the seam
      float h = smoothstep(0.0, 0.55, dir.y);
      col = mix(uSkyHorizon, uSkyTop, h);
    } else {
      // ── Below horizon: ground ──
      // Distance fade — far ground blends toward sky horizon (atmospheric haze)
      float depth = clamp(-dir.y, 0.0, 1.0);
      vec3 ground = mix(uGroundFar, uGroundNear, smoothstep(0.0, 0.6, depth));
      // Haze line right at horizon
      col = mix(uSkyHorizon, ground, smoothstep(0.0, 0.18, depth));
      // Subtle ground grain so it doesn't look like a flat color
      float n = hash(floor(dir.xz * 200.0));
      col *= 0.92 + n * 0.16;
    }

    // ── Sun rendering ──
    float s = max(0.0, dot(dir, normalize(uSunDir)));
    col += pow(s, 320.0) * uSunIntensity * 1.8 * vec3(1.0, 0.95, 0.80);  // disc
    col += pow(s, 32.0)  * uSunIntensity * 0.55 * vec3(1.0, 0.78, 0.50); // halo
    col += pow(s, 4.0)   * uSunIntensity * 0.18 * vec3(1.0, 0.60, 0.35); // bloom

    gl_FragColor = vec4(col, 1.0);
  }
`;
