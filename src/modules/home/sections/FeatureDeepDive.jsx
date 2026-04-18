import React from 'react';
import { motion } from 'framer-motion';

/**
 * Feature Deep Dive — three detail cards with small live-feeling diagrams.
 * Covers three core differentiators:
 *   1. Physics engine (orbital mechanics)
 *   2. Chaos vs determinism (twin trajectories)
 *   3. Multi-universe comparison
 *
 * All animations are SVG + SMIL / CSS keyframes. No JS per-frame cost.
 */
export default function FeatureDeepDive() {
  return (
    <section className="relative py-28 px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="mb-14 max-w-2xl"
        >
          <div className="font-mono text-[10px] tracking-[0.32em] text-[#58f5a0] uppercase mb-4">
            Under the Hood
          </div>
          <h2
            className="font-display text-[#e8ecff] leading-[0.95]"
            style={{ fontSize: 'clamp(2rem, 4.5vw, 3.5rem)', letterSpacing: '0.02em' }}
          >
            What's actually <span className="text-[#58f5a0]">running</span>.
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DeepCard
            accent="#00e5ff"
            label="Physics Engine"
            title="Real N-Body Dynamics"
            text="Newton's inverse-square law integrated at 240 Hz with leapfrog symplectic steps. Configurable G, exponent, dissipation — or reverse time."
            delay={0}
            diagram={<OrbitsDiagram />}
          />
          <DeepCard
            accent="#ff4d6d"
            label="Chaos vs Determinism"
            title="Lyapunov Visible"
            text="Run the same system with a 10⁻³ offset. Deterministic = identical traces. Chaotic = exponential divergence. Watch it happen in real time."
            delay={0.12}
            diagram={<ChaosDiagram />}
          />
          <DeepCard
            accent="#a855f7"
            label="Multi-Universe"
            title="Parallel Realities"
            text="Spawn up to 4 multiverse clones with independent perturbations. Each evolves under its own laws. Compare signatures side-by-side."
            delay={0.24}
            diagram={<MultiverseDiagram />}
          />
        </div>
      </div>
    </section>
  );
}

function DeepCard({ accent, label, title, text, delay, diagram }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      className="relative rounded-[14px] overflow-hidden"
      style={{
        background: 'rgba(12, 17, 34, 0.5)',
        backdropFilter: 'blur(18px)',
        border: '1px solid rgba(120, 140, 200, 0.14)',
      }}
    >
      {/* Diagram panel */}
      <div
        className="relative h-40 flex items-center justify-center overflow-hidden"
        style={{
          background: `radial-gradient(ellipse at center, ${accent}0e 0%, transparent 70%)`,
          borderBottom: `1px solid ${accent}22`,
        }}
      >
        <div style={{ color: accent }}>{diagram}</div>
      </div>
      {/* Copy */}
      <div className="p-6">
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-2" style={{ color: accent }}>
          {label}
        </div>
        <h3 className="font-display text-lg text-[#e8ecff] mb-2 tracking-wide">{title}</h3>
        <p className="text-sm text-[#a8b1d4]/80 leading-relaxed font-light">{text}</p>
      </div>
    </motion.div>
  );
}

// ─── Diagrams ───────────────────────────────────────────────────────

function OrbitsDiagram() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
      {/* Central star */}
      <circle cx="80" cy="60" r="5" fill="currentColor">
        <animate attributeName="r" values="4.5;5.5;4.5" dur="2.8s" repeatCount="indefinite" />
      </circle>
      {/* Orbit rings */}
      <ellipse cx="80" cy="60" rx="22" ry="12" stroke="currentColor" strokeWidth="0.7" opacity="0.3" />
      <ellipse cx="80" cy="60" rx="42" ry="22" stroke="currentColor" strokeWidth="0.7" opacity="0.3" />
      <ellipse cx="80" cy="60" rx="62" ry="32" stroke="currentColor" strokeWidth="0.7" opacity="0.25" />
      {/* Orbiting bodies */}
      <circle r="2.5" fill="currentColor">
        <animateMotion dur="4s" repeatCount="indefinite" path="M 102,60 A 22,12 0 1,1 58,60 A 22,12 0 1,1 102,60" />
      </circle>
      <circle r="3" fill="currentColor">
        <animateMotion dur="7s" repeatCount="indefinite" path="M 122,60 A 42,22 0 1,1 38,60 A 42,22 0 1,1 122,60" />
      </circle>
      <circle r="2" fill="currentColor">
        <animateMotion dur="11s" repeatCount="indefinite" path="M 142,60 A 62,32 0 1,1 18,60 A 62,32 0 1,1 142,60" />
      </circle>
    </svg>
  );
}

function ChaosDiagram() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
      {/* Two converging origins that diverge */}
      <path
        d="M 20,60 C 50,55 75,52 95,40 C 120,30 140,40 150,45"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
        opacity="0.9"
        strokeDasharray="140"
        strokeDashoffset="140"
      >
        <animate attributeName="stroke-dashoffset" values="140;0" dur="2.4s" fill="freeze" repeatCount="1" />
      </path>
      <path
        d="M 20,60 C 50,62 75,70 95,88 C 120,100 140,82 150,95"
        stroke="#ff4d6d"
        strokeWidth="1.2"
        fill="none"
        opacity="0.9"
        strokeDasharray="150"
        strokeDashoffset="150"
      >
        <animate attributeName="stroke-dashoffset" values="150;0" dur="2.4s" fill="freeze" begin="0.1s" repeatCount="1" />
      </path>
      {/* Start dot */}
      <circle cx="20" cy="60" r="3" fill="currentColor" />
      {/* Divergence line */}
      <line x1="150" y1="45" x2="150" y2="95" stroke="currentColor" strokeWidth="0.8" strokeDasharray="2 2" opacity="0.5" />
      <text x="155" y="72" fontSize="8" fontFamily="monospace" fill="currentColor" opacity="0.6">Δ</text>
    </svg>
  );
}

function MultiverseDiagram() {
  return (
    <svg width="160" height="120" viewBox="0 0 160 120" fill="none">
      {/* 4 overlapping ellipses */}
      {[
        { cx: 60,  cy: 60, rx: 32, ry: 22, op: 0.7,  delay: 0 },
        { cx: 80,  cy: 55, rx: 32, ry: 22, op: 0.55, delay: 0.15 },
        { cx: 100, cy: 60, rx: 32, ry: 22, op: 0.4,  delay: 0.3 },
        { cx: 80,  cy: 72, rx: 32, ry: 22, op: 0.3,  delay: 0.45 },
      ].map((e, i) => (
        <ellipse
          key={i}
          cx={e.cx}
          cy={e.cy}
          rx={e.rx}
          ry={e.ry}
          stroke="currentColor"
          strokeWidth="0.9"
          fill="currentColor"
          fillOpacity="0.04"
          opacity={e.op}
        >
          <animate attributeName="opacity" values={`${e.op};${e.op * 0.4};${e.op}`} dur="3.2s" begin={`${e.delay}s`} repeatCount="indefinite" />
        </ellipse>
      ))}
      {/* Central convergence dot */}
      <circle cx="80" cy="62" r="3" fill="currentColor">
        <animate attributeName="r" values="2.5;3.5;2.5" dur="2s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
