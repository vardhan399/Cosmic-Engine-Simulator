import React, { useEffect, useRef } from 'react';
import { PortalProvider } from './components/PortalTransition';
import Hero from './sections/Hero';
import Preview from './sections/Preview';
import WhatMakesDifferent from './sections/WhatMakesDifferent';
import Modules from './sections/Modules';
import FeatureDeepDive from './sections/FeatureDeepDive';
import Experience from './sections/Experience';
import TechPerformance from './sections/TechPerformance';
import Philosophy from './sections/Philosophy';
import CTA from './sections/CTA';
import Footer from './sections/Footer';

/**
 * HomePage — landing experience served at "/".
 *
 * Composition order (matches product spec — tells a story from "wow" to "why"
 * to "how" to "enter"):
 *   1. Hero                 → live solar system bg + title + CTAs
 *   2. Preview              → real-time planet with working sliders
 *   3. WhatMakesDifferent   → three value props (control / multi-scale / editable laws)
 *   4. Modules              → 5 tilt cards with per-module explanations
 *   5. FeatureDeepDive      → under-the-hood: physics engine / chaos / multi-universe
 *   6. Experience           → three reactive taglines (use cases)
 *   7. TechPerformance      → 60 fps / WebGL / procedural stats
 *   8. Philosophy           → quiet centered hook (optional but kept for gravitas)
 *   9. CTA                  → final "Enter Simulation"
 *   10. Footer              → brand + meta links
 *
 * PortalProvider must be inside Router (it uses useNavigate), so we mount
 * it here, not in App.jsx.
 */
export default function HomePage() {
  const containerRef = useRef(null);
  const starsRef = useRef(null);

  const scrollToDemo = () => {
    const el = document.getElementById('preview');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Parallax — translate the deep-star layer at half the scroll rate.
  useEffect(() => {
    const c = containerRef.current;
    const s = starsRef.current;
    if (!c || !s) return;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = c.scrollTop;
        s.style.transform = `translate3d(0, ${y * -0.25}px, 0)`;
        ticking = false;
      });
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => c.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <PortalProvider>
      <div
        ref={containerRef}
        className="relative h-full overflow-y-auto scroll-thin"
        style={{ scrollBehavior: 'smooth' }}
      >
        {/* ── DEPTH LAYER 1: deep parallax stars (CSS-only, behind everything) ── */}
        <div
          ref={starsRef}
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: '400vh',
            backgroundImage: starFieldDataUri(),
            backgroundRepeat: 'repeat',
            opacity: 0.55,
            zIndex: 0,
          }}
        />

        {/* ── DEPTH LAYER 2: faint grid for instrument-panel feel ── */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(0,229,255,0.04) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(0,229,255,0.04) 1px, transparent 1px)',
            backgroundSize: '120px 120px',
            zIndex: 1,
          }}
        />

        {/* ── DEPTH LAYER 3: actual content ── */}
        <div className="relative" style={{ zIndex: 2 }}>
          <Hero onScrollToDemo={scrollToDemo} />
          <Preview />
          <WhatMakesDifferent />
          <Modules />
          <FeatureDeepDive />
          <Experience />
          <TechPerformance />
          <Philosophy />
          <CTA />
          <Footer />
        </div>
      </div>
    </PortalProvider>
  );
}

/**
 * Generate an inline SVG starfield as a data URI — saves an HTTP request and
 * makes the stars repeatable for parallax tiling.
 */
function starFieldDataUri() {
  const stars = [];
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 800;
    const y = Math.random() * 800;
    const r = Math.random() < 0.85 ? 0.6 : 1.1;
    const a = 0.3 + Math.random() * 0.6;
    stars.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="white" opacity="${a.toFixed(2)}"/>`);
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='800' height='800'>${stars.join('')}</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}
