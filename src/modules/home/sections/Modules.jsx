import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useTilt from '../hooks/useTilt';
import { PlanetIcon, SolarIcon, UniverseIcon, QuantumIcon, RealityIcon } from '../components/ModuleIcons';
import { usePortal } from '../components/PortalTransition';

const MODULES = [
  {
    id: 'planet',
    n: '01',
    title: 'Planet Builder',
    blurb: 'Design and simulate planets with dynamic atmospheres, terrain, and habitability.',
    accent: '#00e5ff',
    Icon: PlanetIcon,
  },
  {
    id: 'solar',
    n: '02',
    title: 'Solar System',
    blurb: 'Build complex solar systems with multiple stars, orbital mechanics, and resonances.',
    accent: '#ffb347',
    Icon: SolarIcon,
  },
  {
    id: 'universe',
    n: '03',
    title: 'Universe Builder',
    blurb: 'Simulate large-scale cosmic structures, expansion, and gravitational clustering.',
    accent: '#a855f7',
    Icon: UniverseIcon,
  },
  {
    id: 'quantum',
    n: '04',
    title: 'Quantum Playground',
    blurb: 'Explore wave-particle duality, interference, and observer effects in real time.',
    accent: '#ff2dd1',
    Icon: QuantumIcon,
  },
  {
    id: 'reality',
    n: '05',
    title: 'Reality Simulator',
    blurb: 'Control determinism, chaos, and probabilistic outcomes across parallel systems.',
    accent: '#58f5a0',
    Icon: RealityIcon,
  },
];

export default function Modules() {
  return (
    <section className="relative py-32 px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">
        {/* Section header */}
        <div className="mb-16 flex items-end justify-between flex-wrap gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7 }}
          >
            <h2
              className="font-display text-[#e8ecff] leading-[0.95]"
              style={{ fontSize: 'clamp(2rem, 5vw, 4.5rem)', letterSpacing: '0.02em' }}
            >
              Five modules.
              <br />
              <span className="text-[#a855f7]">One reality engine.</span>
            </h2>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="max-w-md text-[#8b93b8] text-base font-light leading-relaxed"
          >
            Each module is a self-contained physics laboratory. Switch instantly. Share state via URL.
            All five share one underlying engine.
          </motion.p>
        </div>

        {/* Asymmetric 3 + 2 grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {MODULES.slice(0, 3).map((m, i) => (
            <ModuleCard key={m.id} module={m} delay={i * 0.08} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          {MODULES.slice(3).map((m, i) => (
            <ModuleCard key={m.id} module={m} delay={(i + 3) * 0.08} wide />
          ))}
        </div>
      </div>
    </section>
  );
}

function ModuleCard({ module: m, delay, wide = false }) {
  const tilt = useTilt({ max: 7, scale: 1.02, speed: 280 });
  const { Icon } = m;
  const { enterLab } = usePortal();
  const [ripples, setRipples] = useState([]);

  const handleClick = (e) => {
    // Emit a ripple at the click point
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples((r) => [...r, { id, x, y }]);
    // Ripple clears after animation
    setTimeout(() => setRipples((r) => r.filter((rp) => rp.id !== id)), 700);
    // Navigate with module pre-selected (query param consumed by LabApp)
    enterLab(m.id);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay, ease: 'easeOut' }}
      className="group relative cursor-pointer"
      style={{ perspective: '1200px' }}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(e); }}
    >
      <motion.div
        ref={tilt.ref}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
        style={tilt.style}
        className="relative p-7 overflow-hidden rounded-[14px]"
      >
        {/* ── Base panel ── */}
        <div
          className="absolute inset-0 rounded-[14px] transition-all duration-500 group-hover:opacity-0"
          style={{
            background: 'rgba(12, 17, 34, 0.55)',
            backdropFilter: 'blur(18px) saturate(1.3)',
            border: '1px solid rgba(120, 140, 200, 0.15)',
          }}
        />
        {/* ── Hover panel: gradient shifts toward the module's accent ── */}
        <div
          className="absolute inset-0 rounded-[14px] opacity-0 group-hover:opacity-100 transition-all duration-500"
          style={{
            background: `linear-gradient(155deg, ${m.accent}1f 0%, rgba(12,17,34,0.7) 60%, ${m.accent}14 100%)`,
            backdropFilter: 'blur(20px) saturate(1.5)',
            border: `1px solid ${m.accent}55`,
            boxShadow: `0 0 40px ${m.accent}33, inset 0 0 40px ${m.accent}10`,
          }}
        />

        {/* ── Specular glare driven by tilt ── */}
        <motion.div
          className="absolute inset-0 rounded-[14px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{
            background: `radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), ${m.accent}33, transparent 50%)`,
          }}
        />

        {/* ── Ripple layer (click feedback) ── */}
        <AnimatePresence>
          {ripples.map((r) => (
            <motion.span
              key={r.id}
              initial={{ scale: 0, opacity: 0.55 }}
              animate={{ scale: 5, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute rounded-full pointer-events-none"
              style={{
                left: r.x,
                top: r.y,
                width: 120,
                height: 120,
                marginLeft: -60,
                marginTop: -60,
                background: `radial-gradient(circle, ${m.accent}aa 0%, ${m.accent}22 40%, transparent 70%)`,
              }}
            />
          ))}
        </AnimatePresence>

        {/* ── Card content ── */}
        <div className="relative" style={{ transform: 'translateZ(20px)', minHeight: wide ? 200 : 180 }}>
          {/* Top row: number + animated icon */}
          <div className="flex items-start justify-between mb-6">
            <div className="font-mono text-[10px] tracking-[0.3em] opacity-60" style={{ color: m.accent }}>
              / {m.n}
            </div>
            <div
              className="transition-transform duration-500 group-hover:scale-110"
              style={{ color: m.accent }}
            >
              <Icon accent={m.accent} />
            </div>
          </div>

          {/* Title */}
          <h3 className="font-display text-xl md:text-2xl text-[#e8ecff] mb-3 tracking-wide leading-tight">
            {m.title}
          </h3>

          {/* Blurb — the dynamic explanation lives INSIDE each card so it's
              always visible and the hover emphasis draws the eye. */}
          <p className="text-sm text-[#a8b1d4]/85 leading-relaxed font-light max-w-md">
            {m.blurb}
          </p>

          {/* "Open Module →" hint — fades in on hover, feels like an affordance */}
          <motion.div
            initial={false}
            animate={{ opacity: 0 }}
            whileHover={{ opacity: 1 }}
            className="absolute right-0 bottom-0 font-mono text-[10px] tracking-[0.28em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-500"
            style={{ color: m.accent }}
          >
            Open Module →
          </motion.div>
        </div>

        {/* ── Bottom accent stripe — extends on hover ── */}
        <div
          className="absolute bottom-0 left-0 h-px transition-all duration-700 group-hover:w-full"
          style={{
            width: '40px',
            background: `linear-gradient(90deg, ${m.accent}, transparent)`,
            boxShadow: `0 0 12px ${m.accent}`,
          }}
        />
      </motion.div>
    </motion.article>
  );
}
