import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import ReactiveBackdrop from '../components/ReactiveBackdrop';

/**
 * Three taglines, each with a reactive particle behavior in the background.
 *
 * Per spec:
 *   "Modify gravity"   → particles collapse inward
 *   "Observe particles" → wave distortion
 *   "Build worlds"     → expansion
 *
 * Implementation: one shared canvas backdrop fills the section. Each line has
 * its own IntersectionObserver; when a line crosses the viewport center we set
 * the backdrop's mode via a ref (no re-render).
 */
const LINES = [
  {
    text: 'Modify gravity. Watch systems collapse.',
    accent: '#ff2dd1',
    mode: 'collapse',
  },
  {
    text: 'Observe particles. Change outcomes.',
    accent: '#00e5ff',
    mode: 'wave',
  },
  {
    text: 'Build worlds. Test for life.',
    accent: '#a855f7',
    mode: 'expand',
  },
];

const wordStagger = {
  initial: { opacity: 0, y: 22, filter: 'blur(8px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
};

export default function Experience() {
  // Mode switched by IntersectionObservers; canvas reads via ref to avoid re-renders.
  const modeRef = useRef('collapse');

  // Each line gets a ref so we can observe it
  const lineRefs = useRef([]);

  useEffect(() => {
    const observers = lineRefs.current.map((el, i) => {
      if (!el) return null;
      const io = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
            modeRef.current = LINES[i].mode;
          }
        },
        { threshold: [0, 0.4, 0.6, 1] }
      );
      io.observe(el);
      return io;
    });
    return () => observers.forEach((io) => io && io.disconnect());
  }, []);

  return (
    <section className="relative py-40 px-6 lg:px-12 overflow-hidden">
      {/* ── Backdrop ── */}
      <div className="absolute inset-0">
        <ReactiveBackdrop modeRef={modeRef} />
        {/* gentle vignette so text edges remain readable */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 60% at 50% 50%, transparent 0%, rgba(3,5,13,0.4) 70%, rgba(3,5,13,0.85) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="mb-20"
        >
          <h2
            className="font-display text-[#e8ecff] leading-[0.95]"
            style={{ fontSize: 'clamp(2rem, 4.5vw, 4rem)', letterSpacing: '0.02em' }}
          >
            What you can <span className="text-[#00e5ff]">do</span>.
          </h2>
        </motion.div>

        <div className="space-y-20 md:space-y-28">
          {LINES.map((line, i) => (
            <motion.div
              key={i}
              ref={(el) => (lineRefs.current[i] = el)}
              className={`max-w-4xl ${i === 1 ? 'md:ml-12 lg:ml-24' : ''} ${i === 2 ? 'md:ml-4 lg:ml-8' : ''}`}
              initial="initial"
              whileInView="whileInView"
              viewport={{ once: true, margin: '-120px' }}
            >
              <p
                className="font-display text-[#e8ecff] leading-tight tracking-wide"
                style={{ fontSize: 'clamp(1.6rem, 5vw, 3.75rem)' }}
              >
                {line.text.split(' ').map((word, j) => {
                  const isAccent = word.endsWith('.');
                  return (
                    <motion.span
                      key={j}
                      variants={wordStagger}
                      transition={{ duration: 0.65, delay: j * 0.07, ease: 'easeOut' }}
                      className="inline-block mr-[0.25em]"
                      style={isAccent ? { color: line.accent, textShadow: `0 0 24px ${line.accent}66` } : undefined}
                    >
                      {word}
                    </motion.span>
                  );
                })}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Footnote */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="mt-32 max-w-2xl"
        >
          <div className="border-l-2 pl-6" style={{ borderColor: '#00e5ff' }}>
            <p className="font-light text-[#a8b1d4] leading-relaxed text-base md:text-lg">
              Every parameter is yours. Every outcome is consequent. There are no scripted
              demos — the universe responds, and you watch what reality decides.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
