import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { createQuantumScene } from './quantumScene';
import { useModuleScene } from '../../hooks/useModuleScene';
import { Slider, Badge, Stat, Toggle, Pill } from '../../components/UI';
import { updateQuantum } from '../../store/universeSlice';
import { fmt } from '../../utils/helpers';
import { explainQuantum, INTERPRETATIONS } from './quantumPhysics';

const RENDER_MODES = [
  { key: 'wave',     label: 'Wave'     },
  { key: 'particle', label: 'Particle' },
  { key: 'cloud',    label: 'Cloud'    },
];

const INTERPRETATION_OPTIONS = [
  { key: 'copenhagen', label: 'Copenhagen'  },
  { key: 'manyworlds', label: 'Many Worlds' },
  { key: 'pilot',      label: 'Pilot Wave'  },
];

export default function QuantumModule() {
  const quantum = useSelector((s) => s.universe.quantum);
  const paused = useSelector((s) => s.universe.paused);
  const dispatch = useDispatch();
  const hostRef = useRef(null);
  const handleRef = useRef(null);
  const histCanvasRef = useRef(null);
  const [totalHits, setTotalHits] = useState(0);

  const factory = (ctx) => {
    const h = createQuantumScene(ctx);
    handleRef.current = h;
    return h;
  };
  useModuleScene(hostRef, factory, quantum, paused, []);

  // Histogram drawing
  useEffect(() => {
    const id = setInterval(() => {
      if (!handleRef.current) return;
      const hist = handleRef.current.getHistogram();
      const hits = handleRef.current.getTotalHits();
      setTotalHits(hits);
      const c = histCanvasRef.current;
      if (!c || hist.length === 0) return;
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      ctx.clearRect(0, 0, w, h);
      const maxV = Math.max(...hist, 1);
      const barW = w / hist.length;
      const fillColor = quantum.observer ? '#ff2dd1'
                      : quantum.interpretation === 'manyworlds' ? '#c478ff'
                      : '#00e5ff';
      for (let i = 0; i < hist.length; i++) {
        const v = hist[i] / maxV;
        const hh = v * (h - 4);
        const x = i * barW;
        const g = ctx.createLinearGradient(0, h - hh, 0, h);
        g.addColorStop(0, fillColor);
        g.addColorStop(1, fillColor + '22');
        ctx.fillStyle = g;
        ctx.fillRect(x, h - hh, barW - 0.5, hh);
      }
    }, 200);
    return () => clearInterval(id);
  }, [quantum.observer, quantum.interpretation]);

  const u = (patch) => dispatch(updateQuantum(patch));
  const clearScreen = () => handleRef.current?.clearScreen();

  const insights = explainQuantum({ params: quantum, totalHits });
  const interpMeta = INTERPRETATIONS[quantum.interpretation] || INTERPRETATIONS.copenhagen;

  return (
    <div className="grid grid-cols-[290px_1fr_300px] gap-3 h-full min-h-0">
      {/* ════════════════ LEFT — controls ════════════════ */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#00e5ff] mb-4 neon-text">QUANTUM SANDBOX</div>

        {/* INTERPRETATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#a855f7] mb-2">Interpretation</div>
          <div className="flex flex-wrap gap-1.5">
            {INTERPRETATION_OPTIONS.map((opt) => (
              <Pill
                key={opt.key}
                active={quantum.interpretation === opt.key}
                onClick={() => u({ interpretation: opt.key })}
              >
                {opt.label}
              </Pill>
            ))}
          </div>
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed mt-2">
            {interpMeta.summary}
          </p>
        </div>

        {/* RENDER MODE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Render Mode</div>
          <div className="flex flex-wrap gap-1.5">
            {RENDER_MODES.map((opt) => (
              <Pill
                key={opt.key}
                active={quantum.renderMode === opt.key}
                onClick={() => u({ renderMode: opt.key })}
              >
                {opt.label}
              </Pill>
            ))}
          </div>
        </div>

        {/* APPARATUS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ffb347] mb-2">Apparatus</div>
          <Slider label="Slit Count"      value={quantum.slitCount}  min={1}    max={5}    step={1}    onChange={(v) => u({ slitCount: v })} precision={0} />
          <Slider label="Slit Separation" value={quantum.slitSep}    min={0.2}  max={1.5}  step={0.01} onChange={(v) => u({ slitSep: v })} />
          <Slider label="Slit Width"      value={quantum.slitWidth}  min={0.1}  max={0.8}  step={0.02} onChange={(v) => u({ slitWidth: v })} />
          <Slider label="Wavelength"      value={quantum.wavelength} min={0.02} max={1}    step={0.01} onChange={(v) => u({ wavelength: v })} unit=" λ" />
          <Slider label="Emission Rate"   value={quantum.particles}  min={50}   max={2000} step={50}   onChange={(v) => u({ particles: v })} precision={0} />
        </div>

        {/* OBSERVER */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff2dd1] mb-2">Observer</div>
          <Toggle label="Detector On"        checked={quantum.observer}      onChange={(v) => u({ observer: v })} />
          <Toggle label="Delayed Choice"     checked={quantum.delayedChoice} onChange={(v) => u({ delayedChoice: v })} />
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed mt-1">
            {quantum.observer
              ? 'Detector ON — wavefunction collapsed.'
              : 'No detection — wavefunction interferes with itself.'}
          </p>
        </div>

        {/* QUANTUM BEHAVIORS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#58f5a0] mb-2">Quantum Behavior</div>
          <Toggle label="Superposition"       checked={quantum.superposition} onChange={(v) => u({ superposition: v })} />
          <Toggle label="Entanglement"        checked={quantum.entanglement}  onChange={(v) => u({ entanglement: v })} />
          {quantum.entanglement && (
            <Slider label="Pair Distance" value={quantum.entangleDist} min={0} max={1} step={0.02} onChange={(v) => u({ entangleDist: v })} />
          )}
          <Toggle label="Tunneling"           checked={quantum.tunneling}     onChange={(v) => u({ tunneling: v })} />
          {quantum.tunneling && (
            <Slider label="Barrier Strength" value={quantum.tunnelBarrier} min={0} max={1} step={0.02} onChange={(v) => u({ tunnelBarrier: v })} />
          )}
          <Toggle label="Vacuum Fluctuations" checked={quantum.fluctuations}  onChange={(v) => u({ fluctuations: v })} />
        </div>

        {/* UNCERTAINTY */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#c478ff] mb-2">Uncertainty</div>
          <Slider
            label="Position ↔ Momentum"
            value={quantum.uncertainty}
            min={0} max={1} step={0.02}
            onChange={(v) => u({ uncertainty: v })}
          />
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed mt-1">
            {quantum.uncertainty < 0.3 ? 'Position precise; momentum spread high.' :
             quantum.uncertainty > 0.7 ? 'Momentum precise; position blurred.' :
                                         'Balanced spread.'}
          </p>
        </div>

        {/* DISPLAY */}
        <div className="mb-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Display</div>
          <Toggle label="Show Wavefunction" checked={quantum.showWavefunction} onChange={(v) => u({ showWavefunction: v })} />
          <button className="btn w-full mt-2" onClick={clearScreen}>CLEAR SCREEN</button>
        </div>
      </motion.aside>

      {/* ════════════════ CENTER — viewport ════════════════ */}
      <div className="canvas-host" ref={hostRef} />

      {/* ════════════════ RIGHT — analytics ════════════════ */}
      <motion.aside
        initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#ff2dd1] mb-4 neon-text">DETECTOR</div>

        {/* STATE BADGE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">State</div>
          <Badge tone={quantum.observer ? 'magenta' : 'cyan'}>
            {quantum.observer ? 'MEASURED — PARTICLE' : 'UNMEASURED — WAVE'}
          </Badge>
        </div>

        {/* HISTOGRAM */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Hit Distribution</div>
          <canvas
            ref={histCanvasRef}
            width={240}
            height={100}
            className="block w-full rounded border border-[#1a2142]"
            style={{ background: '#050812' }}
          />
        </div>

        {/* COUNTS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Counts</div>
          <Stat label="Total Hits"   value={totalHits} />
          <Stat label="Pattern"      value={
              quantum.observer ? 'TWO BANDS' :
              quantum.slitCount === 1 ? 'DIFFRACTION' :
              'INTERFERENCE'
            }
            tone={quantum.observer ? 'magenta' : 'cyan'} />
          <Stat label="Slits"        value={quantum.slitCount} />
          <Stat label="λ"            value={fmt(quantum.wavelength)} />
          <Stat label="Slit Sep"     value={fmt(quantum.slitSep)} />
          <Stat label="Mode"         value={quantum.renderMode.toUpperCase()} tone="cyan" />
        </div>

        {/* SMART EXPLANATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Explain</div>
          <div className="space-y-2">
            {insights.map((insight, i) => {
              const kindColor =
                insight.kind === 'effect'     ? '#ff2dd1' :
                insight.kind === 'phenomenon' ? '#00e5ff' :
                                                '#c478ff';
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

        {/* ABOUT */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">About</div>
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed">
            Switch <span className="text-[#00e5ff]">Render Mode</span> to see the same physics as wave, particle, or probability cloud.
            Try <span className="text-[#58f5a0]">Tunneling</span> with low barrier strength, or <span className="text-[#c478ff]">Entanglement</span> with Delayed Choice.
          </p>
        </div>
      </motion.aside>
    </div>
  );
}
