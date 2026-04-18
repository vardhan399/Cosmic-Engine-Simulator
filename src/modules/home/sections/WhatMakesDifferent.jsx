import React from 'react';
import { motion } from 'framer-motion';

/**
 * "What Makes This Different" — answers the visitor's implicit question:
 * why should I care? Three columns, each a distinct value prop with a small
 * animated icon. Minimal text, maximum clarity.
 */
export default function WhatMakesDifferent() {
  return (
    <section className="relative py-28 px-6 lg:px-12">
      <div className="max-w-6xl mx-auto">
        {/* Section heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="mb-16 text-center"
        >
          <div className="font-mono text-[10px] tracking-[0.32em] text-[#00e5ff] uppercase mb-4">
            Why This
          </div>
          <h2
            className="font-display text-[#e8ecff] leading-[0.95]"
            style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', letterSpacing: '0.02em' }}
          >
            You don't just <span className="text-[#a855f7]">simulate</span> physics.
            <br />
            You <span className="text-[#00e5ff]">control</span> it.
          </h2>
        </motion.div>

        {/* Three columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <Column
            accent="#00e5ff"
            title="Real-Time Control"
            text="Every slider directly feeds the physics engine. No pre-baked scenarios, no fake loops — move a value, watch the universe respond."
            delay={0}
            icon={<RealTimeIcon />}
          />
          <Column
            accent="#a855f7"
            title="Multi-Scale Reality"
            text="From a single photon in a double-slit to a filament of dark matter across a gigaparsec. One engine, every scale."
            delay={0.12}
            icon={<MultiScaleIcon />}
          />
          <Column
            accent="#ff2dd1"
            title="Laws Are Editable"
            text="Change gravity's exponent. Reverse time. Break Bertrand's theorem. Then watch what reality does in response."
            delay={0.24}
            icon={<LawsIcon />}
          />
        </div>
      </div>
    </section>
  );
}

function Column({ accent, title, text, delay, icon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7, delay, ease: 'easeOut' }}
      className="relative p-7 rounded-[14px] group"
      style={{
        background: 'rgba(12, 17, 34, 0.4)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(120, 140, 200, 0.12)',
      }}
    >
      {/* Hover glow on top edge */}
      <div
        className="absolute top-0 left-0 right-0 h-px opacity-60"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />
      <div className="mb-5 transition-transform duration-500 group-hover:scale-110" style={{ color: accent }}>
        {icon}
      </div>
      <h3 className="font-display text-lg text-[#e8ecff] mb-3 tracking-wide">{title}</h3>
      <p className="text-sm text-[#a8b1d4]/80 leading-relaxed font-light">{text}</p>
    </motion.div>
  );
}

// ─── Mini animated icons (pure SVG + CSS, GPU-only) ───────────────────

function RealTimeIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      {/* A slider whose knob moves back and forth */}
      <line x1="6" y1="21" x2="36" y2="21" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <circle cx="21" cy="21" r="4" fill="currentColor">
        <animate attributeName="cx" values="10;32;10" dur="3.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="21" cy="21" r="8" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5">
        <animate attributeName="cx" values="10;32;10" dur="3.6s" repeatCount="indefinite" />
        <animate attributeName="r" values="6;10;6" dur="3.6s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.6;0;0.6" dur="3.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function MultiScaleIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      {/* Nested circles representing scales: quantum → atom → planet → galaxy */}
      <circle cx="21" cy="21" r="2"  fill="currentColor">
        <animate attributeName="opacity" values="1;0.4;1" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="21" cy="21" r="6"  fill="none" stroke="currentColor" strokeWidth="1" opacity="0.7">
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="2.8s" begin="0.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="21" cy="21" r="11" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5">
        <animate attributeName="opacity" values="0.2;0.7;0.2" dur="2.8s" begin="0.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="21" cy="21" r="17" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.3">
        <animate attributeName="opacity" values="0.1;0.5;0.1" dur="2.8s" begin="0.6s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

function LawsIcon() {
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" fill="none">
      {/* Crossed force arrows that rotate slowly, showing "laws can flip" */}
      <g style={{ transformOrigin: '21px 21px' }}>
        <animateTransform attributeName="transform" type="rotate" from="0 21 21" to="360 21 21" dur="10s" repeatCount="indefinite" />
        <line x1="21" y1="6"  x2="21" y2="36" stroke="currentColor" strokeWidth="1.5" />
        <line x1="6"  y1="21" x2="36" y2="21" stroke="currentColor" strokeWidth="1.5" />
        <polygon points="21,4 19,8 23,8" fill="currentColor" />
        <polygon points="21,38 19,34 23,34" fill="currentColor" />
        <polygon points="4,21 8,19 8,23" fill="currentColor" />
        <polygon points="38,21 34,19 34,23" fill="currentColor" />
      </g>
      <circle cx="21" cy="21" r="2.5" fill="currentColor" />
    </svg>
  );
}
