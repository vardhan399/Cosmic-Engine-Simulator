// Universe Lab — Physics Engine
// Real-valued physics formulas for planetary, stellar, and cosmic calculations.
// Separated from UI so it can be unit-tested and reused.

export const G_SI = 6.6743e-11;          // gravitational constant (m^3 kg^-1 s^-2)
export const SIGMA = 5.670374419e-8;     // Stefan-Boltzmann (W m^-2 K^-4)
export const AU = 1.495978707e11;        // 1 AU in meters
export const L_SUN = 3.828e26;           // solar luminosity (W)
export const M_EARTH = 5.972e24;         // kg
export const R_EARTH = 6.371e6;          // m

// Surface gravity from mass (×10^24 kg) and radius (km)
export function surfaceGravity(massE24, radiusKm) {
  const M = massE24 * 1e24;
  const R = radiusKm * 1e3;
  return (G_SI * M) / (R * R);
}

// Mean density from mass and radius (kg/m^3)
export function computeDensity(massE24, radiusKm) {
  const M = massE24 * 1e24;
  const R = radiusKm * 1e3;
  const V = (4 / 3) * Math.PI * R * R * R;
  return M / V;
}

// Equilibrium temperature of an airless body at distance d AU from a star of
// luminosity starLum (in solar units), Bond albedo A.
// T_eq = ( L (1-A) / (16 π σ d^2) )^(1/4)
export function equilibriumTemp(distanceAU, starLum, albedo) {
  const L = starLum * L_SUN;
  const d = distanceAU * AU;
  const T4 = (L * (1 - albedo)) / (16 * Math.PI * SIGMA * d * d);
  return Math.pow(Math.max(T4, 0), 0.25);
}

// Simplified greenhouse warming: CO2 adds a nonlinear forcing offset
// co2Pct is % atmospheric CO2 (Earth ~0.04). Returns warming in Kelvin.
export function greenhouseWarming(co2Pct, h2oFactor = 1) {
  const f = Math.log(1 + Math.max(co2Pct, 1e-6) / 0.04) / Math.log(2);
  return 33 * Math.min(f, 4) * h2oFactor; // Earth baseline ~33K
}

// Classify habitability. Returns { class, score, reasons }
export function classifyHabitability({ tempK, gravity, waterPct, o2Pct, co2Pct }) {
  const reasons = [];
  let score = 0;
  const tempC = tempK - 273.15;

  if (tempC > -20 && tempC < 60) score += 30;
  else if (tempC > -60 && tempC < 120) score += 10;
  else reasons.push('extreme temperature');

  if (gravity > 3 && gravity < 20) score += 20;
  else if (gravity > 1 && gravity < 30) score += 8;
  else reasons.push('gravity too weak or crushing');

  if (waterPct > 20 && waterPct < 95) score += 20;
  else if (waterPct > 5) score += 8;
  else reasons.push('insufficient liquid water');

  if (o2Pct > 15 && o2Pct < 30) score += 20;
  else if (o2Pct > 2) score += 8;
  else reasons.push('oxygen deficient');

  if (co2Pct < 5) score += 10;
  else if (co2Pct < 30) score += 4;
  else reasons.push('toxic CO₂ atmosphere');

  let cls;
  if (score >= 75) cls = 'COMPLEX LIFE';
  else if (score >= 40) cls = 'MICROBIAL';
  else cls = 'NO LIFE';

  return { class: cls, score, reasons };
}

// N-body acceleration with softening. Returns array of {ax, ay, az}.
export function nbodyAccel(bodies, G = 1, softening = 0.1) {
  const N = bodies.length;
  const acc = new Array(N);
  for (let i = 0; i < N; i++) acc[i] = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const dz = bodies[j].z - bodies[i].z;
      const r2 = dx * dx + dy * dy + dz * dz + softening * softening;
      const invR3 = 1 / (r2 * Math.sqrt(r2));
      const fi = G * bodies[j].mass * invR3;
      const fj = G * bodies[i].mass * invR3;
      acc[i].x += fi * dx; acc[i].y += fi * dy; acc[i].z += fi * dz;
      acc[j].x -= fj * dx; acc[j].y -= fj * dy; acc[j].z -= fj * dz;
    }
  }
  return acc;
}

// Leapfrog (kick-drift-kick) integrator — symplectic, energy-conserving.
export function leapfrogStep(bodies, dt, G = 1, softening = 0.1) {
  let a = nbodyAccel(bodies, G, softening);
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].vx += a[i].x * dt * 0.5;
    bodies[i].vy += a[i].y * dt * 0.5;
    bodies[i].vz += a[i].z * dt * 0.5;
    bodies[i].x += bodies[i].vx * dt;
    bodies[i].y += bodies[i].vy * dt;
    bodies[i].z += bodies[i].vz * dt;
  }
  a = nbodyAccel(bodies, G, softening);
  for (let i = 0; i < bodies.length; i++) {
    bodies[i].vx += a[i].x * dt * 0.5;
    bodies[i].vy += a[i].y * dt * 0.5;
    bodies[i].vz += a[i].z * dt * 0.5;
  }
}

// Circular orbital velocity at radius r around central mass M (in sim units).
export function orbitalVel(M, r, G = 1) {
  return Math.sqrt((G * M) / Math.max(r, 1e-6));
}

// Total energy (kinetic + potential) for stability monitoring.
export function totalEnergy(bodies, G = 1, softening = 0.1) {
  let KE = 0, PE = 0;
  for (let i = 0; i < bodies.length; i++) {
    const v2 = bodies[i].vx ** 2 + bodies[i].vy ** 2 + bodies[i].vz ** 2;
    KE += 0.5 * bodies[i].mass * v2;
    for (let j = i + 1; j < bodies.length; j++) {
      const dx = bodies[j].x - bodies[i].x;
      const dy = bodies[j].y - bodies[i].y;
      const dz = bodies[j].z - bodies[i].z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + softening * softening);
      PE -= (G * bodies[i].mass * bodies[j].mass) / r;
    }
  }
  return { KE, PE, total: KE + PE };
}

// Blackbody color (Planckian locus approximation) from temperature K.
// Returns [r, g, b] in 0..1.
export function blackbodyRGB(tempK) {
  const T = tempK / 100;
  let r, g, b;
  if (T <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(T) - 161.1195681661;
    b = T <= 19 ? 0 : 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(T - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(T - 60, -0.0755148492);
    b = 255;
  }
  const clamp = (x) => Math.max(0, Math.min(255, x)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}
