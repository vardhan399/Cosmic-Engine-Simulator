import React from 'react';

/**
 * ModuleIcons — five tiny SVG visualizations, each conveying its module's character.
 * All animations are pure CSS so they cost nothing on the JS thread; the browser
 * compositor handles them on the GPU.
 *
 * Reusable conventions:
 *   • 80×80 viewBox
 *   • Color is passed via the `accent` prop
 *   • Animations only run while the parent is hovered (CSS `:hover` selector via parent class)
 */

const baseProps = {
  width: 80,
  height: 80,
  viewBox: '0 0 80 80',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
};

// ── PLANET — slow rotation with a moon orbiting ──────────────────────────
export function PlanetIcon({ accent }) {
  return (
    <svg {...baseProps}>
      <defs>
        <radialGradient id="p-grad" cx="0.35" cy="0.35" r="0.7">
          <stop offset="0%" stopColor={accent} stopOpacity="1" />
          <stop offset="60%" stopColor={accent} stopOpacity="0.4" />
          <stop offset="100%" stopColor="#0a1028" stopOpacity="0.9" />
        </radialGradient>
        <clipPath id="p-clip"><circle cx="40" cy="40" r="18" /></clipPath>
      </defs>

      <g style={{ transformOrigin: '40px 40px', animation: 'iconSpin 14s linear infinite' }}>
        <circle cx="40" cy="40" r="18" fill="url(#p-grad)" />
        {/* surface bands */}
        <g clipPath="url(#p-clip)" opacity="0.65">
          <ellipse cx="40" cy="36" rx="16" ry="3" fill={accent} opacity="0.4" />
          <ellipse cx="40" cy="44" rx="16" ry="2" fill={accent} opacity="0.3" />
          <ellipse cx="40" cy="48" rx="14" ry="1.5" fill="#000" opacity="0.4" />
        </g>
      </g>
      <circle cx="40" cy="40" r="18" fill="none" stroke={accent} strokeOpacity="0.5" strokeWidth="0.5" />

      {/* moon on a wider orbit */}
      <g style={{ transformOrigin: '40px 40px', animation: 'iconSpin 6s linear infinite' }}>
        <circle cx="68" cy="40" r="2" fill={accent} />
      </g>

      <style>{`
        @keyframes iconSpin { to { transform: rotate(360deg); } }
      `}</style>
    </svg>
  );
}

// ── SOLAR — orbital motion: star + planets ──────────────────────────────
export function SolarIcon({ accent }) {
  return (
    <svg {...baseProps}>
      <defs>
        <radialGradient id="s-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="50%" stopColor={accent} stopOpacity="0.9" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="40" cy="40" r="6" fill="url(#s-grad)" />
      <circle cx="40" cy="40" r="3.5" fill={accent} />

      {/* orbit rings */}
      <ellipse cx="40" cy="40" rx="16" ry="6" stroke={accent} strokeOpacity="0.25" strokeWidth="0.5" fill="none" />
      <ellipse cx="40" cy="40" rx="28" ry="11" stroke={accent} strokeOpacity="0.15" strokeWidth="0.5" fill="none" />

      {/* inner planet */}
      <g style={{ transformOrigin: '40px 40px', animation: 'iconSpin 4s linear infinite' }}>
        <circle cx="56" cy="40" r="2" fill="#6aa8ff" />
      </g>
      {/* outer planet */}
      <g style={{ transformOrigin: '40px 40px', animation: 'iconSpin 9s linear infinite reverse' }}>
        <circle cx="68" cy="40" r="2.5" fill="#c478ff" />
      </g>

      <style>{`@keyframes iconSpin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}

// ── UNIVERSE — expansion pulse ──────────────────────────────────────────
export function UniverseIcon({ accent }) {
  return (
    <svg {...baseProps}>
      <defs>
        <radialGradient id="u-grad">
          <stop offset="0%" stopColor={accent} stopOpacity="0.8" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="40" cy="40" r="3" fill={accent} />

      {[0, 1, 2].map((i) => (
        <circle
          key={i}
          cx="40"
          cy="40"
          r="6"
          fill="none"
          stroke={accent}
          strokeWidth="0.7"
          opacity="0"
          style={{ transformOrigin: '40px 40px', animation: `iconExpand 2.6s ease-out ${i * 0.85}s infinite` }}
        />
      ))}

      {/* dot constellation */}
      {[
        [22, 30], [60, 28], [55, 60], [22, 55], [40, 18], [40, 62], [62, 44], [18, 42],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill={accent} opacity="0.55" />
      ))}

      <style>{`
        @keyframes iconExpand {
          0%   { transform: scale(0.3); opacity: 0.85; }
          70%  { opacity: 0.4; }
          100% { transform: scale(5); opacity: 0; }
        }
      `}</style>
    </svg>
  );
}

// ── QUANTUM — wave flicker ──────────────────────────────────────────────
export function QuantumIcon({ accent }) {
  // Two interfering sine waves drawn with smooth path; CSS animates the dasharray
  // for a gentle "energy flicker" feel.
  return (
    <svg {...baseProps}>
      <defs>
        <linearGradient id="q-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0" />
          <stop offset="50%" stopColor={accent} stopOpacity="1" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path
        d="M 8 40 C 18 20, 28 60, 40 40 S 62 20, 72 40"
        stroke="url(#q-grad)"
        strokeWidth="1.6"
        fill="none"
        style={{ animation: 'iconFlicker 1.6s ease-in-out infinite' }}
      />
      <path
        d="M 8 40 C 18 60, 28 20, 40 40 S 62 60, 72 40"
        stroke="url(#q-grad)"
        strokeWidth="1.6"
        fill="none"
        opacity="0.6"
        style={{ animation: 'iconFlicker 1.6s ease-in-out 0.3s infinite' }}
      />

      {/* slits */}
      <line x1="40" y1="20" x2="40" y2="32" stroke={accent} strokeOpacity="0.6" strokeWidth="0.8" />
      <line x1="40" y1="48" x2="40" y2="60" stroke={accent} strokeOpacity="0.6" strokeWidth="0.8" />

      {/* particle dots */}
      <circle cx="14" cy="40" r="1.6" fill={accent} style={{ animation: 'iconFlicker 1.2s ease-in-out infinite' }} />
      <circle cx="66" cy="40" r="1.6" fill={accent} style={{ animation: 'iconFlicker 1.4s ease-in-out 0.4s infinite' }} />

      <style>{`
        @keyframes iconFlicker {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
      `}</style>
    </svg>
  );
}

// ── REALITY — chaos jitter (bodies twitch) ──────────────────────────────
export function RealityIcon({ accent }) {
  // Several small bodies that jitter independently via CSS keyframes with
  // different durations and translation offsets.
  const bodies = [
    { cx: 30, cy: 32, r: 2.2, delay: 0,    dur: 1.1 },
    { cx: 50, cy: 28, r: 2.6, delay: 0.2,  dur: 1.4 },
    { cx: 56, cy: 48, r: 2.0, delay: 0.05, dur: 1.0 },
    { cx: 30, cy: 52, r: 2.4, delay: 0.3,  dur: 1.3 },
    { cx: 42, cy: 42, r: 1.8, delay: 0.15, dur: 0.9 },
  ];
  return (
    <svg {...baseProps}>
      {/* faint connecting lattice */}
      <g opacity="0.18" stroke={accent} strokeWidth="0.5">
        <line x1="30" y1="32" x2="50" y2="28" />
        <line x1="50" y1="28" x2="56" y2="48" />
        <line x1="56" y1="48" x2="30" y2="52" />
        <line x1="30" y1="52" x2="30" y2="32" />
        <line x1="42" y1="42" x2="50" y2="28" />
        <line x1="42" y1="42" x2="30" y2="52" />
      </g>

      {bodies.map((b, i) => (
        <g key={i} style={{ animation: `iconJitter${i} ${b.dur}s ease-in-out ${b.delay}s infinite` }}>
          <circle cx={b.cx} cy={b.cy} r={b.r} fill={accent} />
        </g>
      ))}

      <style>{`
        @keyframes iconJitter0 { 0%,100%{transform:translate(0,0)} 25%{transform:translate(1.5px,-1px)} 50%{transform:translate(-1px,2px)} 75%{transform:translate(2px,1.5px)} }
        @keyframes iconJitter1 { 0%,100%{transform:translate(0,0)} 33%{transform:translate(-2px,1.5px)} 66%{transform:translate(1.5px,-1.5px)} }
        @keyframes iconJitter2 { 0%,100%{transform:translate(0,0)} 30%{transform:translate(1.5px,2px)} 70%{transform:translate(-1.5px,-1.5px)} }
        @keyframes iconJitter3 { 0%,100%{transform:translate(0,0)} 40%{transform:translate(-1.5px,-1.5px)} 80%{transform:translate(2px,1px)} }
        @keyframes iconJitter4 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(1px,-2px)} }
      `}</style>
    </svg>
  );
}
