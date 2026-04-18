import React from 'react';
import { motion } from 'framer-motion';

/**
 * Tech / Performance — short credential strip. Four stat cards + a tag line.
 * Used near the end of the landing page to anchor "this is real, this runs fast".
 */
export default function TechPerformance() {
  return (
    <section className="relative py-24 px-6 lg:px-12">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7 }}
          className="mb-12 text-center"
        >
          <div className="font-mono text-[10px] tracking-[0.32em] text-[#ffb347] uppercase mb-4">
            Performance
          </div>
          <h2
            className="font-display text-[#e8ecff] leading-[0.95]"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', letterSpacing: '0.02em' }}
          >
            Built for <span className="text-[#ffb347]">60+ FPS</span> in your browser.
          </h2>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard accent="#00e5ff" value="60+" unit="FPS"     label="Real-Time"    delay={0} />
          <StatCard accent="#a855f7" value="GPU" unit=""         label="WebGL Shaders" delay={0.1} />
          <StatCard accent="#ff2dd1" value="240" unit="Hz"        label="Physics Step" delay={0.2} />
          <StatCard accent="#58f5a0" value="0"   unit="textures"  label="Procedural"   delay={0.3} />
        </div>

        {/* Tech strip */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2 font-mono text-[10px] tracking-[0.28em] text-[#8b93b8] uppercase"
        >
          <span>React 18</span>
          <span className="text-[#1a2142]">·</span>
          <span>Vite</span>
          <span className="text-[#1a2142]">·</span>
          <span>Three.js</span>
          <span className="text-[#1a2142]">·</span>
          <span>Redux Toolkit</span>
          <span className="text-[#1a2142]">·</span>
          <span>Custom Shaders</span>
        </motion.div>
      </div>
    </section>
  );
}

function StatCard({ accent, value, unit, label, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, delay, ease: 'easeOut' }}
      className="relative p-5 rounded-[12px] text-center group"
      style={{
        background: 'rgba(12, 17, 34, 0.4)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(120, 140, 200, 0.12)',
        transition: 'all 0.4s ease',
      }}
    >
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-px opacity-70"
        style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
      />
      <div className="font-display text-2xl md:text-3xl flex items-baseline justify-center gap-1" style={{ color: accent }}>
        {value}
        {unit && <span className="text-xs opacity-70 font-mono tracking-[0.15em]">{unit}</span>}
      </div>
      <div className="mt-2 font-mono text-[9px] tracking-[0.3em] text-[#8b93b8] uppercase">
        {label}
      </div>
    </motion.div>
  );
}
