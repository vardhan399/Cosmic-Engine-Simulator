import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { createUniverseScene } from './universeScene';
import { useModuleScene } from '../../hooks/useModuleScene';
import { Slider, Badge, Stat, Toggle, Pill } from '../../components/UI';
import { updateUniverse, applyPreset } from '../../store/universeSlice';
import { fmt, fmtExp } from '../../utils/helpers';
import { UNIVERSE_PRESETS } from './universePhysics';

// ────────────────────────────────────────────────────────────────────────────
//  UI option maps
// ────────────────────────────────────────────────────────────────────────────

const FORCE_OPTIONS = [
  { key: 'attractive', label: 'Attractive' },
  { key: 'repulsive',  label: 'Repulsive'  },
  { key: 'none',       label: 'None'       },
];

const OBSERVATION_OPTIONS = [
  { key: 'free',     label: 'Free'     },
  { key: 'cluster',  label: 'Cluster'  },
  { key: 'galaxy',   label: 'Galaxy'   },
  { key: 'zoomout',  label: 'Zoom Out' },
];

const EPOCH_META = {
  early: { label: 'EARLY UNIVERSE', tone: 'amber',   desc: 'Dense, chaotic, structure-forming.' },
  mid:   { label: 'STRUCTURE ERA',  tone: 'cyan',    desc: 'Clustering begins; filaments condense.' },
  late:  { label: 'LATE UNIVERSE',  tone: 'violet',  desc: 'Expansion dominates; voids grow.' },
};

export default function UniverseModule() {
  const universe = useSelector((s) => s.universe.universe);
  const paused = useSelector((s) => s.universe.paused);
  const dispatch = useDispatch();
  const hostRef = useRef(null);
  const sceneHandleRef = useRef(null);
  const [stats, setStats] = useState({
    meanDist: 0, maxDist: 0, volume: 0, clusterCount: 0,
    fate: { label: 'STEADY-STATE', lines: [] }, epoch: 'early',
  });

  const factory = (ctx) => {
    const h = createUniverseScene(ctx);
    sceneHandleRef.current = h;
    return h;
  };
  useModuleScene(hostRef, factory, universe, paused, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (sceneHandleRef.current?.getStats) setStats(sceneHandleRef.current.getStats());
    }, 300);
    return () => clearInterval(id);
  }, []);

  const u = (patch) => dispatch(updateUniverse(patch));
  const epochMeta = EPOCH_META[stats.epoch] || EPOCH_META.early;
  const fateTone =
    stats.fate.label === 'HEAT DEATH' ? 'danger' :
    stats.fate.label === 'BIG CRUNCH' ? 'amber' :
    stats.fate.label === 'OPEN EXPANSION' ? 'cyan' :
    'success';

  return (
    <div className="grid grid-cols-[290px_1fr_300px] gap-3 h-full min-h-0">
      {/* ════════════════ LEFT — controls ════════════════ */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#00e5ff] mb-4 neon-text">COSMIC WEB ENGINE</div>

        {/* PRESETS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(UNIVERSE_PRESETS).map(([k, v]) => (
              <Pill key={k} onClick={() => dispatch(applyPreset({ module: 'universe', data: v }))}>
                {k}
              </Pill>
            ))}
          </div>
        </div>

        {/* COSMIC STRUCTURE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#a855f7] mb-2">Cosmic Structure</div>
          <Slider label="Clusters"     value={universe.clusters}    min={1}   max={24}   step={1}    onChange={(v) => u({ clusters: v })} precision={0} />
          <Slider label="Web Strength" value={universe.webStrength} min={0}   max={2.5}  step={0.05} onChange={(v) => u({ webStrength: v })} />
          <Slider label="Particles"    value={universe.particles}   min={500} max={10000} step={100}  onChange={(v) => u({ particles: v })} precision={0} />
        </div>

        {/* FORCE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ffb347] mb-2">Force</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {FORCE_OPTIONS.map((opt) => (
              <Pill key={opt.key} active={universe.forceType === opt.key} onClick={() => u({ forceType: opt.key })}>
                {opt.label}
              </Pill>
            ))}
          </div>
          <Slider label="Gravity (G)" value={universe.G}         min={0}   max={3}   step={0.05} onChange={(v) => u({ G: v })} />
          <Slider label="Expansion"   value={universe.expansion} min={0}   max={4}   step={0.05} onChange={(v) => u({ expansion: v })} />
        </div>

        {/* SIMULATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Simulation</div>
          <Slider label="Time Scale" value={universe.timeScale} min={0.1} max={5} step={0.05} onChange={(v) => u({ timeScale: v })} unit="×" />
        </div>

        {/* VISUALIZATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Visualization</div>
          <Toggle label="Cosmic Web"     checked={universe.showCosmicWeb}     onChange={(v) => u({ showCosmicWeb: v })} />
          <Toggle label="Galaxies"       checked={universe.showGalaxies}      onChange={(v) => u({ showGalaxies: v })} />
          <Toggle label="Dark Matter"    checked={universe.showDarkMatter}    onChange={(v) => u({ showDarkMatter: v })} />
          <Toggle label="Expansion Grid" checked={universe.showFabric}        onChange={(v) => u({ showFabric: v })} />
          <Toggle label="CMB Backdrop"   checked={universe.showCMB}           onChange={(v) => u({ showCMB: v })} />
          <Toggle label="Velocity Field" checked={universe.showVelocityField} onChange={(v) => u({ showVelocityField: v })} />
          <Toggle label="Trails"         checked={universe.showTrails}        onChange={(v) => u({ showTrails: v })} />
          <Toggle label="Dark Matter Force" checked={universe.darkMatter}     onChange={(v) => u({ darkMatter: v })} />
        </div>

        {/* OBSERVATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#58f5a0] mb-2">Observation</div>
          <div className="flex flex-wrap gap-1.5">
            {OBSERVATION_OPTIONS.map((opt) => (
              <Pill
                key={opt.key}
                active={universe.observationMode === opt.key}
                onClick={() => u({ observationMode: opt.key })}
              >
                {opt.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* EVENTS */}
        <div className="mb-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff4d6d] mb-2">Events</div>
          <button
            onClick={() => u({ bigBangTrigger: universe.bigBangTrigger + 1 })}
            className="btn w-full"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,77,109,0.25))',
              borderColor: 'rgba(255,255,255,0.4)',
            }}
          >
            💥 BIG BANG
          </button>
        </div>
      </motion.aside>

      {/* ════════════════ CENTER — viewport ════════════════ */}
      <div className="canvas-host" ref={hostRef} />

      {/* ════════════════ RIGHT — analytics ════════════════ */}
      <motion.aside
        initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#ff2dd1] mb-4 neon-text">COSMIC ANALYTICS</div>

        {/* EPOCH */}
        <div className="mb-5 p-3 rounded-lg" style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(0,229,255,0.06) 100%)',
          border: '1px solid rgba(168,85,247,0.25)',
        }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Identity</div>
          <Badge tone={epochMeta.tone}>{epochMeta.label}</Badge>
          <p className="font-mono text-[10px] text-[#8b93b8] mt-2 leading-relaxed">{epochMeta.desc}</p>
        </div>

        {/* COSMIC FATE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff4d6d] mb-2">Cosmic Fate</div>
          <Badge tone={fateTone}>{stats.fate.label}</Badge>
          <div className="mt-2 space-y-1">
            {stats.fate.lines?.map((line, i) => (
              <div
                key={i}
                className="pl-2 font-mono text-[10px] leading-relaxed text-[#a8b1d4]"
                style={{ borderLeft: `2px solid ${fateTone === 'danger' ? '#ff4d6d' : fateTone === 'amber' ? '#ffb347' : fateTone === 'cyan' ? '#00e5ff' : '#58f5a0'}` }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* STATS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Observation</div>
          <Stat label="Clusters"     value={stats.clusterCount || 0} />
          <Stat label="Particles"    value={universe.particles}  tone="cyan" />
          <Stat label="Mean Dist"    value={fmt(stats.meanDist, 1)} />
          <Stat label="Max Dist"     value={fmt(stats.maxDist, 1)} tone="amber" />
          <Stat label="Volume"       value={fmtExp(stats.volume)} tone="violet" />
          <Stat label="Expansion"    value={`${fmt(universe.expansion)}×`} tone="amber" />
        </div>

        {/* DESCRIPTION */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">About</div>
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed">
            Particles initialize along the cosmic web — a graph of nodes (galaxy clusters) connected by filaments.
            Gravity pulls toward the nearest node (amplified by dark matter); expansion stretches space itself.
            Try <span className="text-[#ff4d6d]">Big Bang</span> to reset origin, or switch
            <span className="text-[#58f5a0]"> Observation</span> to Cluster/Galaxy focus.
          </p>
        </div>
      </motion.aside>
    </div>
  );
}
