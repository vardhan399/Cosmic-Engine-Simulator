import React, { createContext, useContext, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

/**
 * PortalContext — exposes a single `enterLab()` action that:
 *   1. mounts a fullscreen warp overlay
 *   2. waits for the animation to peak
 *   3. navigates to /lab
 *
 * Every CTA on the homepage calls this through the `usePortal` hook.
 */
const PortalCtx = createContext({ enterLab: () => {} });

export function PortalProvider({ children }) {
  const [active, setActive] = useState(false);
  const navigate = useNavigate();

  const enterLab = useCallback((moduleId) => {
    if (active) return;
    setActive(true);
    // Navigate after the overlay has visibly engulfed the screen.
    // 450ms is long enough to register as a "transition" (killing the lag
    // perception) but short enough that it never feels slow.
    const url = moduleId ? `/lab?module=${moduleId}` : '/lab';
    setTimeout(() => navigate(url), 450);
  }, [active, navigate]);

  return (
    <PortalCtx.Provider value={{ enterLab }}>
      {children}
      <PortalOverlay active={active} />
    </PortalCtx.Provider>
  );
}

export const usePortal = () => useContext(PortalCtx);

/**
 * PortalOverlay — the warp effect.
 *
 * Layered visuals in three stages:
 *   1. A central radial light blooms outward from the click point (centered for simplicity).
 *   2. A warping ring of pulses expands toward the viewport edges.
 *   3. A heavy backdrop blur + dark fade engulfs everything just before navigation.
 */
function PortalOverlay({ active }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[100] pointer-events-none"
          style={{ perspective: '1200px' }}
        >
          {/* Layer 1 — radial bloom */}
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 30, opacity: [0, 1, 0.9] }}
            transition={{ duration: 1.0, ease: [0.65, 0, 0.35, 1] }}
            className="absolute top-1/2 left-1/2 w-32 h-32 rounded-full"
            style={{
              transform: 'translate(-50%, -50%)',
              background:
                'radial-gradient(circle, rgba(0,229,255,1) 0%, rgba(168,85,247,0.6) 35%, rgba(255,45,209,0.2) 60%, transparent 80%)',
              filter: 'blur(8px)',
            }}
          />

          {/* Layer 2 — warp rings expanding outward */}
          {[0, 0.12, 0.24, 0.36].map((delay, i) => (
            <motion.div
              key={i}
              initial={{ scale: 0, opacity: 0.9 }}
              animate={{ scale: 12 + i * 4, opacity: 0 }}
              transition={{ duration: 0.95, delay, ease: 'easeOut' }}
              className="absolute top-1/2 left-1/2 w-40 h-40 rounded-full border"
              style={{
                transform: 'translate(-50%, -50%)',
                borderColor: 'rgba(0,229,255,0.7)',
                borderWidth: '1.5px',
                boxShadow: '0 0 30px rgba(0,229,255,0.45)',
              }}
            />
          ))}

          {/* Layer 3 — distortion + final dark engulf */}
          <motion.div
            initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
            animate={{ opacity: 1, backdropFilter: 'blur(24px)' }}
            transition={{ duration: 0.85, delay: 0.15 }}
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at center, transparent 0%, rgba(3,5,13,0.5) 50%, rgba(3,5,13,1) 100%)',
            }}
          />

          {/* Layer 4 — "Initializing Simulation Engine…" loader text */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: [0, 1, 1], scale: [0.9, 1, 1.05] }}
            transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
            className="absolute top-1/2 left-1/2 flex flex-col items-center gap-3"
            style={{
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="font-display text-xl md:text-2xl text-[#e8ecff] whitespace-nowrap"
              style={{
                letterSpacing: '0.18em',
                textShadow: '0 0 22px rgba(0,229,255,0.8), 0 0 40px rgba(168,85,247,0.5)',
              }}
            >
              INITIALIZING SIMULATION ENGINE
            </div>
            {/* Animated dots */}
            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
                  className="w-1.5 h-1.5 rounded-full bg-[#00e5ff]"
                  style={{ boxShadow: '0 0 10px rgba(0,229,255,0.8)' }}
                />
              ))}
            </div>
            {/* Progress bar */}
            <motion.div
              className="w-48 h-px overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="h-full"
                style={{
                  background: 'linear-gradient(90deg, transparent, #00e5ff, #a855f7, transparent)',
                }}
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
