import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { createSolarScene } from './solarScene';
import { useModuleScene } from '../../hooks/useModuleScene';
import { Slider, Badge, Stat, Toggle, Pill } from '../../components/UI';
import { updateSolar, applyPreset } from '../../store/universeSlice';
import { fmt } from '../../utils/helpers';
import { computeFocusMetrics, endStageForMass, systemPersonality, explainSystem } from './solarPhysics';

// ────────────────────────────────────────────────────────────────────────────
//  Presets & lifecycle UI
// ────────────────────────────────────────────────────────────────────────────

const PRESETS = {
  'sol-lite':   { starMass: 1,   starTemp: 5778,  planetCount: 4, multiStar: 1, lifecycle: 'main',       eccentricity: 0.04, inclination: 0.03 },
  'red-dwarf':  { starMass: 0.3, starTemp: 3200,  planetCount: 6, multiStar: 1, lifecycle: 'main',       eccentricity: 0.06, inclination: 0.05 },
  'blue-giant': { starMass: 8,   starTemp: 12000, planetCount: 3, multiStar: 1, lifecycle: 'main',       eccentricity: 0.08, inclination: 0.04 },
  'binary':     { starMass: 2,   starTemp: 6500,  planetCount: 5, multiStar: 2, lifecycle: 'main',       eccentricity: 0.10, inclination: 0.06 },
  'ternary':    { starMass: 1.5, starTemp: 6000,  planetCount: 4, multiStar: 3, lifecycle: 'main',       eccentricity: 0.12, inclination: 0.08 },
  'aging':      { starMass: 1.2, starTemp: 4000,  planetCount: 4, multiStar: 1, lifecycle: 'giant',      eccentricity: 0.05, inclination: 0.03 },
};

const LIFECYCLE_OPTIONS = [
  { key: 'nebula',     label: 'Nebula'    },
  { key: 'protostar',  label: 'Protostar' },
  { key: 'main',       label: 'Main Seq'  },
  { key: 'giant',      label: 'Red Giant' },
  { key: 'whitedwarf', label: 'W. Dwarf'  },
  { key: 'blackhole',  label: 'Black Hole'},
];

const MULTISTAR_OPTIONS = [
  { key: 1, label: 'Single' },
  { key: 2, label: 'Binary' },
  { key: 3, label: 'Ternary' },
];

// ────────────────────────────────────────────────────────────────────────────

export default function SolarModule() {
  const solar = useSelector((s) => s.universe.solar);
  const paused = useSelector((s) => s.universe.paused);
  const dispatch = useDispatch();
  const hostRef = useRef(null);
  const sceneHandleRef = useRef(null);
  const [analytics, setAnalytics] = useState({
    stability: 'STABLE', drift: 0, bodyCount: 0, planetAlive: 0, planetsInZone: 0,
    resonances: [], focusBody: null, lifecycleStage: 'main',
  });

  // Wire scene handle
  const factory = (ctx) => {
    const h = createSolarScene(ctx);
    sceneHandleRef.current = h;
    h.onPick((id) => dispatch(updateSolar({ focusBodyId: id })));
    h.setEvolveListener?.((progress) => dispatch(updateSolar({ lifecycleProgress: progress })));
    return h;
  };
  useModuleScene(hostRef, factory, solar, paused, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (sceneHandleRef.current?.getAnalytics) {
        setAnalytics(sceneHandleRef.current.getAnalytics());
      }
    }, 250);
    return () => clearInterval(id);
  }, []);

  const u = (patch) => dispatch(updateSolar(patch));

  // Belt editing helpers — update index `i` with a patch
  const updateBelt = (i, patch) => {
    const newBelts = solar.belts.map((b, k) => k === i ? { ...b, ...patch } : b);
    u({ belts: newBelts });
  };

  // ── WOW triggers ──
  const triggerSupernova = () => {
    // Increment trigger counter so scene detects change. Also jump lifecycle to supernova stage.
    u({ supernovaTrigger: solar.supernovaTrigger + 1, lifecycle: 'supernova', evolving: false });
    // Follow up ~1.5s later by settling into end-stage based on mass
    setTimeout(() => {
      const end = endStageForMass(solar.starMass);
      dispatch(updateSolar({ lifecycle: end }));
    }, 1800);
  };

  const triggerBlackHole = () => {
    u({ lifecycle: 'blackhole', evolving: false });
  };

  const triggerTimeWarp = () => {
    // Kick time scale to max and turn on evolution
    u({ timeScale: 5, evolving: true });
    // After 8 seconds auto-reset time, but leave lifecycle where it ended
    setTimeout(() => {
      dispatch(updateSolar({ timeScale: 1, evolving: false }));
    }, 8000);
  };

  const statusTone =
    analytics.stability === 'STABLE' || analytics.stability === 'BINARY ORBIT STABLE' ? 'success' :
    analytics.stability === 'APPROACHING INSTABILITY' ? 'amber' :
    analytics.stability === 'SUPERNOVA EVENT' || analytics.stability === 'BLACK HOLE FORMED' ? 'violet' :
    'danger';

  const focusMetrics = analytics.focusBody ? computeFocusMetrics({
    starLum: solar.starMass,
    distance: analytics.focusBody.semiMajor / 10,
    albedo: 0.3,
  }) : null;

  // System identity + narrative — computed from analytics + params each render
  const personality = systemPersonality({
    stability: analytics.stability,
    drift: analytics.drift,
    resonances: analytics.resonances,
    multiStar: solar.multiStar,
    lifecycleStage: analytics.lifecycleStage,
    chaos: solar.chaos,
  });
  const explanation = explainSystem({ analytics, params: solar });

  return (
    <div className="grid grid-cols-[290px_1fr_300px] gap-3 h-full min-h-0">
      {/* ════════════════ LEFT — controls ════════════════ */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#00e5ff] mb-4 neon-text">GRAVITATIONAL SANDBOX</div>

        {/* PRESETS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PRESETS).map(([k, v]) => (
              <Pill key={k} onClick={() => dispatch(applyPreset({ module: 'solar', data: v }))}>
                {k}
              </Pill>
            ))}
          </div>
        </div>

        {/* SYSTEM ARCHITECTURE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#a855f7] mb-2">Configuration</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {MULTISTAR_OPTIONS.map((opt) => (
              <Pill key={opt.key} active={solar.multiStar === opt.key} onClick={() => u({ multiStar: opt.key })}>
                {opt.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* LIFECYCLE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ffb347] mb-2">Lifecycle Stage</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {LIFECYCLE_OPTIONS.map((opt) => (
              <Pill
                key={opt.key}
                active={!solar.evolving && solar.lifecycle === opt.key}
                onClick={() => u({ lifecycle: opt.key, evolving: false })}
              >
                {opt.label}
              </Pill>
            ))}
          </div>
          <Toggle
            label="Run Evolution"
            checked={solar.evolving}
            onChange={(v) => u({ evolving: v, lifecycleProgress: v ? 0 : solar.lifecycleProgress })}
          />
          {solar.evolving && (
            <>
              <div className="flex justify-between font-mono text-[9px] mt-2 mb-1">
                <span className="text-[#8b93b8] uppercase tracking-[0.25em]">Progress</span>
                <span className="text-[#ffb347]">{(solar.lifecycleProgress * 100).toFixed(0)}%</span>
              </div>
              <div className="relative h-1 rounded-full bg-[#0c1122]">
                <div
                  className="absolute top-0 left-0 h-full rounded-full transition-all"
                  style={{
                    width: `${solar.lifecycleProgress * 100}%`,
                    background: 'linear-gradient(90deg, #4a78c8, #ffb347, #ff4d6d)',
                    boxShadow: '0 0 8px rgba(255,179,71,0.6)',
                  }}
                />
              </div>
              <p className="font-mono text-[9px] text-[#8b93b8] leading-relaxed mt-2">
                Stage: <span className="text-[#ffb347]">{analytics.lifecycleStage}</span>.
                Path ends in <span className="text-[#a855f7]">{endStageForMass(solar.starMass)}</span>.
              </p>
            </>
          )}
        </div>

        {/* STAR */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ffb347] mb-2">Central Star</div>
          <Slider label="Mass" value={solar.starMass} min={0.1} max={10} step={0.05} onChange={(v) => u({ starMass: v })} unit=" M☉" />
          <Slider label="Temperature" value={solar.starTemp} min={2500} max={15000} step={50} onChange={(v) => u({ starTemp: v })} unit=" K" precision={0} />
        </div>

        {/* ORBITS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Orbital Imperfection</div>
          <Slider label="Eccentricity" value={solar.eccentricity} min={0} max={0.25} step={0.005} onChange={(v) => u({ eccentricity: v })} />
          <Slider label="Inclination"  value={solar.inclination}  min={0} max={0.3}  step={0.005} onChange={(v) => u({ inclination: v })} unit=" rad" />
        </div>

        {/* PLANETS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Planets</div>
          <Slider label="Count" value={solar.planetCount} min={1} max={15} step={1} onChange={(v) => u({ planetCount: v })} precision={0} />
        </div>

        {/* BELTS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#58f5a0] mb-2">Asteroid Belts</div>
          {solar.belts.map((belt, i) => (
            <BeltEditor key={belt.id} belt={belt} index={i} onChange={(patch) => updateBelt(i, patch)} />
          ))}
        </div>

        {/* SIMULATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Simulation</div>
          <Slider label="Time Scale" value={solar.timeScale} min={0.1} max={5} step={0.05} onChange={(v) => u({ timeScale: v })} unit="×" />
          <Toggle label="Show Trails" checked={solar.showTrails} onChange={(v) => u({ showTrails: v })} />
          <Toggle label="Show Orbits" checked={solar.showOrbits} onChange={(v) => u({ showOrbits: v })} />
          <Toggle label="Collisions"  checked={solar.collisions} onChange={(v) => u({ collisions: v })} />
          <Toggle label="Chaos Mode"  checked={solar.chaos}      onChange={(v) => u({ chaos: v })} />
        </div>

        {/* VIEW / VISUALIZATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Visualization</div>
          <Toggle label="Gravity Field"    checked={solar.showGravityField}  onChange={(v) => u({ showGravityField: v })} />
          <Toggle label="Habitable Zone"   checked={solar.showHabitableZone} onChange={(v) => u({ showHabitableZone: v })} />
          <Toggle label="Observation Mode" checked={solar.observationMode}   onChange={(v) => u({ observationMode: v })} />
          {solar.observationMode && (
            <p className="font-mono text-[10px] text-[#00e5ff] leading-relaxed mt-1">
              Cinematic autopilot — camera cycles through points of interest.
            </p>
          )}
        </div>

        {/* WOW TRIGGERS */}
        <div className="mb-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff4d6d] mb-2">Events</div>
          <button
            onClick={triggerSupernova}
            className="btn w-full mb-1.5"
            style={{
              background: 'linear-gradient(135deg, rgba(255,77,109,0.25), rgba(255,179,71,0.25))',
              borderColor: 'rgba(255,77,109,0.45)',
            }}
          >
            ✹ SUPERNOVA
          </button>
          <button
            onClick={triggerBlackHole}
            className="btn w-full mb-1.5"
            style={{
              background: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(20,20,20,0.45))',
              borderColor: 'rgba(168,85,247,0.45)',
            }}
          >
            ● BLACK HOLE
          </button>
          <button
            onClick={triggerTimeWarp}
            className="btn w-full"
            style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.25), rgba(168,85,247,0.25))',
              borderColor: 'rgba(0,229,255,0.45)',
            }}
          >
            ⏩ TIME WARP
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
        <div className={`font-display text-xs mb-4 neon-text ${
          statusTone === 'success' ? 'text-[#58f5a0]' :
          statusTone === 'amber'   ? 'text-[#ffb347]' :
          statusTone === 'violet'  ? 'text-[#a855f7]' :
                                     'text-[#ff4d6d]'
        }`}>
          ORBITAL ANALYTICS
        </div>

        {/* SYSTEM PERSONALITY — derived identity label */}
        <div className="mb-5 p-3 rounded-lg" style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(0,229,255,0.06) 100%)',
          border: '1px solid rgba(168,85,247,0.25)',
        }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Identity</div>
          <Badge tone={personality.tone}>{personality.label}</Badge>
        </div>

        {/* STABILITY */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">System Status</div>
          <div className="flex items-center justify-between mb-2">
            <Badge tone={statusTone}>{analytics.stability}</Badge>
            <span className="font-mono text-xs text-[#00e5ff]">ΔE {fmt(analytics.drift * 100, 1)}%</span>
          </div>
          <DriftGraph drift={analytics.drift} tone={statusTone} />
          <p className="font-mono text-[10px] text-[#8b93b8] mt-2 leading-relaxed">
            {analytics.stability === 'STABLE' && 'Energy preserved by symplectic integration.'}
            {analytics.stability === 'BINARY ORBIT STABLE' && 'Planets orbit a barycenter of multiple stars.'}
            {analytics.stability === 'APPROACHING INSTABILITY' && 'Energy drift rising — watch for ejections.'}
            {analytics.stability === 'UNSTABLE' && 'Orbits breaking down.'}
            {analytics.stability === 'EJECTIONS OBSERVED' && 'One or more planets lost to space.'}
            {analytics.stability === 'CHAOTIC DRIFT' && 'Random perturbations destabilizing the system.'}
            {analytics.stability === 'SUPERNOVA EVENT' && 'Outward shock pushing bodies away from core.'}
            {analytics.stability === 'BLACK HOLE FORMED' && 'Accretion disk visible; orbits distort near horizon.'}
          </p>
        </div>

        {/* RESONANCES */}
        {analytics.resonances?.length > 0 && (
          <div className="mb-5">
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#a855f7] mb-2">Resonances</div>
            <div className="flex flex-wrap gap-1.5">
              {analytics.resonances.map((r, i) => (
                <Badge key={i} tone="violet">{r.label}</Badge>
              ))}
            </div>
            <p className="font-mono text-[10px] text-[#8b93b8] mt-1 leading-relaxed">
              Planet pairs locked in integer-ratio periods (Io:Europa 2:1, Neptune:Pluto 3:2).
            </p>
          </div>
        )}

        {/* SYSTEM STATE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">System State</div>
          <Stat label="Bodies" value={analytics.bodyCount} />
          <Stat label="Planets" value={`${analytics.planetAlive} / ${solar.planetCount}`} tone={analytics.planetAlive < solar.planetCount ? 'amber' : 'cyan'} />
          <Stat label="In Hab Zone" value={analytics.planetsInZone || 0} tone={analytics.planetsInZone > 0 ? 'success' : 'cyan'} />
          <Stat label="Stars" value={solar.multiStar} />
          <Stat label="Stage" value={analytics.lifecycleStage?.toUpperCase() || 'MAIN'} tone="violet" />
          <Stat label="Star Mass" value={`${fmt(solar.starMass)} M☉`} tone="amber" />
          <Stat label="Star Temp" value={`${solar.starTemp.toFixed(0)} K`} tone="amber" />
        </div>

        {/* EXPLAIN SYSTEM — AI-style insights */}
        {explanation.length > 0 && (
          <div className="mb-5">
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Explain System</div>
            <div className="space-y-2">
              {explanation.map((insight, i) => {
                const kindColor =
                  insight.kind === 'stability' ? '#ffb347' :
                  insight.kind === 'orbits'    ? '#a855f7' :
                                                 '#58f5a0';
                return (
                  <div
                    key={i}
                    className="pl-2.5 py-0.5 font-mono text-[10px] leading-relaxed text-[#a8b1d4]"
                    style={{ borderLeft: `2px solid ${kindColor}` }}
                  >
                    <span className="uppercase tracking-[0.2em] text-[9px]" style={{ color: kindColor }}>
                      {insight.kind}
                    </span>
                    <div className="mt-0.5">{insight.text}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FOCUS PANEL */}
        {analytics.focusBody && focusMetrics && (
          <div className="mb-5 p-3 rounded-lg" style={{
            background: 'rgba(0,229,255,0.05)',
            border: '1px solid rgba(0,229,255,0.25)',
          }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff]">
                Focus: Planet #{analytics.focusBody.id}
              </div>
              <button
                onClick={() => u({ focusBodyId: null })}
                className="font-mono text-[9px] text-[#8b93b8] hover:text-[#ff4d6d] transition-colors"
              >
                clear ×
              </button>
            </div>
            <Stat label="Semi-Major"   value={`${fmt(analytics.focusBody.semiMajor)} AU-sim`} />
            <Stat label="Eccentricity" value={fmt(analytics.focusBody.eccentricity, 3)} />
            <Stat label="Inclination"  value={`${fmt(analytics.focusBody.inclination, 3)} rad`} />
            <Stat label="Eq Temp"      value={`${fmt(focusMetrics.Teq)} K`} tone="amber" />
            <Stat label="Gravity"      value={`${fmt(focusMetrics.gravity)} m/s²`} />
            <div className="mt-2">
              <Badge tone={
                focusMetrics.habitability.class === 'COMPLEX LIFE' ? 'success' :
                focusMetrics.habitability.class === 'MICROBIAL' ? 'amber' : 'danger'
              }>
                {focusMetrics.habitability.class}
              </Badge>
            </div>
            <p className="font-mono text-[9px] text-[#8b93b8] mt-2 leading-relaxed">
              Click any planet to inspect it.
            </p>
          </div>
        )}

        {/* LEGEND / HINTS */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Tips</div>
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed">
            Click a planet to focus. Try <span className="text-[#ff4d6d]">Supernova</span> to explode the star
            — planets above 3 M☉ collapse to a black hole. <span className="text-[#00e5ff]">Time Warp</span>
            fast-forwards the whole system through its lifetime.
          </p>
        </div>
      </motion.aside>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Per-belt editor — compact row with enable toggle + sliders
// ────────────────────────────────────────────────────────────────────────────

function BeltEditor({ belt, index, onChange }) {
  return (
    <div className="mb-3 rounded-lg p-2.5" style={{
      background: belt.enabled ? 'rgba(88,245,160,0.05)' : 'rgba(12,17,34,0.3)',
      border: belt.enabled ? '1px solid rgba(88,245,160,0.22)' : '1px solid rgba(139,147,184,0.1)',
    }}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#58f5a0]">
          Belt {index + 1}
        </span>
        <Toggle label="" checked={belt.enabled} onChange={(v) => onChange({ enabled: v })} />
      </div>
      {belt.enabled && (
        <>
          <Slider label="Radius"    value={belt.radius}    min={10}  max={90}   step={0.5} onChange={(v) => onChange({ radius: v })} />
          <Slider label="Thickness" value={belt.thickness} min={1}   max={15}   step={0.25} onChange={(v) => onChange({ thickness: v })} />
          <Slider label="Density"   value={belt.density}   min={100} max={3000} step={50}  onChange={(v) => onChange({ density: v })} precision={0} />
          <Slider label="Spread"    value={belt.spread}    min={0.1} max={2}    step={0.05} onChange={(v) => onChange({ spread: v })} />
        </>
      )}
    </div>
  );
}

function DriftGraph({ drift, tone }) {
  const pct = Math.min(100, drift * 250);
  const color = tone === 'success' ? '#58f5a0'
              : tone === 'amber'   ? '#ffb347'
              : tone === 'violet'  ? '#a855f7'
              :                      '#ff4d6d';
  return (
    <div className="w-full h-1.5 rounded-full bg-[#0c1122] overflow-hidden border border-[#1a2142]">
      <div
        className="h-full transition-all duration-500"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          boxShadow: `0 0 10px ${color}`,
        }}
      />
    </div>
  );
}
