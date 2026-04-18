import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/**
 * HeroSolarSystem — fullscreen Three.js background for the landing hero.
 *
 * Design intent: ambient depth, not a foreground simulation. Camera tilts gently
 * with cursor. Planets glide on circular orbits at slow visual speeds (decorative,
 * not physics-accurate). Gated by IntersectionObserver so the RAF stops when the
 * user scrolls past.
 *
 * Performance budget:
 *   • 1 emissive star + glow sprite
 *   • 4 textureless planets with single rim shader
 *   • ~600 distant stars in a single Points cloud
 *   • One renderer, one scene, one camera. No post-processing.
 */
export default function HeroSolarSystem() {
  const hostRef = useRef(null);
  const [visible, setVisible] = useState(true);
  const cursorRef = useRef({ x: 0, y: 0 });

  // Stop the RAF when scrolled out of view to free CPU/GPU
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Track normalized cursor for camera parallax
  useEffect(() => {
    const onMove = (e) => {
      cursorRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      cursorRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const host = hostRef.current;
    if (!host) return;

    const w = host.clientWidth;
    const h = host.clientHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x03050d, 0.012);

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 500);
    camera.position.set(0, 18, 50);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    // ── Star ────────────────────────────────────────────────────────────
    const star = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0xffe9b8 })
    );
    scene.add(star);

    // Soft sprite halo
    const haloTex = makeRadialTex(0xffe2a0, 0.55);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: haloTex,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.85,
      })
    );
    halo.scale.set(14, 14, 1);
    scene.add(halo);

    // Outer corona for depth
    const corona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeRadialTex(0xff9966, 0.18),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.6,
      })
    );
    corona.scale.set(28, 28, 1);
    scene.add(corona);

    // Soft point light from star
    const light = new THREE.PointLight(0xffe1b3, 2.2, 200, 1.2);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x152040, 0.6));

    // ── Planets ─────────────────────────────────────────────────────────
    const planetSpecs = [
      { r: 8,  size: 0.55, color: 0x6aa8ff, speed: 0.32, tilt: 0.0  },
      { r: 13, size: 0.45, color: 0xe88a55, speed: 0.20, tilt: 0.04 },
      { r: 19, size: 0.85, color: 0xc478ff, speed: 0.12, tilt: -0.02 },
      { r: 27, size: 0.6,  size2: true, color: 0x66ddc8, speed: 0.07, tilt: 0.01 },
    ];

    const planets = planetSpecs.map((spec, i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: spec.color,
        emissive: spec.color,
        emissiveIntensity: 0.18,
        roughness: 0.55,
        metalness: 0.1,
      });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(spec.size, 28, 28), mat);
      const phase = (i / planetSpecs.length) * Math.PI * 2 + Math.random() * 0.7;
      scene.add(mesh);

      // Faint orbit ring
      const ringGeo = new THREE.RingGeometry(spec.r - 0.015, spec.r + 0.015, 128);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x4a78c8,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2 + spec.tilt;
      scene.add(ring);

      return { mesh, ring, spec, phase };
    });

    // ── Distant starfield ───────────────────────────────────────────────
    const starGeo = new THREE.BufferGeometry();
    const sCount = 600;
    const sPos = new Float32Array(sCount * 3);
    const sCol = new Float32Array(sCount * 3);
    for (let i = 0; i < sCount; i++) {
      const u = Math.random(), v = Math.random();
      const th = 2 * Math.PI * u;
      const ph = Math.acos(2 * v - 1);
      const R = 200 + Math.random() * 60;
      sPos[i * 3]     = R * Math.sin(ph) * Math.cos(th);
      sPos[i * 3 + 1] = R * Math.sin(ph) * Math.sin(th);
      sPos[i * 3 + 2] = R * Math.cos(ph);
      // bias toward cool blue with occasional warm tint
      const hue = Math.random() < 0.85 ? 0.6 : 0.08;
      const c = new THREE.Color().setHSL(hue, 0.4, 0.5 + Math.random() * 0.35);
      sCol[i * 3] = c.r; sCol[i * 3 + 1] = c.g; sCol[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3));
    const starField = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 0.6, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.85 })
    );
    scene.add(starField);

    // ── Animation loop ──────────────────────────────────────────────────
    let raf = null, running = true;
    const clock = new THREE.Clock();
    const targetCam = new THREE.Vector3(0, 18, 50);

    const tick = () => {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.06);
      const t = clock.getElapsedTime();

      planets.forEach((p) => {
        p.phase += dt * p.spec.speed;
        const y = Math.sin(t * 0.3 + p.phase) * 0.4 * p.spec.tilt * 10;
        p.mesh.position.set(
          Math.cos(p.phase) * p.spec.r,
          y,
          Math.sin(p.phase) * p.spec.r
        );
        p.mesh.rotation.y += dt * 0.3;
      });

      // gentle camera parallax following cursor
      targetCam.x = cursorRef.current.x * 4;
      targetCam.y = 18 + cursorRef.current.y * 2;
      camera.position.lerp(targetCam, 0.04);
      camera.lookAt(0, 0, 0);

      // subtle star drift
      starField.rotation.y += dt * 0.005;

      // pulse halo opacity gently
      halo.material.opacity = 0.78 + Math.sin(t * 0.6) * 0.06;
      corona.material.opacity = 0.55 + Math.sin(t * 0.4 + 1.5) * 0.05;

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      const ww = host.clientWidth, hh = host.clientHeight;
      camera.aspect = ww / hh;
      camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      // dispose
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      haloTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [visible]);

  return <div ref={hostRef} className="absolute inset-0 w-full h-full" />;
}

/** Round, soft radial gradient texture used for sprite halos. */
function makeRadialTex(colorHex, innerAlpha) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  const col = new THREE.Color(colorHex);
  const r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
  grad.addColorStop(0, `rgba(${r},${g},${b},${innerAlpha})`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},${innerAlpha * 0.4})`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
