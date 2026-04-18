import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { setModule, resetAll, togglePause } from '../store/universeSlice';
import { shareURL } from '../utils/urlState';

const MODULES = [
  { key: 'planet',   label: 'Planet'   },
  { key: 'solar',    label: 'Solar'    },
  { key: 'universe', label: 'Universe' },
  { key: 'quantum',  label: 'Quantum'  },
  { key: 'reality',  label: 'Physics Engine'  },
];

export default function TopBar() {
  const active = useSelector((s) => s.universe.activeModule);
  const paused = useSelector((s) => s.universe.paused);
  const state = useSelector((s) => s.universe);
  const dispatch = useDispatch();

  const doShare = async () => {
    const url = shareURL(state);
    try {
      await navigator.clipboard.writeText(url);
      alert('Share URL copied to clipboard.');
    } catch {
      prompt('Copy this URL:', url);
    }
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="glass flex items-center justify-between px-4 py-2.5 mx-3 mt-3 relative z-10"
    >
      {/* Brand — clickable, routes to landing page */}
      <Link to="/" className="flex items-center gap-2 group">
        <span
          className="w-2 h-2 rounded-full transition-all"
          style={{ background: '#00e5ff', boxShadow: '0 0 8px #00e5ff' }}
        />
        <span className="font-display text-[11px] tracking-[0.28em] text-[#e8ecff] group-hover:text-[#00e5ff] transition-colors uppercase">
          Cosmic Simulation Engine
        </span>
      </Link>

      <nav className="flex gap-1">
        {MODULES.map((m) => (
          <button
            key={m.key}
            onClick={() => dispatch(setModule(m.key))}
            className={`tab ${active === m.key ? 'active' : ''}`}
          >
            {m.label}
          </button>
        ))}
      </nav>

      <div className="flex gap-2">
        <button className="btn" onClick={() => dispatch(togglePause())}>
          {paused ? '▶ RUN' : '⏸ PAUSE'}
        </button>
        <button className="btn" onClick={doShare}>SHARE</button>
        <button className="btn" onClick={() => { if (confirm('Reset all parameters?')) dispatch(resetAll()); }}>
          RESET
        </button>
      </div>
    </motion.header>
  );
}
