import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { createPlanetScene } from './planetScene';
import { useModuleScene } from '../../hooks/useModuleScene';
import { Slider, Toggle, Pill, Badge, Meter, Stat } from '../../components/UI';
import {
  surfaceGravity, computeDensity, equilibriumTemp, greenhouseWarming, classifyHabitability,
} from '../../physics/engine';
import { updatePlanet, applyPreset } from '../../store/universeSlice';
import { fmt } from '../../utils/helpers';
import { TempVsDistanceChart, GravityVsMassChart } from './AnalyticsCharts';
import {
  StructureIcon, AtmosphereIcon, SurfaceIcon, StarIcon, OrbitIcon, ViewIcon, RingIcon,
  ChaosIcon, TimeIcon, DiceIcon,
} from './PlanetIcons';

// ────────────────────────────────────────────────────────────────────────────
//  Presets — recognizable worlds + a wild card
// ────────────────────────────────────────────────────────────────────────────
const PRESETS = {
  earth:  { radius: 6371, mass: 5.972, o2: 21,   co2: 0.04, albedo: 0.30, water: 71, ice: 10, distanceAU: 1.00, starLum: 1.0,  moonCount: 1, moonOrbit: 3.5, moonSize: 0.25, clouds: 60 },
  mars:   { radius: 3389, mass: 0.642, o2: 0.13, co2: 95,   albedo: 0.25, water: 2,  ice: 30, distanceAU: 1.52, starLum: 1.0,  moonCount: 2, moonOrbit: 2.8, moonSize: 0.10, clouds: 5  },
  venus:  { radius: 6051, mass: 4.867, o2: 0,    co2: 96,   albedo: 0.77, water: 0,  ice: 0,  distanceAU: 0.72, starLum: 1.0,  moonCount: 0, moonOrbit: 3.5, moonSize: 0.20, clouds: 95 },
  exo:    { radius: 9200, mass: 14,    o2: 8,    co2: 3,    albedo: 0.35, water: 40, ice: 5,  distanceAU: 0.85, starLum: 0.7,  moonCount: 3, moonOrbit: 4.2, moonSize: 0.35, clouds: 40 },
  ice:    { radius: 4500, mass: 1.5,   o2: 0,    co2: 0.5,  albedo: 0.85, water: 0,  ice: 95, distanceAU: 4.2,  starLum: 1.0,  moonCount: 1, moonOrbit: 3.0, moonSize: 0.15, clouds: 10 },
  lava:   { radius: 5800, mass: 4.2,   o2: 0,    co2: 8,    albedo: 0.10, water: 0,  ice: 0,  distanceAU: 0.32, starLum: 1.0,  moonCount: 0, moonOrbit: 3.5, moonSize: 0.20, clouds: 20 },
};

// ────────────────────────────────────────────────────────────────────────────
//  Random planet generator
// ────────────────────────────────────────────────────────────────────────────
function randomPlanet() {
  const r = (lo, hi) => lo + Math.random() * (hi - lo);
  return {
    radius: Math.round(r(1500, 18000)),
    mass: r(0.1, 25),
    o2: r(0, 35),
    co2: r(0, 80),
    albedo: r(0.08, 0.85),
    water: Math.round(r(0, 95)),
    ice: Math.round(r(0, 60)),
    distanceAU: r(0.3, 4),
    starLum: r(0.3, 2),
    moonCount: Math.floor(r(0, 5)),
    moonOrbit: r(2.8, 5.5),
    moonSize: r(0.1, 0.4),
    clouds: Math.round(r(0, 90)),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//  Survival assessment — practical "would a human live here?"
// ────────────────────────────────────────────────────────────────────────────
function humanSurvival({ tempK, gravity, o2, co2, atmoPressureProxy }) {
  const reasons = [];
  let level = 'safe'; // safe | risk | death

  const tempC = tempK - 273.15;
  if (tempC < -50 || tempC > 60)  { level = 'death'; reasons.push(`temperature ${tempC.toFixed(0)}°C`); }
  else if (tempC < -10 || tempC > 40) { level = level === 'death' ? 'death' : 'risk'; reasons.push(`temperature ${tempC.toFixed(0)}°C`); }

  if (o2 < 16)        { level = 'death'; reasons.push('oxygen too low'); }
  else if (o2 > 25)   { level = level === 'death' ? 'death' : 'risk'; reasons.push('oxygen toxicity'); }

  if (co2 > 5)        { level = 'death'; reasons.push('CO₂ toxic'); }
  else if (co2 > 1)   { level = level === 'death' ? 'death' : 'risk'; reasons.push('elevated CO₂'); }

  if (gravity < 1)    { level = level === 'death' ? 'death' : 'risk'; reasons.push('bone loss in micro-g'); }
  else if (gravity > 25) { level = 'death'; reasons.push('crushing gravity'); }
  else if (gravity > 15) { level = level === 'death' ? 'death' : 'risk'; reasons.push('extreme weight'); }

  if (atmoPressureProxy < 5) { level = 'death'; reasons.push('vacuum / no atmosphere'); }

  return { level, reasons };
}

// ────────────────────────────────────────────────────────────────────────────
//  Stability classifier — overall scene status
// ────────────────────────────────────────────────────────────────────────────
function classifyStatus({ tempK, gravity, hab, chaos }) {
  if (chaos) return { label: 'Chaos', tone: 'danger' };
  const tempC = tempK - 273.15;
  if (tempC < -200 || tempC > 800 || gravity > 30) return { label: 'Extreme', tone: 'danger' };
  if (hab.score >= 65 && tempC > -20 && tempC < 50 && gravity > 3 && gravity < 15) return { label: 'Stable', tone: 'success' };
  return { label: 'Unstable', tone: 'amber' };
}

// ────────────────────────────────────────────────────────────────────────────
//  Section header with icon
// ────────────────────────────────────────────────────────────────────────────
function GroupHeader({ icon: Icon, title, accent = '#00e5ff' }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span style={{ color: accent }}><Icon /></span>
      <span className="font-display text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>
        {title}
      </span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
//  Main module component
// ────────────────────────────────────────────────────────────────────────────
export default function PlanetModule() {
  const planet = useSelector((s) => s.universe.planet);
  const paused = useSelector((s) => s.universe.paused);
  const dispatch = useDispatch();
  const hostRef = useRef(null);

  useModuleScene(hostRef, createPlanetScene, planet, paused, []);

  // ── Physics calculations (memoizable but cheap so left inline) ──
  const gravity = surfaceGravity(planet.mass, planet.radius);
  const density = computeDensity(planet.mass, planet.radius);
  const Teq     = equilibriumTemp(planet.distanceAU, planet.starLum, planet.albedo);
  const warming = greenhouseWarming(planet.co2, planet.water > 5 ? 1 + planet.water / 200 : 1);
  const Tsurf   = Teq + warming;
  const hab     = classifyHabitability({ tempK: Tsurf, gravity, waterPct: planet.water, o2Pct: planet.o2, co2Pct: planet.co2 });
  const survival = humanSurvival({
    tempK: Tsurf, gravity, o2: planet.o2, co2: planet.co2,
    atmoPressureProxy: planet.o2 + planet.co2,
  });
  const status = classifyStatus({ tempK: Tsurf, gravity, hab, chaos: planet.chaos });

  const u = (patch) => dispatch(updatePlanet(patch));
  const updateRing = (patch) => u({ rings: { ...planet.rings, ...patch } });

  return (
    <div className="grid grid-cols-[290px_1fr_300px] gap-3 h-full min-h-0">
      {/* ════════════════ LEFT — controls ════════════════ */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#00e5ff] mb-4 neon-text">PLANET ENGINEERING</div>

        {/* PRESETS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(PRESETS).map(([k, v]) => (
              <Pill key={k} onClick={() => dispatch(applyPreset({ module: 'planet', data: v }))}>{k}</Pill>
            ))}
          </div>
          <button
            onClick={() => dispatch(applyPreset({ module: 'planet', data: randomPlanet() }))}
            className="btn w-full mt-2 flex items-center justify-center gap-2"
          >
            <DiceIcon /> Generate Random
          </button>
        </div>

        {/* STRUCTURE */}
        <GroupHeader icon={StructureIcon} title="Structure" accent="#00e5ff" />
        <Slider label="Radius" value={planet.radius} min={500} max={25000} step={10} onChange={(v) => u({ radius: v })} unit=" km" precision={0} />
        <Slider label="Mass"   value={planet.mass}   min={0.01} max={30}   step={0.01} onChange={(v) => u({ mass: v })} unit=" ×10²⁴kg" />

        <div className="my-4 h-px bg-[#1a2142]" />

        {/* ATMOSPHERE */}
        <GroupHeader icon={AtmosphereIcon} title="Atmosphere" accent="#a855f7" />
        <Slider label="O₂"      value={planet.o2}     min={0} max={100} step={0.1}  onChange={(v) => u({ o2: v })} unit=" %" />
        <Slider label="CO₂"     value={planet.co2}    min={0} max={100} step={0.01} onChange={(v) => u({ co2: v })} unit=" %" />
        <Slider label="Albedo"  value={planet.albedo} min={0} max={1}   step={0.01} onChange={(v) => u({ albedo: v })} />
        <Slider label="Clouds"  value={planet.clouds} min={0} max={100} step={1}    onChange={(v) => u({ clouds: v })} unit=" %" precision={0} />

        <div className="my-4 h-px bg-[#1a2142]" />

        {/* SURFACE */}
        <GroupHeader icon={SurfaceIcon} title="Surface" accent="#58f5a0" />
        <Slider label="Water" value={planet.water} min={0} max={100} step={1} onChange={(v) => u({ water: v })} unit=" %" precision={0} />
        <Slider label="Ice"   value={planet.ice}   min={0} max={100} step={1} onChange={(v) => u({ ice: v })} unit=" %" precision={0} />

        <div className="my-4 h-px bg-[#1a2142]" />

        {/* STELLAR */}
        <GroupHeader icon={StarIcon} title="Stellar" accent="#ffb347" />
        <Slider label="Distance"        value={planet.distanceAU} min={0.1}  max={10} step={0.01} onChange={(v) => u({ distanceAU: v })} unit=" AU" />
        <Slider label="Star Luminosity" value={planet.starLum}    min={0.01} max={10} step={0.01} onChange={(v) => u({ starLum: v })} unit=" L☉" />

        <div className="my-4 h-px bg-[#1a2142]" />

        {/* ORBIT — moons */}
        <GroupHeader icon={OrbitIcon} title="Moons" accent="#00e5ff" />
        <Slider label="Count" value={planet.moonCount} min={0} max={8}   step={1}    onChange={(v) => u({ moonCount: v })} precision={0} />
        <Slider label="Size"  value={planet.moonSize}  min={0.05} max={0.6} step={0.01} onChange={(v) => u({ moonSize: v })} />
        <Slider label="Orbit" value={planet.moonOrbit} min={2.5} max={7}  step={0.05} onChange={(v) => u({ moonOrbit: v })} />

        <div className="my-4 h-px bg-[#1a2142]" />

        {/* RINGS */}
        <GroupHeader icon={RingIcon} title="Rings" accent="#a855f7" />
        <Toggle label="Enable" checked={planet.rings.enabled} onChange={(v) => updateRing({ enabled: v })} />
        {planet.rings.enabled && (
          <>
            <Slider label="Radius"    value={planet.rings.radius}    min={2.5} max={6}    step={0.05} onChange={(v) => updateRing({ radius: v })} />
            <Slider label="Thickness" value={planet.rings.thickness} min={0.1} max={2.5}  step={0.05} onChange={(v) => updateRing({ thickness: v })} />
            <Slider label="Density"   value={planet.rings.density}   min={100} max={5000} step={50}   onChange={(v) => updateRing({ density: v })} precision={0} />
          </>
        )}

        <div className="my-4 h-px bg-[#1a2142]" />

        {/* VIEW + CHAOS + TIME */}
        <GroupHeader icon={ViewIcon} title="View" accent="#00e5ff" />
        <Toggle label="Surface View"  checked={planet.surfaceView} onChange={(v) => u({ surfaceView: v })} />
        <Toggle label="Auto-Rotate"   checked={planet.autoRotate}  onChange={(v) => u({ autoRotate: v })} />
        <Toggle label="City Lights"   checked={planet.cityLights ?? true} onChange={(v) => u({ cityLights: v })} />
        <Slider label="Axis Tilt"     value={planet.axisTilt ?? 23.5} min={0} max={90} step={0.5} onChange={(v) => u({ axisTilt: v })} unit="°" precision={1} />
        <Slider label="Terrain Height" value={planet.terrainHeight ?? 1.0} min={0} max={2.2} step={0.05} onChange={(v) => u({ terrainHeight: v })} unit="×" />

        <div className="mt-4">
          <GroupHeader icon={ChaosIcon} title="Chaos Mode" accent="#ff4d6d" />
          <Toggle label="Enable Chaos" checked={planet.chaos} onChange={(v) => u({ chaos: v })} />
          {planet.chaos && (
            <p className="font-mono text-[10px] text-[#ff4d6d] leading-relaxed">
              Visuals destabilize: atmosphere flickers, orbits jitter, time wobbles.
            </p>
          )}
        </div>

        <div className="my-4 h-px bg-[#1a2142]" />

        <GroupHeader icon={TimeIcon} title="Time" accent="#8b93b8" />
        <Slider label="Sim Speed" value={planet.timeScale} min={0} max={5} step={0.05} onChange={(v) => u({ timeScale: v })} unit="×" />
      </motion.aside>

      {/* ════════════════ CENTER — viewport ════════════════ */}
      <div className="canvas-host" ref={hostRef} />

      {/* ════════════════ RIGHT — analytics ════════════════ */}
      <motion.aside
        initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs mb-4 neon-text" style={{ color: status.tone === 'success' ? '#58f5a0' : status.tone === 'amber' ? '#ffb347' : '#ff4d6d' }}>
          ANALYTICS
        </div>

        {/* SYSTEM STATUS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">System Status</div>
          <div className="flex items-center justify-between gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <div className="flex-1 h-1 rounded-full" style={{
              background: status.tone === 'success' ? '#58f5a0' : status.tone === 'amber' ? '#ffb347' : '#ff4d6d',
              boxShadow: `0 0 10px ${status.tone === 'success' ? '#58f5a0' : status.tone === 'amber' ? '#ffb347' : '#ff4d6d'}`,
            }} />
          </div>
        </div>

        {/* PHYSICS DERIVED */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Physics Derived</div>
          <Stat label="Gravity"   value={`${fmt(gravity)} m/s²`} />
          <Stat label="Density"   value={`${fmt(density, 0)} kg/m³`} />
          <Stat label="Eq Temp"   value={`${fmt(Teq)} K`} tone="amber" />
          <Stat label="Greenhouse" value={`+${fmt(warming)} K`} tone="violet" />
          <Stat label="Surface T" value={`${fmt(Tsurf - 273.15)} °C`} tone={Tsurf > 200 && Tsurf < 350 ? 'success' : 'danger'} />
        </div>

        {/* MINI CHARTS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Sensitivity</div>
          <TempVsDistanceChart planet={planet} />
          <GravityVsMassChart planet={planet} />
        </div>

        {/* HABITABILITY */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Habitability</div>
          <div className="flex items-center justify-between mb-2">
            <Badge tone={hab.class === 'COMPLEX LIFE' ? 'success' : hab.class === 'MICROBIAL' ? 'amber' : 'danger'}>
              {hab.class}
            </Badge>
            <span className="font-mono text-xs text-[#00e5ff]">{hab.score}/100</span>
          </div>
          <Meter value={hab.score} color={hab.score > 70 ? '#58f5a0' : hab.score > 40 ? '#ffb347' : '#ff4d6d'} />
          {hab.reasons.length > 0 && (
            <div className="mt-2 font-mono text-[10px] text-[#8b93b8] leading-relaxed">
              {hab.reasons.map((r) => <div key={r}>· {r}</div>)}
            </div>
          )}
        </div>

        {/* HUMAN SURVIVAL */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Human Survival</div>
          <Badge tone={survival.level === 'safe' ? 'success' : survival.level === 'risk' ? 'amber' : 'danger'}>
            {survival.level === 'safe' ? 'SAFE' : survival.level === 'risk' ? 'AT RISK' : 'INSTANT DEATH'}
          </Badge>
          {survival.reasons.length > 0 && (
            <div className="mt-2 font-mono text-[10px] text-[#8b93b8] leading-relaxed">
              {survival.reasons.map((r) => <div key={r}>· {r}</div>)}
            </div>
          )}
          {survival.level === 'safe' && (
            <div className="mt-2 font-mono text-[10px] text-[#58f5a0] leading-relaxed">
              · breathable air<br />· tolerable temperature<br />· liveable gravity
            </div>
          )}
        </div>

        {/* OBSERVATIONS — narrative */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Observations</div>
          <div className="font-mono text-[10px] text-[#a8b1d4] leading-relaxed space-y-1">
            {Tsurf > 700 && <p>Surface molten — runaway greenhouse.</p>}
            {Tsurf < 180 && <p>Frozen solid — no liquid solvents.</p>}
            {planet.co2 > 70 && <p>CO₂ dominated atmosphere — Venus-like.</p>}
            {gravity > 25 && <p>Gravity would crush biology.</p>}
            {gravity < 2 && <p>Too weak to retain atmosphere long-term.</p>}
            {hab.class === 'COMPLEX LIFE' && <p>Conditions support an Earth-analog biosphere.</p>}
            {planet.rings.enabled && <p>Ring system stable at current density.</p>}
            {planet.moonCount >= 4 && <p>Multi-moon resonances likely chaotic.</p>}
          </div>
        </div>
      </motion.aside>
    </div>
  );
}
