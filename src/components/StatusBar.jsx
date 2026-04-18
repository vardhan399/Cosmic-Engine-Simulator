import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';

export default function StatusBar() {
  const state = useSelector((s) => s.universe);
  const [fps, setFps] = useState(60);

  useEffect(() => {
    let frames = 0, last = performance.now();
    let raf;
    const tick = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0; last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <footer className="glass flex items-center justify-between px-4 py-1.5 mx-3 mb-3 font-mono text-[10px] text-[#8b93b8] tracking-widest">
      <div className="flex gap-4">
        <span>MODULE: <span className="text-[#00e5ff]">{state.activeModule.toUpperCase()}</span></span>
        <span>PHILOSOPHY: <span className="text-[#a855f7]">{state.philosophy.toUpperCase()}</span></span>
        <span>STATE: <span className={state.paused ? 'text-[#ffb347]' : 'text-[#58f5a0]'}>{state.paused ? 'PAUSED' : 'RUNNING'}</span></span>
      </div>
      <div className="flex gap-4">
        <span>FPS: <span className="text-[#00e5ff]">{fps}</span></span>
        <span>SHORTCUTS: <span className="text-[#e8ecff]">SPACE · 1-5 · R</span></span>
      </div>
    </footer>
  );
}
