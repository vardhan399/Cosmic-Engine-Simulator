import React from 'react';
import { equilibriumTemp, surfaceGravity, greenhouseWarming } from '../../physics/engine';

/**
 * MiniChart — small SVG line chart that plots a function across a range and
 * marks the current value. Used for in-panel "what if" intuition without
 * leaving the planet view.
 *
 * Props:
 *   compute: (x: number) => number    function being plotted
 *   xRange:  [min, max]
 *   yRange:  [min, max]                used for y-axis normalization
 *   currentX:                          the planet's actual current value
 *   xLabel, yLabel
 *   accent:                            stroke color
 */
function MiniChart({ compute, xRange, yRange, currentX, xLabel, yLabel, accent = '#00e5ff', formatY = (v) => v.toFixed(1) }) {
  const W = 240, H = 90, P = 14;
  const [x0, x1] = xRange;
  const [y0, y1] = yRange;
  const N = 60;

  // Build path
  const points = [];
  for (let i = 0; i <= N; i++) {
    const x = x0 + (i / N) * (x1 - x0);
    const y = compute(x);
    points.push([x, y]);
  }

  const sx = (x) => P + ((x - x0) / (x1 - x0)) * (W - P * 2);
  const sy = (y) => H - P - Math.max(0, Math.min(1, (y - y0) / (y1 - y0))) * (H - P * 2);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p[0]).toFixed(1)} ${sy(p[1]).toFixed(1)}`).join(' ');

  const cy = compute(currentX);

  return (
    <div className="mb-3">
      <div className="flex justify-between items-baseline mb-1">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#8b93b8]">{yLabel} vs {xLabel}</span>
        <span className="font-mono text-[10px]" style={{ color: accent }}>{formatY(cy)}</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ background: '#050812', borderRadius: 4 }}>
        {/* gridlines */}
        {[0.25, 0.5, 0.75].map((t) => (
          <line
            key={t}
            x1={P} x2={W - P}
            y1={P + t * (H - P * 2)} y2={P + t * (H - P * 2)}
            stroke="#1a2142" strokeWidth="0.5" strokeDasharray="2 3"
          />
        ))}

        {/* area fill */}
        <path
          d={`${path} L ${(W - P).toFixed(1)} ${(H - P).toFixed(1)} L ${P} ${(H - P).toFixed(1)} Z`}
          fill={accent}
          fillOpacity="0.08"
        />

        {/* line */}
        <path d={path} stroke={accent} strokeWidth="1.4" fill="none" strokeLinejoin="round" />

        {/* current marker */}
        <line x1={sx(currentX)} x2={sx(currentX)} y1={P} y2={H - P} stroke={accent} strokeOpacity="0.3" strokeDasharray="2 2" />
        <circle cx={sx(currentX)} cy={sy(cy)} r="3" fill="#fff" stroke={accent} strokeWidth="1.5" />
      </svg>
    </div>
  );
}

/** Temperature (°C) plotted across distance (AU), holding star luminosity fixed */
export function TempVsDistanceChart({ planet }) {
  const compute = (dAU) => {
    const Teq = equilibriumTemp(dAU, planet.starLum, planet.albedo);
    const warm = greenhouseWarming(planet.co2, planet.water > 5 ? 1 + planet.water / 200 : 1);
    return (Teq + warm) - 273.15; // °C
  };
  return (
    <MiniChart
      compute={compute}
      xRange={[0.1, 5]}
      yRange={[-180, 500]}
      currentX={planet.distanceAU}
      xLabel="distance"
      yLabel="surface T (°C)"
      accent="#ffb347"
      formatY={(v) => `${v.toFixed(0)}°C`}
    />
  );
}

/** Surface gravity (m/s²) plotted across mass (×10²⁴ kg), holding radius fixed */
export function GravityVsMassChart({ planet }) {
  const compute = (m) => surfaceGravity(m, planet.radius);
  return (
    <MiniChart
      compute={compute}
      xRange={[0.05, 30]}
      yRange={[0, 50]}
      currentX={planet.mass}
      xLabel="mass"
      yLabel="gravity (m/s²)"
      accent="#00e5ff"
      formatY={(v) => `${v.toFixed(1)} m/s²`}
    />
  );
}
