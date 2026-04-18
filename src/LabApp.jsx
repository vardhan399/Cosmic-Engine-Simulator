import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { AnimatePresence, motion } from 'framer-motion';
import TopBar from './components/TopBar';
import StatusBar from './components/StatusBar';
import PlanetModule from './modules/planet/PlanetModule';
import SolarModule from './modules/solar/SolarModule';
import UniverseModule from './modules/universe/UniverseModule';
import QuantumModule from './modules/quantum/QuantumModule';
import RealityModule from './modules/simulator/RealityModule';
import { setModule, togglePause, resetAll } from './store/universeSlice';

// Module router — maps the active module key from Redux to its React component.
const ROUTES = {
  planet: PlanetModule,
  solar: SolarModule,
  universe: UniverseModule,
  quantum: QuantumModule,
  reality: RealityModule,
};

// Keyboard shortcut map: number keys switch active module.
const KEY_MAP = { '1': 'planet', '2': 'solar', '3': 'universe', '4': 'quantum', '5': 'reality' };

/**
 * LabApp — the original simulation experience.
 * Mounted at /lab. Identical behavior to the standalone app prior to homepage addition.
 */
export default function LabApp() {
  const active = useSelector((s) => s.universe.activeModule);
  const dispatch = useDispatch();

  // Parse ?module=<key> on mount so card-click navigation lands on the right tab.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mod = params.get('module');
    if (mod && ROUTES[mod]) dispatch(setModule(mod));
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); dispatch(togglePause()); }
      else if (e.key.toLowerCase() === 'r') { if (confirm('Reset all parameters?')) dispatch(resetAll()); }
      else if (KEY_MAP[e.key]) dispatch(setModule(KEY_MAP[e.key]));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  const ActiveModule = ROUTES[active] || PlanetModule;

  return (
    <div className="relative h-full flex flex-col z-10">
      <TopBar />
      <main className="flex-1 min-h-0 px-3 py-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <ActiveModule />
          </motion.div>
        </AnimatePresence>
      </main>
      <StatusBar />
    </div>
  );
}
