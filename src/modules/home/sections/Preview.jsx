import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import * as THREE from 'three';

/**
 * Preview — "WOW MOMENT" section. Sits immediately after the Hero so visitors
 * see real physics within the first scroll.
 *
 * Three.js content:
 *   single planet, atmospheric fresnel rim, gentle starfield, slow rotation.
 *
 * Interaction:
 *   "rotation speed" + "atmosphere" sliders that mutate scene state in real time
 *   (proves to the user it isn't a video).
 *
 * Performance:
 *   IntersectionObserver gates RAF — if the section isn't visible, no frames
 *   are rendered.
 */
function PlanetPreview({ rotationRef, atmoRef }) {
  const hostRef = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const host = hostRef.current;
    if (!host) return;

    const w = host.clientWidth, h = host.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    camera.position.set(0, 0.4, 5.5);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0x223355, 0.55));
    const key = new THREE.DirectionalLight(0xffe6c4, 1.6);
    key.position.set(4, 2, 5);
    scene.add(key);

    const tex = new THREE.CanvasTexture(makePlanetCanvas());
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 96, 96),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 })
    );
    scene.add(planet);

    // Atmosphere shader — opacity is driven by atmoRef so the slider mutates it
    const atmoMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vN; varying vec3 vV;
        void main() {
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN; varying vec3 vV;
        uniform float uIntensity;
        void main() {
          float f = pow(1.0 - dot(vN, vV), 2.5);
          gl_FragColor = vec4(0.0, 0.78, 1.0, f * uIntensity);
        }`,
      uniforms: { uIntensity: { value: 0.85 } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false,
    });
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.7, 64, 64), atmoMat);
    scene.add(atmo);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const sp = new Float32Array(250 * 3);
    for (let i = 0; i < 250; i++) {
      const u = Math.random(), v = Math.random();
      const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
      sp[i * 3] = 30 * Math.sin(ph) * Math.cos(th);
      sp[i * 3 + 1] = 30 * Math.sin(ph) * Math.sin(th);
      sp[i * 3 + 2] = 30 * Math.cos(ph);
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xaaccff, size: 0.06, sizeAttenuation: true })
    );
    scene.add(stars);

    let raf = null, running = true;
    const clock = new THREE.Clock();
    const tick = () => {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      planet.rotation.y += dt * (rotationRef.current ?? 0.18);
      stars.rotation.y -= dt * 0.005;
      atmoMat.uniforms.uIntensity.value = atmoRef.current ?? 0.85;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    const onResize = () => {
      const ww = host.clientWidth, hh = host.clientHeight;
      camera.aspect = ww / hh; camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      tex.dispose();
      planet.geometry.dispose(); planet.material.dispose();
      atmo.geometry.dispose(); atmo.material.dispose();
      starGeo.dispose(); stars.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, [visible, rotationRef, atmoRef]);

  return <div ref={hostRef} className="absolute inset-0" />;
}

function makePlanetCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1f4f8f';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < c.height; y += 2) {
    for (let x = 0; x < c.width; x += 2) {
      const n = fbm(x * 0.012, y * 0.025);
      if (n > 0.55) {
        const shade = 70 + Math.floor((n - 0.55) * 200);
        ctx.fillStyle = `rgb(${30 + shade * 0.3}, ${shade + 60}, ${30 + shade * 0.2})`;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }
  ctx.fillStyle = '#f0f6ff';
  for (let y = 0; y < c.height * 0.08; y++) ctx.fillRect(0, y, c.width, 1);
  for (let y = c.height * 0.92; y < c.height; y++) ctx.fillRect(0, y, c.width, 1);
  return c;
}

function fbm(x, y) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < 4; i++) {
    v += a * (Math.sin(x * f) * Math.cos(y * f * 1.3) * 0.5 + 0.5);
    f *= 2; a *= 0.5;
  }
  return v;
}

export default function Preview() {
  // Two refs that the sliders write to and the Three.js loop reads from.
  // Using refs avoids re-mounting the renderer on every input event.
  const rotationRef = useRef(0.18);
  const atmoRef = useRef(0.85);
  const [rotationDisplay, setRotationDisplay] = useState(0.18);
  const [atmoDisplay, setAtmoDisplay] = useState(0.85);

  return (
    <section id="preview" className="relative py-32 px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-16 max-w-3xl"
        >
          <h2
            className="font-display text-[#e8ecff] leading-[0.95]"
            style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', letterSpacing: '0.02em' }}
          >
            Real physics.
            <br />
            <span className="text-[#00e5ff]">Drag a slider. See it react.</span>
          </h2>
          <p className="mt-6 text-[#8b93b8] text-base font-light leading-relaxed max-w-xl">
            This isn't a video. Below is a live Three.js scene running on your machine right now.
            Tune the controls and watch the planet respond in real time.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8 items-stretch">
          {/* Live planet viewport */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 1, ease: 'easeOut' }}
            className="relative aspect-square lg:aspect-auto lg:min-h-[520px] glass overflow-hidden"
            style={{ borderRadius: '20px' }}
          >
            {/* halo behind the canvas */}
            <div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle at 50% 50%, rgba(0,229,255,0.10), transparent 60%)',
              }}
            />
            <PlanetPreview rotationRef={rotationRef} atmoRef={atmoRef} />

            {/* HUD overlay */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-center font-mono text-[9px] tracking-[0.25em] text-[#00e5ff]/80 uppercase pointer-events-none">
              <span className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#58f5a0] animate-pulse" />
                live · earth-analog
              </span>
              <span>three.js · webgl</span>
            </div>
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-3 font-mono text-[9px] tracking-[0.18em] text-[#8b93b8] uppercase pointer-events-none">
              <div>spin<br /><span className="text-[#e8ecff]">{(rotationDisplay * 9.55).toFixed(2)} rad/s</span></div>
              <div>atmos<br /><span className="text-[#e8ecff]">{(atmoDisplay * 100).toFixed(0)} kPa</span></div>
              <div>habit<br /><span className="text-[#58f5a0]">complex</span></div>
            </div>
          </motion.div>

          {/* Live control rail */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="glass p-7 rounded-[20px] flex flex-col"
          >
            <div className="font-mono text-[10px] tracking-[0.3em] text-[#00e5ff] mb-6 opacity-70 uppercase">
              live controls
            </div>

            <PreviewSlider
              label="Rotation"
              value={rotationDisplay}
              min={-1}
              max={1}
              step={0.01}
              unit=""
              onChange={(v) => { rotationRef.current = v; setRotationDisplay(v); }}
            />

            <PreviewSlider
              label="Atmosphere"
              value={atmoDisplay}
              min={0}
              max={2}
              step={0.01}
              unit=""
              onChange={(v) => { atmoRef.current = v; setAtmoDisplay(v); }}
            />

            <div className="mt-auto pt-6 border-t border-[#1a2142]/60">
              <div className="space-y-3">
                {[
                  ['Stefan-Boltzmann', 'Equilibrium temperature from luminosity, distance, albedo.'],
                  ['Leapfrog N-body', 'Symplectic integrator preserves energy.'],
                  ['Born-rule sampling', 'Wavefunction collapse via probability.'],
                ].map(([t, c]) => (
                  <div key={t} className="text-xs">
                    <div className="font-mono text-[#a855f7] tracking-wide mb-0.5">{t}</div>
                    <div className="text-[#8b93b8] font-light leading-snug">{c}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function PreviewSlider({ label, value, min, max, step, unit, onChange }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="mb-6">
      <div className="flex justify-between items-baseline mb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[#8b93b8]">{label}</span>
        <span className="font-mono text-xs text-[#00e5ff]">{value.toFixed(2)}{unit}</span>
      </div>
      <div className="relative h-1 rounded-full bg-[#0c1122]">
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #00e5ff, #a855f7)',
            boxShadow: '0 0 10px rgba(0,229,255,0.5)',
          }}
        />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}
