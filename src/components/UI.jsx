import React from 'react';

export function Slider({ label, value, min, max, step = 0.01, onChange, unit = '', precision = 2 }) {
  const display = typeof value === 'number' ? value.toFixed(precision) : value;
  return (
    <label className="block mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-[10px] uppercase tracking-widest text-[#8b93b8]">{label}</span>
        <span className="font-mono text-xs text-[#00e5ff]">{display}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between mb-3 cursor-pointer select-none">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[#8b93b8]">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className="relative w-10 h-5 rounded-full transition-all"
        style={{
          background: checked ? 'linear-gradient(90deg,#00e5ff,#a855f7)' : 'rgba(120,140,200,0.2)',
          boxShadow: checked ? '0 0 12px rgba(0,229,255,0.6)' : 'none',
        }}
      >
        <span
          className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          style={{ left: checked ? '22px' : '2px' }}
        />
      </button>
    </label>
  );
}

export function Pill({ active, onClick, children }) {
  return (
    <button className={`pill ${active ? 'active' : ''}`} onClick={onClick}>{children}</button>
  );
}

export function Section({ title, children }) {
  return (
    <div className="mb-4">
      <div className="font-display text-[10px] text-[#00e5ff] mb-2 opacity-80 tracking-[0.2em]">{title}</div>
      {children}
    </div>
  );
}

export function Badge({ tone = 'cyan', children }) {
  const colors = {
    cyan: ['#00e5ff', 'rgba(0,229,255,0.12)'],
    magenta: ['#ff2dd1', 'rgba(255,45,209,0.12)'],
    violet: ['#a855f7', 'rgba(168,85,247,0.12)'],
    amber: ['#ffb347', 'rgba(255,179,71,0.12)'],
    danger: ['#ff4d6d', 'rgba(255,77,109,0.12)'],
    success: ['#58f5a0', 'rgba(88,245,160,0.12)'],
  };
  const [fg, bg] = colors[tone] || colors.cyan;
  return (
    <span
      className="inline-block font-mono text-[10px] px-2 py-0.5 rounded border uppercase tracking-widest"
      style={{ color: fg, background: bg, borderColor: fg + '66' }}
    >
      {children}
    </span>
  );
}

export function Meter({ value, max = 100, color = '#00e5ff' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="w-full h-1.5 rounded-full bg-[#0c1122] overflow-hidden border border-[#1a2142]">
      <div
        className="h-full transition-all duration-300"
        style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, #a855f7)`,
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
}

export function Stat({ label, value, tone = 'cyan' }) {
  const c = { cyan: '#00e5ff', magenta: '#ff2dd1', violet: '#a855f7', amber: '#ffb347', success: '#58f5a0', danger: '#ff4d6d' }[tone] || '#00e5ff';
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-[#1a2142]/50">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[#8b93b8]">{label}</span>
      <span className="font-mono text-xs" style={{ color: c }}>{value}</span>
    </div>
  );
}
