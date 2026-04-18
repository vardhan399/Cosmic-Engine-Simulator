import React from 'react';

const base = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };

// Concentric rings — structure
export const StructureIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

// Wave + clouds — atmosphere
export const AtmosphereIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 12c2-3 5-3 7 0s5 3 7 0 4-2 4-2" />
    <path d="M3 8c2-3 5-3 7 0s5 3 7 0 4-2 4-2" opacity="0.5" />
  </svg>
);

// Mountain + water — surface
export const SurfaceIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M3 18l5-7 4 5 4-3 5 5" />
    <line x1="3" y1="20" x2="21" y2="20" />
  </svg>
);

// Star — stellar context
export const StarIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3" fill="currentColor" />
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
    <line x1="4.9" y1="4.9" x2="6.9" y2="6.9" />
    <line x1="17.1" y1="17.1" x2="19.1" y2="19.1" />
    <line x1="4.9" y1="19.1" x2="6.9" y2="17.1" />
    <line x1="17.1" y1="6.9" x2="19.1" y2="4.9" />
  </svg>
);

// Orbit — moon system
export const OrbitIcon = (p) => (
  <svg {...base} {...p}>
    <ellipse cx="12" cy="12" rx="9" ry="4" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <circle cx="21" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

// Eye — view toggle
export const ViewIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </svg>
);

// Ring — saturn-like
export const RingIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="3.5" fill="currentColor" />
    <ellipse cx="12" cy="12" rx="10" ry="3" />
  </svg>
);

// Lightning — chaos
export const ChaosIcon = (p) => (
  <svg {...base} {...p}>
    <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" fill="currentColor" stroke="none" />
  </svg>
);

// Clock — time
export const TimeIcon = (p) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

// Dice — random
export const DiceIcon = (p) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8" cy="8" r="1.2" fill="currentColor" />
    <circle cx="16" cy="8" r="1.2" fill="currentColor" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    <circle cx="8" cy="16" r="1.2" fill="currentColor" />
    <circle cx="16" cy="16" r="1.2" fill="currentColor" />
  </svg>
);
