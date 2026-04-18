import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/**
 * useModuleScene — the single RAF + Three.js lifecycle used by every simulation module.
 *
 * factory: ({ scene, camera, renderer, controls }) => sceneHandle
 *   where sceneHandle = { update(dt, t, params), dispose() }
 *
 * params: the current Redux slice for this module; passed fresh to update() each frame.
 * deps: re-run effect when these change (typically []).
 */
export function useModuleScene(hostRef, factory, params, paused, deps = []) {
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const w = host.clientWidth, h = host.clientHeight;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 10000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x02030a, 1);
    host.appendChild(renderer.domElement);

    const controls = createOrbit(camera, renderer.domElement);
    const handle = factory({ scene, camera, renderer, controls }) || {};

    const clock = new THREE.Clock();
    let running = true;
    const loop = () => {
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      controls.update();
      if (!pausedRef.current && handle.update) {
        handle.update(dt, clock.getElapsedTime(), paramsRef.current);
      } else if (handle.render) {
        handle.render();
      }
      renderer.render(scene, camera);
      requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      const ww = host.clientWidth, hh = host.clientHeight;
      camera.aspect = ww / hh; camera.updateProjectionMatrix();
      renderer.setSize(ww, hh);
    };
    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      window.removeEventListener('resize', onResize);
      controls.dispose();
      if (handle.dispose) handle.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function createOrbit(camera, el) {
  let phi = Math.PI / 2.5, theta = 0, radius = 20;
  const target = new THREE.Vector3(0, 0, 0);
  let dragging = false, lastX = 0, lastY = 0;
  const upd = () => {
    const x = target.x + radius * Math.sin(phi) * Math.cos(theta);
    const y = target.y + radius * Math.cos(phi);
    const z = target.z + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.set(x, y, z); camera.lookAt(target);
  };
  upd();
  const onD = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
  const onU = () => { dragging = false; };
  const onM = (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    theta -= dx * 0.005;
    phi = Math.max(0.1, Math.min(Math.PI - 0.1, phi - dy * 0.005));
  };
  const onW = (e) => {
    e.preventDefault();
    radius *= 1 + Math.sign(e.deltaY) * 0.08;
    radius = Math.max(2, Math.min(500, radius));
  };
  const onTS = (e) => { if (e.touches.length === 1) { dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; } };
  const onTM = (e) => { if (dragging && e.touches.length === 1) onM({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); };

  el.addEventListener('mousedown', onD);
  el.addEventListener('mouseup', onU);
  el.addEventListener('mouseleave', onU);
  el.addEventListener('mousemove', onM);
  el.addEventListener('wheel', onW, { passive: false });
  el.addEventListener('touchstart', onTS);
  el.addEventListener('touchend', onU);
  el.addEventListener('touchmove', onTM);

  return {
    update: upd,
    setRadius: (r) => { radius = r; },
    setTarget: (v) => { target.copy(v); },
    dispose() {
      el.removeEventListener('mousedown', onD);
      el.removeEventListener('mouseup', onU);
      el.removeEventListener('mouseleave', onU);
      el.removeEventListener('mousemove', onM);
      el.removeEventListener('wheel', onW);
      el.removeEventListener('touchstart', onTS);
      el.removeEventListener('touchend', onU);
      el.removeEventListener('touchmove', onTM);
    },
  };
}
