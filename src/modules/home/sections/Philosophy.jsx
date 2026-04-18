import React from 'react';
import { motion } from 'framer-motion';

/**
 * Philosophy — a single quiet, centered line. The space breathes around it.
 * Designed to make the visitor pause for a beat between Experience and CTA.
 */
export default function Philosophy() {
  return (
    <section className="relative py-32 md:py-40 px-6 lg:px-12 overflow-hidden">
      {/* deep cosmic backdrop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(168,85,247,0.10), transparent 70%)',
        }}
      />

      {/* faint hairline above and below — chapter divider feel */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)' }} />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-32 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)' }} />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        <motion.p
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          whileInView={{ opacity: 1, filter: 'blur(0px)' }}
          viewport={{ once: true, margin: '-100px' }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className="font-display text-[#e8ecff] leading-[1.1] tracking-wide"
          style={{
            fontSize: 'clamp(1.5rem, 4.2vw, 3rem)',
            fontWeight: 400,
            letterSpacing: '0.03em',
          }}
        >
          If the constants were different…
          <br />
          <motion.span
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, delay: 0.6 }}
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(135deg, #00e5ff, #a855f7, #ff2dd1)',
            }}
          >
            would you exist?
          </motion.span>
        </motion.p>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.4, delay: 1.2 }}
          className="mt-10 font-mono text-[10px] tracking-[0.4em] uppercase text-[#8b93b8]"
        >
          — reality is just parameters —
        </motion.p>
      </div>
    </section>
  );
}
