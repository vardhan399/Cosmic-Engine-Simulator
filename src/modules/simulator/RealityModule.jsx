import React, { useRef, useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { createRealityScene } from './realityScene';
import { useModuleScene } from '../../hooks/useModuleScene';
import { Slider, Badge, Stat, Toggle, Pill } from '../../components/UI';
import { updateReality, setPhilosophy } from '../../store/universeSlice';
import { fmt, fmtExp } from '../../utils/helpers';
import {
  REALITY_PRESETS,
  explainDivergence,
  computeRealitySignature,
  predictFate,
  explainChange,
  serializeDNA,
  parseDNA,
  inspectBody,
} from './realityPhysics';

const PHILOSOPHY_META = {
  deterministic: {
    label: 'Deterministic',
    color: '#58f5a0',
    desc: 'Pure Newtonian mechanics. Identical initial conditions yield identical futures.',
  },
  probabilistic: {
    label: 'Probabilistic',
    color: '#00e5ff',
    desc: 'Gaussian noise on velocities each frame. Twin systems diverge slowly.',
  },
  chaos: {
    label: 'Chaos',
    color: '#ff4d6d',
    desc: 'Nonlinear dynamics. 1/r^(2+ε) force + time-varying G → exponential divergence.',
  },
};

export default function RealityModule() {
  const reality = useSelector((s) => s.universe.reality);
  const philosophy = useSelector((s) => s.universe.philosophy);
  const paused = useSelector((s) => s.universe.paused);
  const dispatch = useDispatch();
  const hostRef = useRef(null);
  const handleRef = useRef(null);
  const graphRef = useRef(null);
  const history = useRef([]);
  const [divergence, setDivergence] = useState(0);
  const [analytics, setAnalytics] = useState({
    energy: 0, prevEnergy: 0, closestApproach: Infinity, events: [],
    divHistory: [], energyHistory: [], primaryBodies: [], collisions: 0, escapedCount: 0,
  });

  // Cause → Effect toast state (shows transient message when a slider changes)
  const [toast, setToast] = useState(null);
  const prevParams = useRef({ ...reality, philosophy });
  const toastTimer = useRef(null);

  // DNA state
  const [dnaInput, setDnaInput] = useState('');
  const [dnaCopied, setDnaCopied] = useState(false);

  const sceneParams = { ...reality, philosophy };

  const factory = (ctx) => {
    const h = createRealityScene(ctx);
    handleRef.current = h;
    h.onPick && h.onPick((id) => dispatch(updateReality({ inspectBodyId: id })));
    return h;
  };
  useModuleScene(hostRef, factory, sceneParams, paused, []);

  // Analytics polling + divergence graph
  useEffect(() => {
    const id = setInterval(() => {
      if (!handleRef.current) return;
      const d = handleRef.current.getDivergence();
      setDivergence(d);
      history.current.push(d);
      if (history.current.length > 150) history.current.shift();

      if (handleRef.current.getAnalytics) {
        setAnalytics(handleRef.current.getAnalytics());
      }

      // Draw divergence graph
      const c = graphRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      const w = c.width, h = c.height;
      ctx.clearRect(0, 0, w, h);
      if (history.current.length < 2) return;
      const maxV = Math.max(...history.current, 1e-3);
      const curColor = d < 0.2 ? '#58f5a0' : d < 1 ? '#ffb347' : '#ff4d6d';
      ctx.strokeStyle = curColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      history.current.forEach((v, i) => {
        const x = (i / (history.current.length - 1)) * w;
        const y = h - (v / maxV) * (h - 4) - 2;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, curColor + '55');
      g.addColorStop(1, curColor + '00');
      ctx.fillStyle = g;
      ctx.fill();
    }, 150);
    return () => clearInterval(id);
  }, []);

  // Cause → Effect watcher — fires when tracked params change
  useEffect(() => {
    const current = { ...reality, philosophy };
    const tracked = ['G', 'gravityExponent', 'dissipation', 'chaosIntensity', 'timeScale', 'timeDirection', 'bodies'];
    for (const key of tracked) {
      if (prevParams.current[key] !== current[key]) {
        const msg = explainChange(key, prevParams.current[key], current[key]);
        if (msg) {
          setToast(msg);
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 3200);
        }
        break; // only one at a time
      }
    }
    prevParams.current = current;
  }, [reality, philosophy]);

  const u = (patch) => dispatch(updateReality(patch));
  const phMeta = PHILOSOPHY_META[philosophy];
  const explanation = explainDivergence({ divergence, params: reality, philosophy });
  const divTone = explanation.tone;

  // ── Reality signature ──
  const signature = computeRealitySignature({
    divergence,
    energy: analytics.energy,
    prevEnergy: analytics.prevEnergy,
    collisions: analytics.collisions,
    bodyCount: analytics.primaryBodies.filter((b) => b.alive).length,
    params: reality,
    philosophy,
    escapedCount: analytics.escapedCount,
  });

  // ── Fate prediction (refresh at lower cadence) ──
  const [fate, setFate] = useState([]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!handleRef.current?.getAnalytics) return;
      const a = handleRef.current.getAnalytics();
      const lines = predictFate({
        divHistory: a.divHistory,
        energyHistory: a.energyHistory,
        closestApproach: a.closestApproach,
        params: reality,
        philosophy,
        bodyCount: a.primaryBodies.filter((b) => b.alive).length,
      });
      setFate(lines);
    }, 2000);
    return () => clearInterval(id);
  }, [reality, philosophy]);

  // ── Inspection body metrics ──
  const inspectedBody = reality.inspectBodyId !== null
    ? analytics.primaryBodies[reality.inspectBodyId]
    : null;
  const inspectMetrics = (inspectedBody && inspectedBody.alive)
    ? inspectBody(inspectedBody, analytics.primaryBodies, reality.G)
    : null;

  // ── DNA handlers ──
  const dnaString = serializeDNA(reality, philosophy);
  const handleCopyDNA = async () => {
    try {
      await navigator.clipboard.writeText(dnaString);
      setDnaCopied(true);
      setTimeout(() => setDnaCopied(false), 1500);
    } catch (e) {
      // ignore
    }
  };
  const handleLoadDNA = () => {
    const parsed = parseDNA(dnaInput);
    if (parsed.philosophy) dispatch(setPhilosophy(parsed.philosophy));
    if (Object.keys(parsed.reality).length) dispatch(updateReality(parsed.reality));
    setDnaInput('');
  };

  return (
    <div className="grid grid-cols-[290px_1fr_300px] gap-3 h-full min-h-0">
      {/* ════════════════ LEFT — controls ════════════════ */}
      <motion.aside
        initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#00e5ff] mb-4 neon-text">PHYSICS ENGINE</div>

        {/* PHILOSOPHY */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#a855f7] mb-2">Philosophy</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {Object.entries(PHILOSOPHY_META).map(([k, v]) => (
              <Pill key={k} active={philosophy === k} onClick={() => dispatch(setPhilosophy(k))}>
                {v.label}
              </Pill>
            ))}
          </div>
          <p className="font-mono text-[10px] leading-relaxed" style={{ color: phMeta.color }}>
            {phMeta.desc}
          </p>
        </div>

        {/* PRESETS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ffb347] mb-2">Scenario</div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {REALITY_PRESETS.map((p) => (
              <Pill key={p.key} active={reality.preset === p.key} onClick={() => u({ preset: p.key })}>
                {p.label}
              </Pill>
            ))}
          </div>
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed">
            {REALITY_PRESETS.find((p) => p.key === reality.preset)?.desc || ''}
          </p>
        </div>

        {/* FUNDAMENTAL CONSTANTS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Fundamental Constants</div>
          <Slider label="Gravitational G"  value={reality.G}  min={0.1} max={3} step={0.05} onChange={(v) => u({ G: v })} />
          <Slider label="Speed of Light c" value={reality.c}  min={0.1} max={3} step={0.05} onChange={(v) => u({ c: v })} />
        </div>

        {/* FORCE MODEL */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#58f5a0] mb-2">Force Model</div>
          <Slider
            label={`Force Law  F ∝ 1/r^${fmt(reality.gravityExponent, 2)}`}
            value={reality.gravityExponent} min={1.0} max={3.5} step={0.05}
            onChange={(v) => u({ gravityExponent: v })}
          />
          <Slider label="Force Delay"  value={reality.forceDelay}  min={0} max={0.5}   step={0.01} onChange={(v) => u({ forceDelay: v })} />
          <Slider label="Dissipation"  value={reality.dissipation} min={0} max={0.05}  step={0.001} onChange={(v) => u({ dissipation: v })} />
          {reality.gravityExponent !== 2 && (
            <p className="font-mono text-[10px] text-[#ffb347] leading-relaxed mt-1">
              Non-Newtonian. Closed orbits not guaranteed (Bertrand's theorem).
            </p>
          )}
        </div>

        {/* TIME SYSTEM */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#c478ff] mb-2">Time System</div>
          <Slider label="Time Scale" value={reality.timeScale} min={0.1} max={5} step={0.05} onChange={(v) => u({ timeScale: v })} unit="×" />
          <div className="flex gap-1.5 mt-2">
            <Pill active={reality.timeDirection === 1}  onClick={() => u({ timeDirection: 1 })}>Forward</Pill>
            <Pill active={reality.timeDirection === -1} onClick={() => u({ timeDirection: -1 })}>Reverse</Pill>
          </div>
        </div>

        {/* INITIAL CONDITIONS */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Initial Conditions</div>
          <Slider label="Bodies" value={reality.bodies} min={2} max={8} step={1} onChange={(v) => u({ bodies: v })} precision={0} />
          <Toggle label="Collisions" checked={reality.collisions} onChange={(v) => u({ collisions: v })} />
        </div>

        {/* CHAOS CONTROL */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff4d6d] mb-2">Chaos Control</div>
          <Slider label="Chaos Intensity" value={reality.chaosIntensity} min={0} max={1} step={0.02} onChange={(v) => u({ chaosIntensity: v })} />
          <Toggle label="Compare Twin Universe" checked={reality.compareUniverses} onChange={(v) => u({ compareUniverses: v, chaos: v })} />
          <Slider label="Multiverse Clones" value={reality.multiverse} min={0} max={4} step={1} onChange={(v) => u({ multiverse: v })} precision={0} />
          <button
            onClick={() => u({ breakTrigger: reality.breakTrigger + 1 })}
            className="btn w-full mt-2"
            style={{
              background: 'linear-gradient(135deg, rgba(255,77,109,0.3), rgba(168,85,247,0.25))',
              borderColor: 'rgba(255,77,109,0.5)',
            }}
          >
            ⚡ DESTABILIZE REALITY
          </button>
        </div>

        {/* VISUALIZATION */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Visualization</div>
          <Toggle label="Prediction Ghost" checked={reality.showPrediction} onChange={(v) => u({ showPrediction: v })} />
          <Toggle label="Stability Heatmap" checked={reality.showHeatmap} onChange={(v) => u({ showHeatmap: v })} />
          <Toggle label="Cinematic Camera" checked={reality.autoCam} onChange={(v) => u({ autoCam: v })} />
        </div>

        {/* DNA */}
        <div className="mb-3">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#a855f7] mb-2">Reality DNA</div>
          <textarea
            readOnly
            value={dnaString}
            className="w-full font-mono text-[9px] p-2 rounded bg-[#0c1122] border border-[#1a2142] text-[#c478ff] resize-none"
            rows={3}
          />
          <div className="flex gap-1.5 mt-2">
            <button onClick={handleCopyDNA} className="btn flex-1">
              {dnaCopied ? '✓ COPIED' : 'COPY'}
            </button>
          </div>
          <textarea
            placeholder="Paste DNA to load…"
            value={dnaInput}
            onChange={(e) => setDnaInput(e.target.value)}
            className="w-full font-mono text-[9px] p-2 mt-2 rounded bg-[#0c1122] border border-[#1a2142] text-[#8b93b8] resize-none"
            rows={2}
          />
          <button onClick={handleLoadDNA} disabled={!dnaInput.trim()} className="btn w-full mt-1.5">
            LOAD DNA
          </button>
        </div>
      </motion.aside>

      {/* ════════════════ CENTER — viewport ════════════════ */}
      <div className="canvas-host relative" ref={hostRef}>
        {/* Cause→Effect toast overlay */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 rounded-lg font-mono text-[11px]"
              style={{
                background: 'rgba(10,15,30,0.85)',
                border: '1px solid rgba(0,229,255,0.35)',
                color: '#00e5ff',
                backdropFilter: 'blur(6px)',
                maxWidth: '380px',
              }}
            >
              <span className="text-[9px] uppercase tracking-[0.2em] text-[#8b93b8] mr-2">Change Impact</span>
              {toast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Latest event notification (top-right) */}
        <AnimatePresence>
          {analytics.events && analytics.events.length > 0 && (
            <motion.div
              key={analytics.events[analytics.events.length - 1].time}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="absolute top-4 right-4 z-10 px-3 py-1.5 rounded font-mono text-[10px]"
              style={{
                background: 'rgba(10,15,30,0.85)',
                border: `1px solid ${
                  analytics.events[analytics.events.length - 1].severity === 'danger' ? 'rgba(255,77,109,0.5)' :
                  analytics.events[analytics.events.length - 1].severity === 'warn' ? 'rgba(255,179,71,0.5)' :
                  'rgba(88,245,160,0.5)'
                }`,
                color: '#e8ecff',
                backdropFilter: 'blur(6px)',
              }}
            >
              <span className="text-[9px] uppercase tracking-[0.2em] mr-2" style={{
                color: analytics.events[analytics.events.length - 1].severity === 'danger' ? '#ff4d6d' :
                       analytics.events[analytics.events.length - 1].severity === 'warn' ? '#ffb347' :
                       '#58f5a0',
              }}>
                ⚠ Event
              </span>
              {analytics.events[analytics.events.length - 1].text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ════════════════ RIGHT — analytics ════════════════ */}
      <motion.aside
        initial={{ x: 20, opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        className="glass p-4 overflow-y-auto scroll-thin"
      >
        <div className="font-display text-xs text-[#ff2dd1] mb-4 neon-text">REALITY ANALYTICS</div>

        {/* REALITY SIGNATURE — identity card at top */}
        <div className="mb-5 p-3 rounded-lg" style={{
          background: 'linear-gradient(135deg, rgba(168,85,247,0.12) 0%, rgba(0,229,255,0.06) 100%)',
          border: '1px solid rgba(168,85,247,0.3)',
        }}>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">Reality Type</div>
          <Badge tone={signature.tone}>{signature.label}</Badge>
        </div>

        {/* DIVERGENCE CARD */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">
            {reality.compareUniverses ? 'Lyapunov Separation' : 'System Status'}
          </div>
          <div className="flex items-center justify-between mb-2">
            <Badge tone={divTone}>
              {divTone === 'success' ? 'STABLE' : divTone === 'amber' ? 'DIVERGING' : 'CHAOTIC'}
            </Badge>
            <span className="font-mono text-xs" style={{
              color: divTone === 'success' ? '#58f5a0' : divTone === 'amber' ? '#ffb347' : '#ff4d6d',
            }}>
              |ΔR| {fmtExp(divergence, 2)}
            </span>
          </div>
          <canvas
            ref={graphRef}
            width={240}
            height={100}
            className="block w-full rounded border border-[#1a2142]"
            style={{ background: '#050812' }}
          />
        </div>

        {/* FATE PROJECTION */}
        {fate.length > 0 && (
          <div className="mb-5">
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#a855f7] mb-2">Future Projection</div>
            <div className="space-y-1.5">
              {fate.map((line, i) => (
                <div
                  key={i}
                  className="pl-2.5 py-0.5 font-mono text-[10px] leading-relaxed text-[#a8b1d4]"
                  style={{ borderLeft: '2px solid #a855f7' }}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EVENT FEED */}
        {analytics.events && analytics.events.length > 0 && (
          <div className="mb-5">
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#ff4d6d] mb-2">Recent Events</div>
            <div className="space-y-1">
              {analytics.events.slice().reverse().map((ev, i) => {
                const color = ev.severity === 'danger' ? '#ff4d6d' :
                              ev.severity === 'warn'   ? '#ffb347' : '#58f5a0';
                return (
                  <div key={i} className="font-mono text-[10px] flex items-start gap-1.5">
                    <span style={{ color }}>●</span>
                    <span className="text-[#a8b1d4]">{ev.text}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* WHY PANEL */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff] mb-2">Why?</div>
          <div className="space-y-2">
            {explanation.lines.map((line, i) => {
              const color = divTone === 'success' ? '#58f5a0' : divTone === 'amber' ? '#ffb347' : '#ff4d6d';
              return (
                <div
                  key={i}
                  className="pl-2.5 py-0.5 font-mono text-[10px] leading-relaxed text-[#a8b1d4]"
                  style={{ borderLeft: `2px solid ${color}` }}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </div>

        {/* INSPECTION PANEL */}
        {inspectMetrics && (
          <div className="mb-5 p-3 rounded-lg" style={{
            background: 'rgba(0,229,255,0.05)',
            border: '1px solid rgba(0,229,255,0.3)',
          }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#00e5ff]">
                Inspect: Body #{reality.inspectBodyId}
              </div>
              <button
                onClick={() => u({ inspectBodyId: null })}
                className="font-mono text-[9px] text-[#8b93b8] hover:text-[#ff4d6d]"
              >
                ×
              </button>
            </div>
            <Stat label="Speed" value={fmt(inspectMetrics.speed)} />
            <Stat label="Radius" value={fmt(inspectMetrics.radius)} />
            <Stat label="Kinetic"   value={fmt(inspectMetrics.kinetic)}   tone="cyan" />
            <Stat label="Potential" value={fmt(inspectMetrics.potential)} tone="violet" />
            <Stat label="Total E"   value={fmt(inspectMetrics.total)}     tone={inspectMetrics.total > 0 ? 'danger' : 'success'} />
            <div className="mt-2">
              <Badge tone={
                inspectMetrics.stability === 'ESCAPING' ? 'danger' :
                inspectMetrics.stability === 'LOOSELY BOUND' ? 'amber' : 'success'
              }>
                {inspectMetrics.stability}
              </Badge>
            </div>
            <p className="font-mono text-[9px] text-[#8b93b8] mt-2 leading-relaxed">
              Click any body to inspect it.
            </p>
          </div>
        )}

        {/* STATE */}
        <div className="mb-5">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">State</div>
          <Stat label="Bodies"     value={analytics.primaryBodies.filter((b) => b.alive).length || reality.bodies} />
          <Stat label="Energy"     value={fmt(analytics.energy, 1)} tone="amber" />
          <Stat label="Collisions" value={analytics.collisions || 0} tone={analytics.collisions > 0 ? 'amber' : 'cyan'} />
          <Stat label="Philosophy" value={phMeta.label.toUpperCase()} tone="violet" />
          <Stat label="G"          value={fmt(reality.G)} />
          <Stat label="Exponent"   value={fmt(reality.gravityExponent, 2)} tone={reality.gravityExponent === 2 ? 'cyan' : 'amber'} />
          <Stat label="Time"       value={`${fmt(reality.timeScale)}× ${reality.timeDirection < 0 ? '◄' : '►'}`} />
          {reality.multiverse > 0 && <Stat label="Clones" value={reality.multiverse} tone="violet" />}
        </div>

        {/* ABOUT */}
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-[#8b93b8] mb-2">About</div>
          <p className="font-mono text-[10px] text-[#8b93b8] leading-relaxed">
            Click any body to inspect it. Try <span className="text-[#ff4d6d]">Destabilize Reality</span> to inject
            random perturbations, or copy the <span className="text-[#a855f7]">DNA</span> to share or replay a configuration.
          </p>
        </div>
      </motion.aside>
    </div>
  );
}
