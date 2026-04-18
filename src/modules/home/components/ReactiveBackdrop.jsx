import React, { useEffect, useRef } from 'react';

/**
 * ReactiveBackdrop — single 2D canvas that renders one of three particle behaviors:
 *
 *   collapse: particles spiral inward toward a gravitational center
 *   wave:     particles displaced by traveling sine wave (light distortion)
 *   expand:   particles flow radially outward from the origin
 *
 * The mode is driven by a `modeRef` that the parent updates on scroll. We use a
 * ref instead of a state prop to avoid restarting the RAF on every change.
 */
export default function ReactiveBackdrop({ modeRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 1.75);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Particle pool — initialized in a wide field
    const N = 220;
    const particles = Array.from({ length: N }, () => makeParticle(canvas));

    let raf = null, running = true;
    let lastT = performance.now();

    const tick = (t) => {
      if (!running) return;
      const dt = Math.min((t - lastT) / 1000, 0.05);
      lastT = t;

      const w = canvas.clientWidth, h = canvas.clientHeight;
      const cx = w / 2, cy = h / 2;
      const mode = modeRef.current;

      // Trail effect: instead of clearing fully, dim the canvas slightly
      ctx.fillStyle = 'rgba(3, 5, 13, 0.12)';
      ctx.fillRect(0, 0, w, h);

      for (const p of particles) {
        const dx = cx - p.x;
        const dy = cy - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.1;

        if (mode === 'collapse') {
          // Pull toward center, with light tangential rotation for spiral effect
          const pull = 60 / (dist + 30);
          p.vx += (dx / dist) * pull * dt;
          p.vy += (dy / dist) * pull * dt;
          // tangent (perpendicular)
          p.vx += (-dy / dist) * 12 * dt;
          p.vy += (dx / dist) * 12 * dt;
          // damping
          p.vx *= 0.98; p.vy *= 0.98;
          // respawn at outer edge if fallen too close
          if (dist < 8) Object.assign(p, makeParticle(canvas, true));
        } else if (mode === 'wave') {
          // Particles drift slowly with sinusoidal vertical displacement
          p.vx += -0.4 * dt; // drift right-to-left
          const phase = (p.x * 0.02 + t * 0.0018) % (Math.PI * 2);
          p.vy = Math.sin(phase) * 18 + (p.basePhase || 0);
          if (p.x < -10) p.x = w + 10;
        } else if (mode === 'expand') {
          // Push outward from center
          const push = 20 / (dist * 0.05 + 1);
          p.vx += (dx / -dist) * push * dt;
          p.vy += (dy / -dist) * push * dt;
          p.vx *= 0.985; p.vy *= 0.985;
          // wrap when outside viewport
          if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
            Object.assign(p, makeParticle(canvas, false, true));
          }
        } else {
          // idle: slow drift
          p.vx *= 0.99; p.vy *= 0.99;
        }

        p.x += p.vx;
        p.y += p.vy;

        // Render
        const a = 0.18 + Math.min(0.6, Math.hypot(p.vx, p.vy) * 0.06);
        ctx.beginPath();
        ctx.fillStyle = mode === 'wave'
          ? `hsla(195, 90%, 65%, ${a})`
          : mode === 'expand'
            ? `hsla(270, 80%, 70%, ${a})`
            : mode === 'collapse'
              ? `hsla(320, 80%, 65%, ${a})`
              : `hsla(195, 60%, 60%, ${a * 0.7})`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener('resize', resize);
    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [modeRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: 'none', mixBlendMode: 'screen', opacity: 0.9 }}
    />
  );
}

function makeParticle(canvas, fromOuterEdge = false, fromCenter = false) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (fromOuterEdge) {
    // Spawn at random edge for collapse mode
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.max(w, h) * 0.6;
    return {
      x: w / 2 + Math.cos(angle) * dist,
      y: h / 2 + Math.sin(angle) * dist,
      vx: 0, vy: 0,
      r: 0.7 + Math.random() * 1.2,
      basePhase: 0,
    };
  }
  if (fromCenter) {
    return {
      x: w / 2 + (Math.random() - 0.5) * 20,
      y: h / 2 + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: 0.7 + Math.random() * 1.2,
      basePhase: 0,
    };
  }
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3,
    r: 0.7 + Math.random() * 1.2,
    basePhase: (Math.random() - 0.5) * 6,
  };
}
