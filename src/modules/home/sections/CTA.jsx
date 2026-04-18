import React from 'react';
import { motion } from 'framer-motion';
import ControlButton from '../components/ControlButton';
import { usePortal } from '../components/PortalTransition';

export default function CTA() {
  const { enterLab } = usePortal();
  return (
    <section className="relative py-40 px-6 lg:px-12 overflow-hidden">
      {/* Layered backdrop converging to center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(0,229,255,0.16), transparent 65%),' +
            'radial-gradient(ellipse 80% 50% at 30% 80%, rgba(168,85,247,0.10), transparent 70%),' +
            'radial-gradient(ellipse 80% 50% at 70% 20%, rgba(255,45,209,0.09), transparent 70%)',
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#00e5ff]/40 to-transparent" />

      <div className="relative max-w-5xl mx-auto text-center">
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="font-display text-[#e8ecff] leading-[0.95] mb-12"
          style={{ fontSize: 'clamp(2.5rem, 8vw, 7rem)', letterSpacing: '0.03em' }}
        >
          Start building
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(135deg, #00e5ff, #a855f7, #ff2dd1)',
              backgroundSize: '200% 100%',
              animation: 'ctaGradient 8s ease-in-out infinite',
            }}
          >
            your universe.
          </span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-[#8b93b8] text-lg font-light mb-12 max-w-xl mx-auto"
        >
          No signup. No tutorial. Just a slider for gravity and a switch for the observer.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex justify-center"
        >
          <ControlButton variant="primary" onClick={enterLab}>
            Enter Simulation
          </ControlButton>
        </motion.div>
      </div>

      {/* Footer credit */}
      <div className="relative mt-32 max-w-7xl mx-auto flex justify-between items-center font-mono text-[10px] tracking-[0.25em] text-[#8b93b8]/60 uppercase">
        <span>Universe Lab — v1.0</span>
        <span className="hidden md:inline">Built with Three.js · React · Redux</span>
        <span>© Cosmic Simulation Engine</span>
      </div>

      <style>{`
        @keyframes ctaGradient {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
      `}</style>
    </section>
  );
}
