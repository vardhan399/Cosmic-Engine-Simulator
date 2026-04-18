import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import HeroSolarSystem from '../components/HeroSolarSystem';
import ControlButton from '../components/ControlButton';
import { usePortal } from '../components/PortalTransition';

/**
 * Hero — landing entry.
 *
 * Additions over the previous version:
 *   • cursor-reactive foreground glow layer (Layer 3.5) that follows the pointer
 *   • breathing star core whose intensity responds to mouse distance from center
 *   • staggered 100–150ms entry sequence (bg → star glow → title → subtitle → buttons)
 *   • CTA micro-text "Start building your own universe"
 *   • 3-line SYSTEM STATUS block replacing the horizontal telemetry row
 *   • animated bouncing-arrow scroll indicator with "Explore the Engine" text
 *
 * All tracked with GPU-friendly transforms + opacity — no layout thrash.
 */
export default function Hero({ onScrollToDemo }) {
  const { enterLab } = usePortal();
  const rootRef = useRef(null);
  // Normalized cursor position in the hero (−1..1 on each axis), smoothed.
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  // Distance from center, 0 = center / 1 = corner — drives "breath" intensity.
  const [centerDist, setCenterDist] = useState(0.5);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let raf = 0;
    let tx = 0, ty = 0, cx = 0, cy = 0, dist = 0.5;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width) * 2 - 1;      // −1..1
      ty = ((e.clientY - r.top) / r.height) * 2 - 1;
      dist = Math.min(1, Math.sqrt(tx * tx + ty * ty) / 1.414);
    };
    const tick = () => {
      // ease-to cursor — lerp ~12%/frame, reads very smooth but not jittery
      cx += (tx - cx) * 0.12;
      cy += (ty - cy) * 0.12;
      setCursor({ x: cx, y: cy });
      setCenterDist(dist);
      raf = requestAnimationFrame(tick);
    };
    el.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(tick);
    return () => {
      el.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Star-core intensity: closer to center → brighter (up to 1.0); drifts back at edges.
  const starIntensity = 1 - centerDist * 0.55;

  return (
    <section
      ref={rootRef}
      className="relative min-h-screen w-full flex items-center justify-center overflow-hidden"
    >
      {/* ── Layer 1: Three.js solar system ── */}
      <HeroSolarSystem />

      {/* ── Layer 2: vignette so text reads cleanly above the planets ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 50%, transparent 0%, rgba(3,5,13,0.55) 65%, rgba(3,5,13,0.85) 100%)',
        }}
      />

      {/* ── Layer 2.5: Breathing star core behind the title ──
          A soft radial bloom that gently scales + shifts opacity (breathing) and
          reacts subtly to the cursor. Pure GPU (transform + opacity). */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{
          opacity: [0.28, 0.5, 0.28],
          scale:   [0.95, 1.05, 0.95],
        }}
        transition={{
          opacity: { duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 },
          scale:   { duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay: 0.2 },
        }}
        className="absolute pointer-events-none"
        style={{
          width: '60vmin',
          height: '60vmin',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${cursor.x * 12}px, ${cursor.y * 8}px)`,
          background: `radial-gradient(circle, rgba(0,229,255,${0.16 * starIntensity}) 0%, rgba(168,85,247,${0.12 * starIntensity}) 35%, transparent 70%)`,
          filter: 'blur(30px)',
        }}
      />

      {/* ── Layer 3: Cursor-reactive foreground glow ──
          A second, smaller glow that tracks the pointer more literally. Gives
          subtle "field lensing" feel as the user moves around. */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '26vmin',
          height: '26vmin',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) translate(${cursor.x * 110}px, ${cursor.y * 75}px)`,
          background:
            'radial-gradient(circle, rgba(0,229,255,0.12) 0%, rgba(255,45,209,0.06) 40%, transparent 70%)',
          filter: 'blur(20px)',
          transition: 'transform 60ms linear',
        }}
      />

      {/* ── Layer 3.5: Lens flare streak (very subtle) ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: '40vmin',
          height: '2px',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) rotate(${cursor.x * 12}deg)`,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(0,229,255,0.25) 45%, rgba(255,255,255,0.35) 50%, rgba(168,85,247,0.25) 55%, transparent 100%)',
          opacity: starIntensity * 0.55,
          filter: 'blur(1.5px)',
        }}
      />

      {/* ── Layer 4: registration corner marks ── */}
      <CornerMarks />

      {/* ── Layer 5: content ── */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 lg:px-12 py-20 w-full text-center flex flex-col items-center">
        {/* Status pill — step 1 of entry */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="inline-flex items-center gap-2 px-4 py-1.5 mb-12 rounded-full"
          style={{
            background: 'rgba(12,17,34,0.55)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(0,229,255,0.22)',
          }}
        >
          <span className="relative flex w-1.5 h-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[#58f5a0] opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#58f5a0]" />
          </span>
          <span className="font-mono text-[10px] tracking-[0.32em] text-[#a8b1d4] uppercase">
            engine online · v1.0
          </span>
        </motion.div>

        {/* Title — three lines, staggered 120ms each */}
        <motion.h1
          className="font-display leading-[0.92] uppercase"
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 7.5rem)',
            letterSpacing: '0.02em',
            color: '#e8ecff',
          }}
        >
          {['Cosmic', 'Simulation', 'Engine'].map((word, i) => (
            <motion.div
              key={word}
              initial={{ opacity: 0, y: 30, letterSpacing: '0.18em' }}
              animate={{ opacity: 1, y: 0, letterSpacing: '0.02em' }}
              transition={{ duration: 0.85, delay: 0.30 + i * 0.12, ease: [0.2, 0.8, 0.2, 1] }}
              className="block"
            >
              {i === 1 ? (
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      'linear-gradient(110deg, #ffffff 0%, #00e5ff 35%, #a855f7 65%, #ffffff 100%)',
                    backgroundSize: '200% 100%',
                    animation: 'titleGradient 9s ease-in-out infinite',
                  }}
                >
                  {word}
                </span>
              ) : (
                word
              )}
            </motion.div>
          ))}
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.80 }}
          className="mt-10 max-w-xl text-base md:text-lg text-[#cdd3ee]/70 font-light leading-relaxed"
        >
          Design, simulate, and question reality — from quantum particles to entire universes.
        </motion.p>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.75, delay: 0.95 }}
          className="mt-3 font-mono text-[11px] tracking-[0.32em] text-[#a855f7] uppercase"
        >
          You don't learn physics here. You control it.
        </motion.p>

        {/* Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 1.10 }}
          className="mt-14 flex flex-col items-center gap-3"
        >
          <div className="flex flex-col sm:flex-row gap-5 items-center justify-center">
            <ControlButton variant="primary" onClick={enterLab}>
              Enter Simulation
            </ControlButton>
            <ControlButton variant="ghost" arrow={false} onClick={onScrollToDemo}>
              Try Demo ↓
            </ControlButton>
          </div>
          {/* CTA micro-text */}
          <p className="font-mono text-[10px] tracking-[0.25em] text-[#8b93b8] uppercase mt-1">
            Start building your own universe
          </p>
        </motion.div>
      </div>

      {/* ── Bottom-left: SYSTEM STATUS block ── */}
      <motion.div
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 1.35 }}
        className="absolute bottom-8 left-6 lg:left-12 font-mono text-[10px] tracking-[0.25em] text-[#8b93b8] uppercase pointer-events-none leading-[1.7]"
      >
        <div>
          System Status: <span className="text-[#58f5a0]">Online</span>
        </div>
        <div>
          Modules: <span className="text-[#00e5ff]">5 Active</span>
        </div>
        <div>
          Performance: <span className="text-[#a855f7]">60 FPS</span>
        </div>
      </motion.div>

      {/* ── Bottom-right: animated scroll indicator ── */}
      <motion.button
        type="button"
        onClick={onScrollToDemo}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.50 }}
        className="absolute bottom-8 right-6 lg:right-12 flex flex-col items-center gap-2 group cursor-pointer"
      >
        <span className="font-mono text-[10px] tracking-[0.32em] text-[#a8b1d4] uppercase group-hover:text-[#00e5ff] transition-colors">
          Explore the Engine
        </span>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="flex flex-col items-center gap-1"
        >
          <span className="w-px h-5 bg-gradient-to-b from-transparent to-[#00e5ff]" />
          <span className="font-mono text-[14px] text-[#00e5ff]">↓</span>
        </motion.div>
      </motion.button>

      {/* Title gradient drift keyframes */}
      <style>{`
        @keyframes titleGradient {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
      `}</style>
    </section>
  );
}

function CornerMarks() {
  const Mark = ({ rotate = 0, position }) => (
    <span className={`absolute w-5 h-5 ${position}`} style={{ transform: `rotate(${rotate}deg)` }}>
      <span className="absolute top-0 left-0 w-full h-px" style={{ background: 'rgba(0,229,255,0.4)' }} />
      <span className="absolute top-0 left-0 w-px h-full" style={{ background: 'rgba(0,229,255,0.4)' }} />
    </span>
  );
  return (
    <>
      <Mark position="top-6 left-6" rotate={0} />
      <Mark position="top-6 right-6" rotate={90} />
      <Mark position="bottom-6 right-6" rotate={180} />
      <Mark position="bottom-6 left-6" rotate={270} />
    </>
  );
}
