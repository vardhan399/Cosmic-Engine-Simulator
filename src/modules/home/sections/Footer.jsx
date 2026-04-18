import React from 'react';
import { motion } from 'framer-motion';

/**
 * Footer — final page element. Deliberately minimal: project name, version,
 * copyright-style credit line, and a few meta links. Matches the instrument-
 * panel aesthetic of the rest of the site.
 */
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative px-6 lg:px-12 pt-12 pb-10 border-t border-[#1a2142]/60">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 0.6 }}
          className="flex flex-col md:flex-row items-center justify-between gap-6"
        >
          {/* Brand */}
          <div className="flex items-center gap-3">
            <span className="inline-block w-2 h-2 rounded-full bg-[#00e5ff]" style={{ boxShadow: '0 0 10px #00e5ff' }} />
            <span className="font-display text-sm text-[#e8ecff] tracking-[0.18em] uppercase">
              Cosmic Simulation Engine
            </span>
            <span className="font-mono text-[9px] text-[#8b93b8] tracking-[0.25em] uppercase">v1.0</span>
          </div>

          {/* Meta links */}
          <div className="flex items-center gap-6 font-mono text-[10px] tracking-[0.3em] uppercase text-[#8b93b8]">
            <a className="hover:text-[#00e5ff] transition-colors cursor-pointer">Docs</a>
            <a className="hover:text-[#a855f7] transition-colors cursor-pointer">Source</a>
            <a className="hover:text-[#ff2dd1] transition-colors cursor-pointer">Feedback</a>
          </div>

          {/* Credit */}
          <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-[#4a5378]">
            © {year} · Built with Three.js + React
          </div>
        </motion.div>
      </div>
    </footer>
  );
}
