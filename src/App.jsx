import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LabApp from './LabApp';

// Lazy-load the homepage so visitors who deep-link to /lab don't download landing-page code.
const HomePage = lazy(() => import('./modules/home/HomePage'));

// Tiny fallback while the homepage chunk loads — matches the dark theme so there's no flash.
const LoadingShim = () => (
  <div className="h-full w-full flex items-center justify-center" style={{ background: '#03050d' }}>
    <div className="font-mono text-[10px] tracking-[0.3em] text-[#00e5ff] opacity-60">LOADING</div>
  </div>
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <Suspense fallback={<LoadingShim />}>
              <HomePage />
            </Suspense>
          }
        />
        <Route path="/lab" element={<LabApp />} />
        {/* Any unknown path falls through to the homepage */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
