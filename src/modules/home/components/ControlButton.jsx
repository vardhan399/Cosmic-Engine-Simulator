import React, { useState } from 'react';
import { motion } from 'framer-motion';

/**
 * ControlButton — futuristic control-panel button with multi-state visual feedback.
 *
 * Variants:
 *   • primary (default): cyan/violet gradient fill, looks like a "GO" key on a console
 *   • ghost: outlined, minimal, used for secondary actions
 *
 * Features:
 *   • Animated corner brackets that expand on hover
 *   • Traveling glow that sweeps across the border on hover
 *   • Inner panel highlights and press feedback (scale + inner glow flash)
 *   • Optional trailing arrow that nudges on hover
 */
export default function ControlButton({
  children,
  onClick,
  variant = 'primary',
  arrow = true,
  className = '',
}) {
  const [pressed, setPressed] = useState(false);

  const isPrimary = variant === 'primary';

  return (
    <motion.button
      onClick={onClick}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      whileTap={{ scale: 0.97 }}
      className={`group relative inline-flex items-center justify-center px-9 py-4 font-mono text-[11px] tracking-[0.28em] uppercase select-none cursor-pointer ${className}`}
      style={{
        color: isPrimary ? '#03050d' : '#e8ecff',
        fontWeight: isPrimary ? 600 : 500,
      }}
    >
      {/* ── Outer bracket frame (top-left + bottom-right) ── */}
      <Bracket position="tl" />
      <Bracket position="br" />

      {/* ── Inner panel ── */}
      <span
        className="absolute inset-0 rounded-[2px] transition-all duration-300"
        style={{
          background: isPrimary
            ? 'linear-gradient(135deg, rgba(0,229,255,0.92) 0%, rgba(168,85,247,0.92) 100%)'
            : 'linear-gradient(135deg, rgba(20,28,52,0.65) 0%, rgba(12,17,34,0.85) 100%)',
          border: isPrimary
            ? '1px solid rgba(255,255,255,0.18)'
            : '1px solid rgba(139,147,184,0.35)',
          boxShadow: isPrimary
            ? '0 0 24px rgba(0,229,255,0.25), inset 0 0 0 1px rgba(255,255,255,0.08)'
            : 'inset 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      />

      {/* ── Hover glow swap (primary only) ── */}
      {isPrimary && (
        <span
          className="absolute inset-0 rounded-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-400"
          style={{
            background: 'linear-gradient(135deg, rgba(255,45,209,0.95) 0%, rgba(0,229,255,0.95) 100%)',
            boxShadow: '0 0 38px rgba(255,45,209,0.45)',
          }}
        />
      )}

      {/* ── Hover border for ghost variant ── */}
      {!isPrimary && (
        <span
          className="absolute inset-0 rounded-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{
            border: '1px solid rgba(0,229,255,0.7)',
            boxShadow: '0 0 18px rgba(0,229,255,0.25), inset 0 0 18px rgba(0,229,255,0.08)',
          }}
        />
      )}

      {/* ── Traveling glow line that sweeps across border on hover ── */}
      <span className="absolute inset-0 rounded-[2px] overflow-hidden pointer-events-none">
        <span
          className="absolute top-0 left-0 h-px w-1/3 opacity-0 group-hover:opacity-100"
          style={{
            background: 'linear-gradient(90deg, transparent, #ffffff, transparent)',
            animation: 'sweepX 1.6s linear infinite',
          }}
        />
      </span>

      {/* ── Press flash ── */}
      {pressed && (
        <motion.span
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 rounded-[2px] pointer-events-none"
          style={{ background: 'rgba(255,255,255,0.4)', mixBlendMode: 'overlay' }}
        />
      )}

      {/* ── Status dot ── */}
      <span className="relative z-10 mr-3 flex items-center">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{
            background: isPrimary ? '#03050d' : '#00e5ff',
            boxShadow: isPrimary ? 'none' : '0 0 6px #00e5ff',
          }}
        />
      </span>

      {/* ── Label ── */}
      <span className="relative z-10 flex items-center gap-3">
        {children}
        {arrow && (
          <motion.span
            className="inline-block"
            initial={{ x: 0 }}
            whileHover={{ x: 4 }}
          >
            →
          </motion.span>
        )}
      </span>

      {/* ── Inline keyframes for the sweeping highlight ── */}
      <style>{`
        @keyframes sweepX {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </motion.button>
  );
}

/** Animated L-shaped bracket that grows slightly on hover */
function Bracket({ position }) {
  const rotation = { tl: 0, tr: 90, br: 180, bl: -90 }[position];
  const positionClass = {
    tl: '-top-1.5 -left-1.5',
    tr: '-top-1.5 -right-1.5',
    br: '-bottom-1.5 -right-1.5',
    bl: '-bottom-1.5 -left-1.5',
  }[position];
  return (
    <span
      className={`absolute ${positionClass} w-2.5 h-2.5 transition-all duration-300 group-hover:w-3.5 group-hover:h-3.5 pointer-events-none`}
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <span className="absolute top-0 left-0 w-full h-px bg-[#00e5ff]" style={{ boxShadow: '0 0 6px #00e5ff' }} />
      <span className="absolute top-0 left-0 w-px h-full bg-[#00e5ff]" style={{ boxShadow: '0 0 6px #00e5ff' }} />
    </span>
  );
}
